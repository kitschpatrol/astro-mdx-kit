/* eslint-disable ts/triple-slash-reference */

/// <reference types="mdast-util-mdx-jsx" />

import type { Image } from 'mdast'
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx'
import type { MdastPluginDefinition, MdastVisitorContext, MdxjsEsm } from 'satteri'
import type { ResolvedComponentConfig } from '../utils/resolve-config.js'
import { log } from '../log.js'
import { lazyChildren } from '../utils/ast.js'
import { buildCaptionReplacement, extractCaptionNodes } from '../utils/caption.js'
import { buildImageJsxElement } from '../utils/images.js'
import { resolveAutoImportAttributes } from '../utils/imports.js'
import {
	createFireOncePlugin,
	findRootNode,
	getCompileState,
	getImportTracker,
} from '../utils/satteri.js'

const TRANSFORM_PLUGIN = 'astro-mdx-kit:elements'
const EXPORT_MERGE_PLUGIN = 'astro-mdx-kit:elements-components-merge'
const EXPORT_INJECT_PLUGIN = 'astro-mdx-kit:elements-components-inject'

const COMPONENTS_EXPORT_OPEN_REGEX = /(export\s+(?:const|let|var)\s+components\s*=\s*\{)/
const COMPONENTS_EXPORT_REGEX = /export\s+(?:const|let|var)\s+components\b/

/**
 * Create Sätteri MDAST plugins that map HTML elements to custom components.
 *
 * Mirrors the remark {@link createElementTransform} for Sätteri pipelines, using
 * the same two strategies:
 *
 * - Elements **without** `autoImports` use MDX's `export const components`
 *   mechanism. An existing `components` export in the document is merged into
 *   (document entries take precedence); otherwise a new export is injected.
 * - Elements **with** `autoImports` use direct AST transformation so that prop
 *   values (e.g. image `src`) can be converted to ESM imports.
 *
 * @param configs - Map of HTML element names to resolved component
 *   configurations.
 *
 * @returns An ordered array of Sätteri plugin passes.
 */
export function createSatteriElementsPlugins(
	configs: Record<string, ResolvedComponentConfig>,
): MdastPluginDefinition[] {
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

	const plugins: MdastPluginDefinition[] = []

	if (Object.keys(autoImportOverrides).length > 0) {
		plugins.push(createTransformPlugin(autoImportOverrides))
	}

	if (Object.keys(simpleOverrides).length > 0) {
		plugins.push(
			createExportMergePlugin(simpleOverrides),
			createExportInjectPlugin(simpleOverrides),
		)
	}

	return plugins
}

// ---------------------------------------------------------------------------
// Auto-import overrides: direct AST transformation
// ---------------------------------------------------------------------------

function createTransformPlugin(
	overrides: Record<string, ResolvedComponentConfig>,
): MdastPluginDefinition {
	function visitImage(
		node: Readonly<Image>,
		context: MdastVisitorContext,
	): MdxJsxFlowElement | undefined {
		const config = overrides.img
		if (!config) {
			return undefined
		}

		const root = findRootNode(node, context)
		const imports = getImportTracker(context, TRANSFORM_PLUGIN, root)
		imports.addComponentImport(config.componentName, config.importPath, config.isNamedImport)

		const imageJsx = buildImageJsxElement(node, config, imports)

		const parent = context.parent(node)
		if (!config.caption || parent.type !== 'paragraph') {
			return imageJsx
		}

		// Paragraphs with multiple images are skipped for caption handling to
		// avoid ambiguity about which image a caption belongs to.
		const imageCount = parent.children.filter((child) => child.type === 'image').length
		if (imageCount > 1) {
			return imageJsx
		}

		const index = context.indexOf(node)
		if (index === undefined) {
			return imageJsx
		}

		const captionNodes = extractCaptionNodes(parent, index)
		if (captionNodes.length === 0) {
			return imageJsx
		}

		context.replaceNode(parent, buildCaptionReplacement(config.caption, imageJsx, captionNodes))
		return undefined
	}

	function visitJsxElement(
		node: Readonly<MdxJsxFlowElement | MdxJsxTextElement>,
		context: MdastVisitorContext,
	): MdxJsxFlowElement | MdxJsxTextElement | undefined {
		if (node.name === null) {
			return undefined
		}

		const config = overrides[node.name]
		if (!config) {
			return undefined
		}

		const root = findRootNode(node, context)
		const imports = getImportTracker(context, TRANSFORM_PLUGIN, root)
		imports.addComponentImport(config.componentName, config.importPath, config.isNamedImport)

		const attributes = [...node.attributes]

		// Build propValues from string-valued JSX attributes
		const propValues: Record<string, string> = {}
		for (const attribute of attributes) {
			if (attribute.type === 'mdxJsxAttribute' && typeof attribute.value === 'string') {
				propValues[attribute.name] = attribute.value
			}
		}

		const { attributes: resolvedAttributes, handledProps } = resolveAutoImportAttributes(
			propValues,
			config.autoImports ?? [],
			imports,
		)

		const newAttributes =
			resolvedAttributes.length === 0
				? attributes
				: [
						...attributes.filter((a) => a.type !== 'mdxJsxAttribute' || !handledProps.has(a.name)),
						...resolvedAttributes,
					]

		// Build a fresh node rather than spreading the visited one so Sätteri
		// treats it as a replacement instead of the original lazy node.
		if (node.type === 'mdxJsxFlowElement') {
			return {
				attributes: newAttributes,
				children: [...lazyChildren(node.children)],
				name: config.componentName,
				type: 'mdxJsxFlowElement',
			}
		}

		return {
			attributes: newAttributes,
			children: [...lazyChildren(node.children)],
			name: config.componentName,
			type: 'mdxJsxTextElement',
		}
	}

	return {
		image: visitImage,
		mdxJsxFlowElement: visitJsxElement,
		mdxJsxTextElement: visitJsxElement,
		name: TRANSFORM_PLUGIN,
	}
}

// ---------------------------------------------------------------------------
// Simple overrides: export const components = { ... }
// ---------------------------------------------------------------------------

function buildMappingEntries(overrides: Record<string, ResolvedComponentConfig>): string {
	return Object.entries(overrides)
		.map(([element, config]) => `${element}: ${config.componentName}`)
		.join(', ')
}

function registerComponentImports(
	overrides: Record<string, ResolvedComponentConfig>,
	context: MdastVisitorContext,
	trackerName: string,
	root: ReturnType<typeof findRootNode>,
): void {
	const imports = getImportTracker(context, trackerName, root)
	for (const [element, config] of Object.entries(overrides)) {
		imports.addComponentImport(config.componentName, config.importPath, config.isNamedImport)
		log.debug(`Overriding <${element}> → <${config.componentName}> (via export const components)`)
	}
}

/**
 * First pass: if the document already declares `export const components`, merge
 * our mappings into it (prepended, so document entries win) and mark the export
 * as handled so the inject pass skips it.
 */
function createExportMergePlugin(
	overrides: Record<string, ResolvedComponentConfig>,
): MdastPluginDefinition {
	return {
		mdxjsEsm(node: Readonly<MdxjsEsm>, context: MdastVisitorContext) {
			const state = getCompileState(context)
			if (state.componentsExportHandled) {
				return
			}

			if (!COMPONENTS_EXPORT_REGEX.test(node.value)) {
				return
			}

			state.componentsExportHandled = true

			if (!COMPONENTS_EXPORT_OPEN_REGEX.test(node.value)) {
				log.warn(
					'Found an existing `components` export whose value is not an object literal — ' +
						'element overrides configured via astro-mdx-kit will not be merged into it. ' +
						'Use an object literal (`export const components = { ... }`) to combine both.',
				)
				return
			}

			const root = findRootNode(node, context)
			registerComponentImports(overrides, context, EXPORT_MERGE_PLUGIN, root)
			context.setProperty(
				node,
				'value',
				node.value.replace(COMPONENTS_EXPORT_OPEN_REGEX, `$1 ${buildMappingEntries(overrides)},`),
			)
		},
		name: EXPORT_MERGE_PLUGIN,
	}
}

/**
 * Second pass: inject a fresh `export const components` declaration when the
 * merge pass found no existing one.
 */
function createExportInjectPlugin(
	overrides: Record<string, ResolvedComponentConfig>,
): MdastPluginDefinition {
	return createFireOncePlugin(EXPORT_INJECT_PLUGIN, (root, context) => {
		const state = getCompileState(context)
		if (state.componentsExportHandled) {
			return
		}

		registerComponentImports(overrides, context, EXPORT_INJECT_PLUGIN, root)
		context.appendChild(root, {
			type: 'mdxjsEsm',
			value: `export const components = { ${buildMappingEntries(overrides)} }`,
		})
	})
}
