import { describe, expect, it } from 'vitest'
import {
	createComponentsExportNode,
	createEsmImportNode,
	createExpressionAttribute,
	createJsxFlowElement,
	createStringAttribute,
	mergeIntoComponentsExport,
} from '../src/utils/ast'

describe('createEsmImportNode', () => {
	it('creates a default import', () => {
		const node = createEsmImportNode('Foo', '/src/Foo.astro', false)
		expect(node.type).toBe('mdxjsEsm')
		expect(node.value).toBe('import Foo from "/src/Foo.astro"')

		const estree = node.data!.estree!
		expect(estree.body).toHaveLength(1)
		expect(estree.body[0].type).toBe('ImportDeclaration')

		const decl = estree.body[0] as import('estree').ImportDeclaration
		expect(decl.specifiers[0].type).toBe('ImportDefaultSpecifier')
		expect(decl.specifiers[0].local.name).toBe('Foo')
		expect((decl.source as import('estree').Literal).value).toBe('/src/Foo.astro')
	})

	it('creates a named import', () => {
		const node = createEsmImportNode('Picture', 'astro:assets', true)
		expect(node.value).toBe('import { Picture } from "astro:assets"')

		const decl = node.data!.estree!.body[0] as import('estree').ImportDeclaration
		expect(decl.specifiers[0].type).toBe('ImportSpecifier')
	})
})

describe('createComponentsExportNode', () => {
	it('creates an export const components node', () => {
		const node = createComponentsExportNode({ h1: '_Comp_H1', h2: '_Comp_H2' })
		expect(node.type).toBe('mdxjsEsm')
		expect(node.value).toContain('export const components')
		expect(node.value).toContain('h1: _Comp_H1')
		expect(node.value).toContain('h2: _Comp_H2')

		const stmt = node.data!.estree!.body[0] as import('estree').ExportNamedDeclaration
		expect(stmt.type).toBe('ExportNamedDeclaration')

		const decl = stmt.declaration as import('estree').VariableDeclaration
		expect(decl.declarations[0].id).toEqual({ type: 'Identifier', name: 'components' })
	})
})

describe('mergeIntoComponentsExport', () => {
	it('prepends properties to an existing ObjectExpression', () => {
		const existing = createComponentsExportNode({ p: '_UserP' })
		const result = mergeIntoComponentsExport(existing, { h1: '_Kit_H1' })
		expect(result).toBe(true)

		const stmt = existing.data!.estree!.body[0] as import('estree').ExportNamedDeclaration
		const decl = stmt.declaration as import('estree').VariableDeclaration
		const init = decl.declarations[0].init as import('estree').ObjectExpression

		// Our property should be first, user's second
		expect(init.properties).toHaveLength(2)
		const first = init.properties[0] as import('estree').Property
		const second = init.properties[1] as import('estree').Property
		expect((first.key as import('estree').Identifier).name).toBe('h1')
		expect((second.key as import('estree').Identifier).name).toBe('p')
	})

	it('returns false if no components export found', () => {
		const importNode = createEsmImportNode('Foo', './foo', false)
		const result = mergeIntoComponentsExport(importNode, { h1: '_H1' })
		expect(result).toBe(false)
	})
})

describe('JSX attribute helpers', () => {
	it('creates a string attribute', () => {
		const attr = createStringAttribute('alt', 'An image')
		expect(attr).toEqual({
			type: 'mdxJsxAttribute',
			name: 'alt',
			value: 'An image',
		})
	})

	it('creates an expression attribute', () => {
		const attr = createExpressionAttribute('src', '_img0')
		expect(attr.type).toBe('mdxJsxAttribute')
		expect(attr.name).toBe('src')
		expect(attr.value).toHaveProperty('type', 'mdxJsxAttributeValueExpression')

		const value = attr.value as { data: { estree: { body: Array<{ expression: { name: string } }> } } }
		expect(value.data.estree.body[0].expression.name).toBe('_img0')
	})
})

describe('createJsxFlowElement', () => {
	it('creates a flow element with attributes and children', () => {
		const el = createJsxFlowElement(
			'MyComponent',
			[createStringAttribute('foo', 'bar')],
			[{ type: 'text', value: 'hello' } as never],
		)
		expect(el.type).toBe('mdxJsxFlowElement')
		expect(el.name).toBe('MyComponent')
		expect(el.attributes).toHaveLength(1)
		expect(el.children).toHaveLength(1)
	})
})
