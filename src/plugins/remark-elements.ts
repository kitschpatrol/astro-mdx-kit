/* eslint-disable ts/triple-slash-reference */

/// <reference types="mdast-util-directive" />
/// <reference types="mdast-util-mdx-jsx" />
/// <reference types="mdast-util-mdxjs-esm" />

import type { Image, Parent as MdastParent, Root } from 'mdast'
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import type { Plugin } from 'unified'
import type { Parent } from 'unist'
import { SKIP, visit } from 'unist-util-visit'
import type { ResolvedComponentConfig } from '../utils/resolve-config.js'
import { log } from '../log.js'
import {
	createComponentsExportNode,
	createExpressionAttribute,
	createExpressionAttributeValue,
	createJsxFlowElement,
	createStringAttribute,
	mergeIntoComponentsExport,
} from '../utils/ast.js'
import { buildCaptionReplacement, extractCaptionNodes } from '../utils/caption.js'
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
/**
 * Create the tree transformer for element-to-component conversion.
 * Exported separately from the Plugin wrapper for direct use in tests.
 */
export function createElementTransform(options: RemarkElementsOptions): (tree: Root) => void {
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

/**
 * Remark plugin that maps HTML elements to custom components.
 */
export const remarkMdxKitElements: Plugin<[RemarkElementsOptions], Root> = (options) =>
	createElementTransform(options)

// ---------------------------------------------------------------------------
// Image node transformation (![alt](src))
// ---------------------------------------------------------------------------

function buildImageJsxElement(
	node: Image,
	config: ResolvedComponentConfig,
	imports: ImportTracker,
): MdxJsxFlowElement {
	const { autoImport } = config
	const attributes: MdxJsxAttribute[] = []

	if (autoImport) {
		const { fromProp, toProp } = autoImport
		if (isImportablePath(node.url)) {
			const importId = imports.addAssetImport(node.url)
			attributes.push(createExpressionAttribute(toProp, importId))
			if (fromProp !== toProp) {
				attributes.push(createStringAttribute(fromProp, node.url))
			}
		} else {
			attributes.push(createStringAttribute(toProp, node.url))
		}
	}

	if (node.alt) {
		attributes.push(createStringAttribute('alt', node.alt))
	}

	if (node.title) {
		attributes.push(createStringAttribute('title', node.title))
	}

	return createJsxFlowElement(config.componentName, attributes, [])
}

function transformImageNodes(
	tree: Root,
	config: ResolvedComponentConfig,
	imports: ImportTracker,
): void {
	// Pre-scan: identify paragraphs with multiple images (skip caption for those)
	const multiImageParagraphs = new WeakSet<MdastParent>()
	if (config.caption) {
		visit(tree, 'paragraph', (node) => {
			const imageCount = node.children.filter((child) => child.type === 'image').length
			if (imageCount > 1) {
				multiImageParagraphs.add(node)
			}
		})
	}

	// Collect paragraph-level replacements for caption mode (mark-and-sweep)
	const paragraphReplacements = new Map<MdastParent, MdxJsxFlowElement>()

	visit(tree, 'image', (node: Image, index, parent) => {
		if (index === undefined || !parent) return SKIP

		const imageJsx = buildImageJsxElement(node, config, imports)

		if (!config.caption || multiImageParagraphs.has(parent)) {
			// No caption mode or multi-image paragraph — replace image in-place
			;(parent as Parent).children[index] = imageJsx
			return SKIP
		}

		const captionNodes = extractCaptionNodes(parent, index)

		if (captionNodes.length === 0) {
			// No caption content — just replace image in-place
			;(parent as Parent).children[index] = imageJsx
			return SKIP
		}

		// Schedule paragraph-level replacement
		paragraphReplacements.set(
			parent,
			buildCaptionReplacement(config.caption, imageJsx, captionNodes),
		)
		return SKIP
	})

	// Second pass: replace paragraphs that have captions
	if (paragraphReplacements.size > 0) {
		visit(tree, 'paragraph', (node, index, parent) => {
			if (index === undefined || !parent) return
			const replacement = paragraphReplacements.get(node)
			if (!replacement) return
			;(parent as Parent).children[index] = replacement
			return SKIP
		})
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

		if (node.name !== elementName) return

		// Rename element to component
		node.name = config.componentName

		// Handle autoImport on JSX attributes
		if (config.autoImport) {
			const { fromProp, toProp } = config.autoImport

			for (const attribute of node.attributes) {
				if (attribute.type !== 'mdxJsxAttribute' || attribute.name !== fromProp) continue
				if (typeof attribute.value !== 'string' || !isImportablePath(attribute.value)) continue

				const originalValue = attribute.value
				const importId = imports.addAssetImport(originalValue)

				if (fromProp === toProp) {
					// Same prop name: replace value in-place with imported module
					attribute.value = createExpressionAttributeValue(importId)
				} else {
					// Different prop names: keep original as string, add new prop with imported module
					node.attributes.push({
						name: toProp,
						type: 'mdxJsxAttribute',
						value: createExpressionAttributeValue(importId),
					})
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
	;(tree.children as unknown[]).push(exportNode)
}
