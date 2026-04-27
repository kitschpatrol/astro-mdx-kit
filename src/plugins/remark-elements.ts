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
	createJsxFlowElement,
	createStringAttribute,
	mergeIntoComponentsExport,
} from '../utils/ast.js'
import {
	applyParagraphReplacements,
	buildCaptionReplacement,
	extractCaptionNodes,
	findMultiImageParagraphs,
} from '../utils/caption.js'
import { ImportTracker, resolveAutoImportAttributes } from '../utils/imports.js'

/**
 * Options for the element-to-component remark plugin.
 */
export type RemarkElementsOptions = {
	/**
	 * Map of HTML element names to their resolved component configurations.
	 *
	 * Each key is a standard HTML element name (e.g. `"img"`, `"h1"`, `"a"`) and
	 * the value describes which component replaces it and how to handle its
	 * imports.
	 */
	configs: Record<string, ResolvedComponentConfig>
}

/**
 * Create a MDAST tree transformer that maps HTML elements to custom components,
 * injecting the necessary ESM imports and export declarations.
 *
 * Two strategies are used depending on the configuration:
 *
 * - Elements **without** `autoImports` use MDX's `export const components`
 *   mechanism, which handles all rendering of that element type.
 * - Elements **with** `autoImports` use direct AST transformation so that prop
 *   values (e.g. image `src`) can be converted to ESM imports.
 *
 * Exported separately from the plugin wrapper so it can be composed into larger
 * transform pipelines or used directly in tests.
 *
 * @param options - Element transform configuration.
 *
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
				log.debug(
					`Overriding <${element}> → <${config.componentName}> (via export const components)`,
				)
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

function buildImageJsxElement(
	node: Image,
	config: ResolvedComponentConfig,
	imports: ImportTracker,
): MdxJsxFlowElement {
	const attributes: MdxJsxAttribute[] = []
	const hProperties = (node.data?.hProperties ?? {}) as Record<string, unknown>

	if (config.autoImports) {
		// Build propValues: 'src' from node.url, plus string-valued hProperties.
		// This lets each auto-import entry look up its own fromProp in the map
		// (e.g. 'src' reads node.url, 'srcDark' reads {:srcDark="..."}).
		const propValues: Record<string, string> = { src: node.url }
		for (const [key, value] of Object.entries(hProperties)) {
			if (typeof value === 'string') {
				propValues[key] = value
			}
		}

		const { attributes: importAttributes, handledProps } = resolveAutoImportAttributes(
			propValues,
			config.autoImports,
			imports,
		)
		attributes.push(...importAttributes)

		// Forward remaining hProperties not consumed by auto-import
		for (const [key, value] of Object.entries(hProperties)) {
			if (typeof value === 'string' && !handledProps.has(key)) {
				attributes.push(createStringAttribute(key, value))
			}
		}
	} else {
		// No autoImport — forward all hProperties as strings
		for (const [key, value] of Object.entries(hProperties)) {
			if (typeof value === 'string') {
				attributes.push(createStringAttribute(key, value))
			}
		}
	}

	// Add alt and title from the mdast node, but only when hProperties
	// didn't already provide them (avoids duplicate attributes while
	// letting explicit attribute syntax like {:alt="..."} take precedence).
	if (node.alt && !('alt' in hProperties)) {
		attributes.push(createStringAttribute('alt', node.alt))
	}

	if (node.title && !('title' in hProperties)) {
		attributes.push(createStringAttribute('title', node.title))
	}

	return createJsxFlowElement(config.componentName, attributes, [])
}

function transformImageNodes(
	tree: Root,
	config: ResolvedComponentConfig,
	imports: ImportTracker,
): void {
	const multiImageParagraphs = config.caption ? findMultiImageParagraphs(tree) : undefined
	const paragraphReplacements = new Map<MdastParent, MdxJsxFlowElement>()

	visit(tree, 'image', (node: Image, index, parent) => {
		if (index === undefined || !parent) {
			return SKIP
		}

		const imageJsx = buildImageJsxElement(node, config, imports)

		if (!config.caption || multiImageParagraphs?.has(parent)) {
			;(parent as Parent).children[index] = imageJsx
			return SKIP
		}

		const captionNodes = extractCaptionNodes(parent, index)

		if (captionNodes.length === 0) {
			;(parent as Parent).children[index] = imageJsx
			return SKIP
		}

		paragraphReplacements.set(
			parent,
			buildCaptionReplacement(config.caption, imageJsx, captionNodes),
		)
		return SKIP
	})

	applyParagraphReplacements(tree, paragraphReplacements)
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
		if (node.type !== 'mdxJsxFlowElement' && node.type !== 'mdxJsxTextElement') {
			return
		}

		if (node.name !== elementName) {
			return
		}

		// Rename element to component
		node.name = config.componentName

		if (!config.autoImports) {
			return
		}

		// Build propValues from string-valued JSX attributes
		const propValues: Record<string, string> = {}
		for (const attribute of node.attributes) {
			if (attribute.type === 'mdxJsxAttribute' && typeof attribute.value === 'string') {
				propValues[attribute.name] = attribute.value
			}
		}

		const { attributes: resolvedAttributes, handledProps } = resolveAutoImportAttributes(
			propValues,
			config.autoImports,
			imports,
		)

		if (resolvedAttributes.length === 0) {
			return
		}

		// Keep attributes not handled by auto-import, replace handled ones
		node.attributes = [
			...node.attributes.filter((a) => a.type !== 'mdxJsxAttribute' || !handledProps.has(a.name)),
			...resolvedAttributes,
		]
	})
}

// ---------------------------------------------------------------------------
// export const components = { ... }
// ---------------------------------------------------------------------------

function injectComponentsExport(tree: Root, mappings: Record<string, string>): void {
	// Try to merge into an existing `export const components`
	for (const child of tree.children) {
		if (child.type !== 'mdxjsEsm') {
			continue
		}

		if (mergeIntoComponentsExport(child, mappings)) {
			return
		}
	}

	// No existing export found — create one
	const exportNode = createComponentsExportNode(mappings)
	;(tree.children as unknown[]).push(exportNode)
}
