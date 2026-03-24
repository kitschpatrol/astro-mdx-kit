/* eslint-disable ts/triple-slash-reference */

/// <reference types="mdast-util-directive" />
/// <reference types="mdast-util-mdx-jsx" />
/// <reference types="mdast-util-mdxjs-esm" />

import type { Image, Parent as MdastParent, Root } from 'mdast'
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import type { Plugin } from 'unified'
import type { Parent } from 'unist'
import { SKIP, visit } from 'unist-util-visit'
import type { ResolvedAutoImportEntry, ResolvedComponentConfig } from '../utils/resolve-config.js'
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

/**
 * Options for the element-to-component remark plugin.
 */
export type RemarkElementsOptions = {
	/**
	 * Map of HTML element names to their resolved component configurations.
	 *
	 * Each key is a standard HTML element name (e.g. `"img"`, `"h1"`, `"a"`)
	 * and the value describes which component replaces it and how to handle
	 * its imports.
	 */
	configs: Record<string, ResolvedComponentConfig>
}

/**
 * Create a MDAST tree transformer that maps HTML elements to custom
 * components, injecting the necessary ESM imports and export declarations.
 *
 * Two strategies are used depending on the configuration:
 *
 * - Elements **without** `autoImports` use MDX's `export const components`
 *   mechanism, which handles all rendering of that element type.
 * - Elements **with** `autoImports` use direct AST transformation so that
 *   prop values (e.g. image `src`) can be converted to ESM imports.
 *
 * Exported separately from the plugin wrapper so it can be composed into
 * larger transform pipelines or used directly in tests.
 * @param options - Element transform configuration.
 * @returns A tree transformer function.
 */
export function createElementTransform(options: RemarkElementsOptions): (tree: Root) => void {
	const { configs } = options

	// Split configs into simple overrides vs auto-import overrides
	const simpleOverrides: Record<string, ResolvedComponentConfig> = {}
	const autoImportOverrides: Record<string, ResolvedComponentConfig> = {}

	for (const [element, config] of Object.entries(configs)) {
		if (config.autoImports) {
			autoImportOverrides[element] = config
		} else {
			simpleOverrides[element] = config
		}
	}

	return (tree: Root) => {
		const imports = new ImportTracker()

		// -----------------------------------------------------------------
		// 1. Handle elements with autoImports via direct AST transformation
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
 *
 * Use {@link createElementTransform} for the underlying tree transformer.
 */
export const remarkMdxKitElements: Plugin<[RemarkElementsOptions], Root> = (options) =>
	createElementTransform(options)

// ---------------------------------------------------------------------------
// Image node transformation (![alt](src))
// ---------------------------------------------------------------------------

/**
 * Process auto-import entries for an image URL, generating attributes
 * and imports for each entry.
 */
function processAutoImports(
	url: string,
	autoImports: ResolvedAutoImportEntry[],
	imports: ImportTracker,
	attributes: MdxJsxAttribute[],
): void {
	for (const entry of autoImports) {
		const { fromProp, toProp, transform } = entry

		if (transform) {
			// Derived import: transform the path, skip if transform returns undefined
			const transformedPath = transform(url)
			if (transformedPath === undefined) continue
			const importId = imports.addAssetImport(transformedPath)
			attributes.push(createExpressionAttribute(toProp, importId))
		} else if (isImportablePath(url)) {
			// Primary import: import the path as-is
			const importId = imports.addAssetImport(url)
			attributes.push(createExpressionAttribute(toProp, importId))
			if (fromProp !== toProp) {
				attributes.push(createStringAttribute(fromProp, url))
			}
		} else {
			// Non-importable path (URL, data URI): pass as string
			attributes.push(createStringAttribute(toProp, url))
		}
	}
}

function buildImageJsxElement(
	node: Image,
	config: ResolvedComponentConfig,
	imports: ImportTracker,
): MdxJsxFlowElement {
	const attributes: MdxJsxAttribute[] = []

	if (config.autoImports) {
		processAutoImports(node.url, config.autoImports, imports, attributes)
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

		if (!config.autoImports) return

		// Find the primary auto-import entry (the one without a transform)
		const primaryEntry = config.autoImports.find((entry) => !entry.transform)
		if (!primaryEntry) return

		const { fromProp } = primaryEntry

		for (const attribute of node.attributes) {
			if (attribute.type !== 'mdxJsxAttribute' || attribute.name !== fromProp) continue
			if (typeof attribute.value !== 'string' || !isImportablePath(attribute.value)) continue

			const originalValue = attribute.value

			// Process all auto-import entries for this value
			for (const entry of config.autoImports) {
				if (entry.transform) {
					// Derived import
					const transformedPath = entry.transform(originalValue)
					if (transformedPath === undefined) continue

					// Skip if prop already set explicitly
					const alreadySet = node.attributes.some(
						(a) => a.type === 'mdxJsxAttribute' && a.name === entry.toProp,
					)
					if (alreadySet) continue

					const importId = imports.addAssetImport(transformedPath)
					node.attributes.push({
						name: entry.toProp,
						type: 'mdxJsxAttribute',
						value: createExpressionAttributeValue(importId),
					})
				} else if (entry.fromProp === entry.toProp) {
					// Same prop: replace value in-place with imported module
					const importId = imports.addAssetImport(originalValue)
					attribute.value = createExpressionAttributeValue(importId)
				} else {
					// Different prop: keep original as string, add new prop
					const importId = imports.addAssetImport(originalValue)
					node.attributes.push({
						name: entry.toProp,
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
