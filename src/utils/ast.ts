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
					imported: { name: localName, type: 'Identifier' },
					local: { name: localName, type: 'Identifier' },
					type: 'ImportSpecifier',
				},
			]
		: [
				{
					local: { name: localName, type: 'Identifier' },
					type: 'ImportDefaultSpecifier',
				},
			]

	return {
		body: [
			{
				source: { type: 'Literal', value: importPath },
				specifiers,
				type: 'ImportDeclaration',
			},
		],
		sourceType: 'module',
		type: 'Program',
	}
}

/**
 * TODO JSDoc description
 */
export function createEsmImportNode(
	localName: string,
	importPath: string,
	isNamed: boolean,
): MdxjsEsm {
	const value = isNamed
		? `import { ${localName} } from ${JSON.stringify(importPath)}`
		: `import ${localName} from ${JSON.stringify(importPath)}`

	return {
		data: { estree: createImportEstree(localName, importPath, isNamed) },
		type: 'mdxjsEsm',
		value,
	}
}

/**
 * Create an `export const components = { ... }` node.
 * @param mappings - Map of element names to local component identifiers.
 */
export function createComponentsExportNode(mappings: Record<string, string>): MdxjsEsm {
	const properties: Property[] = Object.entries(mappings).map(([key, value]) => ({
		computed: false,
		key: { name: key, type: 'Identifier' },
		kind: 'init',
		method: false,
		shorthand: false,
		type: 'Property',
		value: { name: value, type: 'Identifier' },
	}))

	const estree: Program = {
		body: [
			{
				declaration: {
					declarations: [
						{
							id: { name: 'components', type: 'Identifier' },
							init: { properties, type: 'ObjectExpression' },
							type: 'VariableDeclarator',
						},
					],
					kind: 'const',
					type: 'VariableDeclaration',
				},
				source: null,
				specifiers: [],
				type: 'ExportNamedDeclaration',
			},
		],
		sourceType: 'module',
		type: 'Program',
	}

	const entries = Object.entries(mappings)
		.map(([k, v]) => `${k}: ${v}`)
		.join(', ')

	return {
		data: { estree },
		type: 'mdxjsEsm',
		value: `export const components = { ${entries} }`,
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

		const { declaration } = statement
		if (declaration?.type !== 'VariableDeclaration') continue

		for (const declarator of declaration.declarations) {
			if (declarator.id.type !== 'Identifier' || declarator.id.name !== 'components') continue

			const newProperties: Array<Property | SpreadElement> = Object.entries(mappings).map(
				([key, value]) => ({
					computed: false,
					key: { name: key, type: 'Identifier' as const },
					kind: 'init' as const,
					method: false,
					shorthand: false,
					type: 'Property' as const,
					value: { name: value, type: 'Identifier' as const },
				}),
			)

			if (declarator.init?.type === 'ObjectExpression') {
				declarator.init.properties = [...newProperties, ...declarator.init.properties]
			} else {
				// Wrap non-object expression: { ...ours, ...existingExpr }
				const existingSpread: SpreadElement[] = declarator.init
					? [{ argument: declarator.init as Expression, type: 'SpreadElement' }]
					: []
				declarator.init = {
					properties: [...newProperties, ...existingSpread],
					type: 'ObjectExpression',
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

/**
 * Unused at the moment?
 * @public
 */
export function createExpressionAttributeValue(identifier: string): MdxJsxAttribute['value'] {
	return {
		data: {
			estree: {
				body: [
					{
						expression: { name: identifier, type: 'Identifier' },
						type: 'ExpressionStatement',
					},
				],
				sourceType: 'module',
				type: 'Program',
			},
		},
		type: 'mdxJsxAttributeValueExpression',
		value: identifier,
	}
}

/**
 * TODO JSDoc description
 */
export function createStringAttribute(name: string, value: string): MdxJsxAttribute {
	return { name, type: 'mdxJsxAttribute', value }
}

/**
 * TODO JSDoc description
 */
export function createExpressionAttribute(name: string, identifier: string): MdxJsxAttribute {
	return {
		name,
		type: 'mdxJsxAttribute',
		value: createExpressionAttributeValue(identifier),
	}
}

/**
 * TODO JSDoc description
 */
export function createJsxFlowElement(
	name: string,
	attributes: MdxJsxAttribute[],
	children: RootContent[],
): MdxJsxFlowElement {
	return {
		attributes,
		children,
		name,
		type: 'mdxJsxFlowElement',
	}
}

/**
 * TODO JSDoc description
 */
export function createJsxTextElement(
	name: string,
	attributes: MdxJsxAttribute[],
	children: RootContent[],
): MdxJsxTextElement {
	return {
		attributes,
		children,
		name,
		type: 'mdxJsxTextElement',
	}
}
