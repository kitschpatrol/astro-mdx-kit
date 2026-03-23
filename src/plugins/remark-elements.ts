/// <reference types="mdast-util-directive" />
/// <reference types="mdast-util-mdx-jsx" />
/// <reference types="mdast-util-mdxjs-esm" />

import type { Image, Root } from 'mdast'
import type { MdxJsxAttribute, MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx'
import type { MdxjsEsm } from 'mdast-util-mdxjs-esm'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'
import type { ResolvedComponentConfig } from '../utils/resolve-config.js'
import { log } from '../log.js'
import {
	createComponentsExportNode,
	createExpressionAttribute,
	createJsxFlowElement,
	createStringAttribute,
	mergeIntoComponentsExport,
} from '../utils/ast.js'
import { ImportTracker, isImportablePath } from '../utils/imports.js'

export type RemarkElementsOptions = {
	configs: Record<string, ResolvedComponentConfig>
}

/**
 * Remark plugin that maps HTML elements to custom components.
 *
 * - Elements **without** `autoImport` use MDX's `export const components`
 *   mechanism, which handles all rendering of that element type.
 * - Elements **with** `autoImport` use direct AST transformation so that
 *   prop values (e.g. image `src`) can be converted to ESM imports.
 */
export const remarkMdxKitElements: Plugin<[RemarkElementsOptions], Root> = (options) => {
	const { configs } = options

	// Split configs into simple overrides vs auto-import overrides
	const simpleOverrides: Record<string, ResolvedComponentConfig> = {}
	const autoImportOverrides: Record<string, ResolvedComponentConfig> = {}

	for (const [element, config] of Object.entries(configs)) {
		if (config.autoImport) {
			autoImportOverrides[element] = config
		} else {
			simpleOverrides[element] = config
		}
	}

	return (tree: Root) => {
		const imports = new ImportTracker()

		// -----------------------------------------------------------------
		// 1. Handle elements with autoImport via direct AST transformation
		// -----------------------------------------------------------------
		for (const [element, config] of Object.entries(autoImportOverrides)) {
			imports.addComponentImport(config.componentName, config.importPath, config.isNamedImport)

			log.debug(`Transforming <${element}> → <${config.componentName}> (with autoImport)`)

			// Transform MDAST nodes for known element types
			if (element === 'img') {
				transformImageNodes(tree, config, imports)
			}

			// Transform raw JSX elements: <img ...> → <Picture ...>
			transformJsxElements(tree, element, config, imports)
		}

		// -----------------------------------------------------------------
		// 2. Handle simple element overrides via export const components
		// -----------------------------------------------------------------
		if (Object.keys(simpleOverrides).length > 0) {
			const componentsMappings: Record<string, string> = {}

			for (const [element, config] of Object.entries(simpleOverrides)) {
				imports.addComponentImport(config.componentName, config.importPath, config.isNamedImport)
				componentsMappings[element] = config.componentName
			}

			injectComponentsExport(tree, componentsMappings)
		}

		// -----------------------------------------------------------------
		// 3. Inject all collected imports
		// -----------------------------------------------------------------
		imports.injectIntoTree(tree)
	}
}

// ---------------------------------------------------------------------------
// Image node transformation (![alt](src))
// ---------------------------------------------------------------------------

function transformImageNodes(
	tree: Root,
	config: ResolvedComponentConfig,
	imports: ImportTracker,
): void {
	const { autoImport } = config
	if (!autoImport) return

	const { toProp } = autoImport

	// Collect replacements first to avoid visiting newly created nodes
	const replacements: Array<{
		index: number
		node: Image
		parent: Parameters<Parameters<typeof visit>[1]>[2]
	}> = []

	visit(tree, 'image', (node: Image, index, parent) => {
		if (index === undefined || !parent) return
		replacements.push({ index, node, parent })
	})

	for (const { index, node, parent } of replacements) {
		const attributes: MdxJsxAttribute[] = []

		if (isImportablePath(node.url)) {
			const importId = imports.addAssetImport(node.url)
			attributes.push(createExpressionAttribute(toProp, importId))
		} else {
			attributes.push(createStringAttribute(toProp, node.url))
		}

		if (node.alt) {
			attributes.push(createStringAttribute('alt', node.alt))
		}

		if (node.title) {
			attributes.push(createStringAttribute('title', node.title))
		}

		const jsx = createJsxFlowElement(config.componentName, attributes, [])
		parent.children[index] = jsx as (typeof parent.children)[number]
	}
}

// ---------------------------------------------------------------------------
// JSX element renaming (handles <img> / <a> / etc. written in MDX)
// ---------------------------------------------------------------------------

function transformJsxElements(
	tree: Root,
	elementName: string,
	config: ResolvedComponentConfig,
	imports: ImportTracker,
): void {
	visit(tree, (node) => {
		if (node.type !== 'mdxJsxFlowElement' && node.type !== 'mdxJsxTextElement') return

		const jsxNode = node
		if (jsxNode.name !== elementName) return

		// Rename element to component
		jsxNode.name = config.componentName

		// Handle autoImport on JSX attributes
		if (config.autoImport) {
			const { fromProp, toProp } = config.autoImport

			for (const attribute of jsxNode.attributes) {
				if (attribute.type !== 'mdxJsxAttribute' || attribute.name !== fromProp) continue
				if (typeof attribute.value !== 'string' || !isImportablePath(attribute.value)) continue

				const importId = imports.addAssetImport(attribute.value)
				attribute.name = toProp
				attribute.value = {
					data: {
						estree: {
							body: [
								{
									expression: { name: importId, type: 'Identifier' },
									type: 'ExpressionStatement',
								},
							],
							sourceType: 'module',
							type: 'Program',
						},
					},
					type: 'mdxJsxAttributeValueExpression',
					value: importId,
				}
			}
		}
	})
}

// ---------------------------------------------------------------------------
// export const components = { ... }
// ---------------------------------------------------------------------------

function injectComponentsExport(tree: Root, mappings: Record<string, string>): void {
	// Try to merge into an existing `export const components`
	for (const child of tree.children) {
		if (child.type !== 'mdxjsEsm') continue
		if (mergeIntoComponentsExport(child, mappings)) return
	}

	// No existing export found — create one
	const exportNode = createComponentsExportNode(mappings)
	tree.children.push(exportNode as unknown as Root['children'][number])
}
