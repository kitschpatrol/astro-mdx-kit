/* eslint-disable unicorn/no-null */
/* eslint-disable ts/triple-slash-reference */

/// <reference types="mdast-util-mdx-jsx" />
/// <reference types="mdast-util-mdxjs-esm" />

import type { Expression, ImportDeclaration, Program, Property, SpreadElement } from 'estree'
import type { PhrasingContent } from 'mdast'
import type { MdxJsxAttribute, MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx'
import type { MdxjsEsm } from 'mdast-util-mdxjs-esm'
import type { Node } from 'unist'

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
				attributes: [],
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
 * Create an `mdxjsEsm` AST node representing an ESM import statement.
 *
 * Produces either `import { localName } from '...'` (named) or
 * `import localName from '...'` (default) depending on `isNamed`.
 * @param localName - The local identifier for the imported binding.
 * @param importPath - The module specifier string.
 * @param isNamed - Whether to emit a named import (`true`) or default import (`false`).
 * @returns An `MdxjsEsm` node with both a `value` string and an `estree` AST.
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
 * Create an `mdxjsEsm` AST node for `export const components = { ... }`.
 *
 * This is the standard MDX mechanism for overriding HTML elements with
 * custom components. The generated node contains both the serialized
 * `value` string and a full ESTree `estree` program.
 * @param mappings - Map of HTML element names to their local component identifiers
 *   (e.g. `{ img: 'Picture', h1: '_MdxKit_H1' }`).
 * @returns An `MdxjsEsm` node.
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
				attributes: [],
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
 * New entries are prepended so that user-defined entries (later in the
 * object) take precedence in the case of duplicate keys.
 * @param node - An existing `mdxjsEsm` node that may contain a `components` export.
 * @param mappings - Map of HTML element names to their local component identifiers.
 * @returns `true` if a matching `components` export was found and merged into, `false` otherwise.
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
 * Create an MDX JSX expression attribute value wrapping an identifier reference.
 *
 * Produces a `mdxJsxAttributeValueExpression` node equivalent to `{identifier}`
 * in JSX syntax, with a backing ESTree expression.
 * @param identifier - The identifier name to reference (e.g. an imported asset variable).
 * @returns An attribute value node suitable for use in {@link MdxJsxAttribute}.
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
 * Create a string-valued MDX JSX attribute (e.g. `alt="photo"`).
 * @param name - The attribute name.
 * @param value - The string value.
 */
export function createStringAttribute(name: string, value: string): MdxJsxAttribute {
	return { name, type: 'mdxJsxAttribute', value }
}

/**
 * Create an expression-valued MDX JSX attribute referencing an identifier
 * (e.g. `src={_mdxKitAsset0}`).
 * @param name - The attribute name.
 * @param identifier - The identifier to reference as the attribute value.
 */
export function createExpressionAttribute(name: string, identifier: string): MdxJsxAttribute {
	return {
		name,
		type: 'mdxJsxAttribute',
		value: createExpressionAttributeValue(identifier),
	}
}

/**
 * Create a block-level (`mdxJsxFlowElement`) MDX JSX element node.
 * @param name - The component or element name (e.g. `'Picture'`, `'figure'`).
 * @param attributes - JSX attributes for the element.
 * @param children - Child AST nodes. Accepts `Node[]` for flexibility since JSX elements
 *   can contain any mix of block, phrasing, or image content at runtime.
 */
export function createJsxFlowElement(
	name: string,
	attributes: MdxJsxAttribute[],
	children: Node[],
): MdxJsxFlowElement {
	// Children type is widened to Node[] because JSX elements can contain
	// any mix of block, phrasing, or image content at runtime.
	const element: MdxJsxFlowElement = {
		attributes,
		// eslint-disable-next-line ts/no-unsafe-type-assertion -- Node[] is safe at runtime; narrow MDAST types are overly strict
		children: children as MdxJsxFlowElement['children'],
		name,
		type: 'mdxJsxFlowElement',
	}
	return element
}

/**
 * Create an inline (`mdxJsxTextElement`) MDX JSX element node.
 * @param name - The component or element name.
 * @param attributes - JSX attributes for the element.
 * @param children - Inline (phrasing) child AST nodes.
 */
export function createJsxTextElement(
	name: string,
	attributes: MdxJsxAttribute[],
	children: PhrasingContent[],
): MdxJsxTextElement {
	return {
		attributes,
		children,
		name,
		type: 'mdxJsxTextElement',
	}
}
