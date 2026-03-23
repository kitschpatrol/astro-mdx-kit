import type { ExportNamedDeclaration, ImportDeclaration } from 'estree'
import { describe, expect, it } from 'vitest'
import {
	createComponentsExportNode,
	createEsmImportNode,
	createExpressionAttribute,
	createJsxFlowElement,
	createStringAttribute,
	mergeIntoComponentsExport,
} from '../src/utils/ast'

function asImportDeclaration(
	program: NonNullable<ReturnType<typeof createEsmImportNode>['data']>['estree'],
	index = 0,
): ImportDeclaration {
	const statement = program!.body[index]
	if (statement === undefined) {
		throw new Error(`Expected ImportDeclaration, got ${statement}`)
	}
	if (statement.type !== 'ImportDeclaration')
		throw new Error(`Expected ImportDeclaration, got ${statement.type}`)
	return statement
}

function asExportNamedDeclaration(
	program: NonNullable<ReturnType<typeof createEsmImportNode>['data']>['estree'],
	index = 0,
): ExportNamedDeclaration {
	const statement = program!.body[index]
	if (statement === undefined) {
		throw new Error(`Expected ImportDeclaration, got ${statement}`)
	}
	if (statement.type !== 'ExportNamedDeclaration')
		throw new Error(`Expected ExportNamedDeclaration, got ${statement.type}`)
	return statement
}

describe('createEsmImportNode', () => {
	it('creates a default import', () => {
		const node = createEsmImportNode('Foo', '/src/Foo.astro', false)
		expect(node.type).toBe('mdxjsEsm')
		expect(node.value).toBe('import Foo from "/src/Foo.astro"')

		const estree = node.data!.estree!
		expect(estree.body).toHaveLength(1)

		const declaration = asImportDeclaration(estree)

		expect(declaration.specifiers.at(0)?.type).toBe('ImportDefaultSpecifier')
		expect(declaration.specifiers.at(0)?.local.name).toBe('Foo')
		expect(declaration.source.value).toBe('/src/Foo.astro')
	})

	it('creates a named import', () => {
		const node = createEsmImportNode('Picture', 'astro:assets', true)
		expect(node.value).toBe('import { Picture } from "astro:assets"')

		const declaration = asImportDeclaration(node.data!.estree)
		expect(declaration.specifiers.at(0)?.type).toBe('ImportSpecifier')
	})
})

describe('createComponentsExportNode', () => {
	it('creates an export const components node', () => {
		const node = createComponentsExportNode({ h1: '_Comp_H1', h2: '_Comp_H2' })
		expect(node.type).toBe('mdxjsEsm')
		expect(node.value).toContain('export const components')
		expect(node.value).toContain('h1: _Comp_H1')
		expect(node.value).toContain('h2: _Comp_H2')

		const statement = asExportNamedDeclaration(node.data!.estree)
		expect(statement.type).toBe('ExportNamedDeclaration')
		expect(statement.declaration?.type).toBe('VariableDeclaration')
	})
})

describe('mergeIntoComponentsExport', () => {
	it('prepends properties to an existing ObjectExpression', () => {
		const existing = createComponentsExportNode({ p: '_UserP' })
		const result = mergeIntoComponentsExport(existing, { h1: '_Kit_H1' })
		expect(result).toBe(true)

		const statement = asExportNamedDeclaration(existing.data!.estree)
		const { declaration } = statement
		if (declaration?.type !== 'VariableDeclaration') throw new Error('Expected VariableDeclaration')
		const someDeclaration = declaration.declarations.at(0)

		expect(someDeclaration?.init?.type).toBe('ObjectExpression')
		if (someDeclaration?.init?.type === 'ObjectExpression') {
			expect(someDeclaration.init.properties).toHaveLength(2)
		}
	})

	it('returns false if no components export found', () => {
		const importNode = createEsmImportNode('Foo', './foo', false)
		const result = mergeIntoComponentsExport(importNode, { h1: '_H1' })
		expect(result).toBe(false)
	})
})

describe('JSX attribute helpers', () => {
	it('creates a string attribute', () => {
		const attribute = createStringAttribute('alt', 'An image')
		expect(attribute).toEqual({
			name: 'alt',
			type: 'mdxJsxAttribute',
			value: 'An image',
		})
	})

	it('creates an expression attribute', () => {
		const attribute = createExpressionAttribute('src', '_img0')
		expect(attribute.type).toBe('mdxJsxAttribute')
		expect(attribute.name).toBe('src')
		expect(attribute.value).toHaveProperty('type', 'mdxJsxAttributeValueExpression')
	})
})

describe('createJsxFlowElement', () => {
	it('creates a flow element with attributes and children', () => {
		const element = createJsxFlowElement('MyComponent', [createStringAttribute('foo', 'bar')], [])
		expect(element.type).toBe('mdxJsxFlowElement')
		expect(element.name).toBe('MyComponent')
		expect(element.attributes).toHaveLength(1)
		expect(element.children).toHaveLength(0)
	})
})
