/// <reference types="mdast-util-mdx-jsx" />
/// <reference types="mdast-util-mdxjs-esm" />

import type {
	ExportNamedDeclaration,
	Expression,
	ImportDeclaration,
	Program,
	Property,
	SpreadElement,
} from 'estree'
import type { RootContent } from 'mdast'
import type { MdxJsxAttribute, MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx'
import type { MdxjsEsm } from 'mdast-util-mdxjs-esm'

// ---------------------------------------------------------------------------
// ESM import / export nodes
// ---------------------------------------------------------------------------

function createImportEstree(localName: string, importPath: string, isNamed: boolean): Program {
	const specifiers: ImportDeclaration['specifiers'] = isNamed
		? [
				{
					type: 'ImportSpecifier',
					imported: { type: 'Identifier', name: localName },
					local: { type: 'Identifier', name: localName },
				},
			]
		: [
				{
					type: 'ImportDefaultSpecifier',
					local: { type: 'Identifier', name: localName },
				},
			]

	return {
		type: 'Program',
		sourceType: 'module',
		body: [
			{
				type: 'ImportDeclaration',
				specifiers,
				source: { type: 'Literal', value: importPath },
			},
		],
	}
}

export function createEsmImportNode(
	localName: string,
	importPath: string,
	isNamed: boolean,
): MdxjsEsm {
	const value = isNamed
		? `import { ${localName} } from ${JSON.stringify(importPath)}`
		: `import ${localName} from ${JSON.stringify(importPath)}`

	return {
		type: 'mdxjsEsm',
		value,
		data: { estree: createImportEstree(localName, importPath, isNamed) },
	}
}

/**
 * Create an `export const components = { ... }` node.
 *
 * @param mappings - Map of element names to local component identifiers.
 */
export function createComponentsExportNode(mappings: Record<string, string>): MdxjsEsm {
	const properties: Property[] = Object.entries(mappings).map(([key, value]) => ({
		type: 'Property',
		key: { type: 'Identifier', name: key },
		value: { type: 'Identifier', name: value },
		kind: 'init',
		method: false,
		shorthand: false,
		computed: false,
	}))

	const estree: Program = {
		type: 'Program',
		sourceType: 'module',
		body: [
			{
				type: 'ExportNamedDeclaration',
				declaration: {
					type: 'VariableDeclaration',
					kind: 'const',
					declarations: [
						{
							type: 'VariableDeclarator',
							id: { type: 'Identifier', name: 'components' },
							init: { type: 'ObjectExpression', properties },
						},
					],
				},
				specifiers: [],
				source: null,
			},
		],
	}

	const entries = Object.entries(mappings)
		.map(([k, v]) => `${k}: ${v}`)
		.join(', ')

	return {
		type: 'mdxjsEsm',
		value: `export const components = { ${entries} }`,
		data: { estree },
	}
}

/**
 * Merge additional component mappings into an existing
 * `export const components = { ... }` ESTree declaration.
 *
 * Our entries are prepended so that user-defined entries (later in the
 * object) take precedence in the case of duplicate keys.
 *
 * Returns `true` if the merge succeeded.
 */
export function mergeIntoComponentsExport(
	node: MdxjsEsm,
	mappings: Record<string, string>,
): boolean {
	const estree = node.data?.estree
	if (!estree) return false

	for (const statement of estree.body) {
		if (statement.type !== 'ExportNamedDeclaration') continue

		const declaration = (statement as ExportNamedDeclaration).declaration
		if (!declaration || declaration.type !== 'VariableDeclaration') continue

		for (const declarator of declaration.declarations) {
			if (declarator.id.type !== 'Identifier' || declarator.id.name !== 'components') continue

			const newProperties: (Property | SpreadElement)[] = Object.entries(mappings).map(
				([key, value]) => ({
					type: 'Property' as const,
					key: { type: 'Identifier' as const, name: key },
					value: { type: 'Identifier' as const, name: value },
					kind: 'init' as const,
					method: false,
					shorthand: false,
					computed: false,
				}),
			)

			if (declarator.init?.type === 'ObjectExpression') {
				declarator.init.properties = [...newProperties, ...declarator.init.properties]
			} else {
				// Wrap non-object expression: { ...ours, ...existingExpr }
				const existingSpread: SpreadElement[] = declarator.init
					? [{ type: 'SpreadElement', argument: declarator.init as Expression }]
					: []
				declarator.init = {
					type: 'ObjectExpression',
					properties: [...newProperties, ...existingSpread],
				}
			}

			return true
		}
	}

	return false
}

// ---------------------------------------------------------------------------
// MDX JSX element / attribute nodes
// ---------------------------------------------------------------------------

export function createExpressionAttributeValue(identifier: string): MdxJsxAttribute['value'] {
	return {
		type: 'mdxJsxAttributeValueExpression',
		value: identifier,
		data: {
			estree: {
				type: 'Program',
				sourceType: 'module',
				body: [
					{
						type: 'ExpressionStatement',
						expression: { type: 'Identifier', name: identifier },
					},
				],
			},
		},
	}
}

export function createStringAttribute(name: string, value: string): MdxJsxAttribute {
	return { type: 'mdxJsxAttribute', name, value }
}

export function createExpressionAttribute(name: string, identifier: string): MdxJsxAttribute {
	return {
		type: 'mdxJsxAttribute',
		name,
		value: createExpressionAttributeValue(identifier),
	}
}

export function createJsxFlowElement(
	name: string,
	attributes: MdxJsxAttribute[],
	children: RootContent[],
): MdxJsxFlowElement {
	return {
		type: 'mdxJsxFlowElement',
		name,
		attributes,
		children,
	}
}

export function createJsxTextElement(
	name: string,
	attributes: MdxJsxAttribute[],
	children: RootContent[],
): MdxJsxTextElement {
	return {
		type: 'mdxJsxTextElement',
		name,
		attributes,
		children,
	}
}
