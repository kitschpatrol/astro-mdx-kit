/* eslint-disable ts/triple-slash-reference */

/// <reference types="mdast-util-directive" />
/// <reference types="mdast-util-mdx-jsx" />
/// <reference types="mdast-util-mdxjs-esm" />

import type { Root } from 'mdast'
import type { Plugin, Processor } from 'unified'
import type { VFile } from 'vfile'
import { directiveFromMarkdown } from 'mdast-util-directive'
import { directive } from 'micromark-extension-directive'
import remarkAttributeList from 'remark-attribute-list'
import type { MdxKitOptions } from './types.js'
import type { ResolvedComponentConfig } from './utils/resolve-config.js'
import { isFrontmatterKeyEnabled, SKIP_PARSER_EXTENSIONS } from './internal.js'
import { log } from './log.js'
import { captionImagesTransform } from './plugins/remark-caption-images.js'
import { createDirectiveTransform } from './plugins/remark-directives.js'
import { createElementTransform } from './plugins/remark-elements.js'
import { createFrontmatterInjectTransform } from './plugins/remark-frontmatter-inject.js'
import { unwrapImagesTransform } from './plugins/remark-unwrap-images.js'
import { unwrapPhrasingContentTransform } from './plugins/remark-unwrap-phrasing.js'
import { resolveComponentConfig, resolveElementConfig } from './utils/resolve-config.js'

/**
 * All-in-one remark plugin for astro-mdx-kit.
 *
 * Registers parser extensions (for directives) and runs all configured
 * transforms in a single plugin. Can be used directly in any unified/remark
 * pipeline or via the Astro integration wrapper.
 *
 * @example
 * 	import remarkMdxKitPlugin from 'astro-mdx-kit/remark'
 *
 * 	// In Astro MDX config:
 * 	mdx({ remarkPlugins: [[remarkMdxKitPlugin, options]] })
 *
 * 	// Or in any unified pipeline:
 * 	unified()
 * 		.use(remarkParse)
 * 		.use(remarkMdxKitPlugin, options)
 * 		.use(remarkRehype)
 */
// eslint-disable-next-line complexity -- pipeline builder, one branch per feature
const remarkMdxKitPlugin: Plugin<[MdxKitOptions?], Root> = function (
	this: Processor,
	options: MdxKitOptions = {},
) {
	const {
		attributes,
		captionImages,
		directives,
		elements,
		mdast,
		rawMdx,
		unwrapImages,
		unwrapPhrasingContent,
	} = options

	// ---------------------------------------------------------------------------
	// Parser extensions — registered on the processor via this.data()
	// Skipped when the Astro integration has already registered them as
	// separate remark plugins (see integration.ts).
	// ---------------------------------------------------------------------------

	const skipParserExtensions = (options as Record<symbol, unknown>)[SKIP_PARSER_EXTENSIONS] === true

	if (!skipParserExtensions) {
		// eslint-disable-next-line unicorn/no-this-outside-of-class -- unified plugins receive the processor as `this`
		const data = this.data()

		if (directives && Object.keys(directives).length > 0) {
			data.micromarkExtensions ??= []
			data.micromarkExtensions.push(directive())

			data.fromMarkdownExtensions ??= []
			data.fromMarkdownExtensions.push(directiveFromMarkdown())
		}

		if (attributes) {
			// eslint-disable-next-line unicorn/no-this-outside-of-class -- unified plugins receive the processor as `this`
			this.use(remarkAttributeList)
		}
	}

	// ---------------------------------------------------------------------------
	// Pre-resolve configs
	// ---------------------------------------------------------------------------

	const resolvedDirectives: Record<string, ResolvedComponentConfig> = {}
	if (directives) {
		for (const [name, config] of Object.entries(directives)) {
			resolvedDirectives[name] = resolveComponentConfig(name, config)
		}
	}

	const resolvedElements: Record<string, ResolvedComponentConfig> = {}
	if (elements) {
		for (const [name, config] of Object.entries(elements)) {
			if (config === undefined) {
				continue
			}

			resolvedElements[name] = resolveElementConfig(name, config)
		}
	}

	// ---------------------------------------------------------------------------
	// Build the transform pipeline
	// ---------------------------------------------------------------------------

	const transforms: Array<(tree: Root, file: VFile) => void> = []

	if (isFrontmatterKeyEnabled(rawMdx)) {
		transforms.push(createFrontmatterInjectTransform({ rawMdx }))
	}

	if (Object.keys(resolvedDirectives).length > 0) {
		log.debug(
			`Registering ${Object.keys(resolvedDirectives).length} directive(s): ${Object.keys(resolvedDirectives).join(', ')}`,
		)
		transforms.push(createDirectiveTransform({ configs: resolvedDirectives }))
	}

	if (Object.keys(resolvedElements).length > 0) {
		log.debug(
			`Registering ${Object.keys(resolvedElements).length} element override(s): ${Object.keys(resolvedElements).join(', ')}`,
		)
		transforms.push(createElementTransform({ configs: resolvedElements }))
	}

	if (captionImages) {
		transforms.push(captionImagesTransform)
	}

	if (unwrapPhrasingContent) {
		transforms.push(unwrapPhrasingContentTransform)
	}

	if (unwrapImages) {
		// Collect component names used for img overrides so the unwrap
		// transform recognizes them as image-like elements.
		const imageComponentNames = new Set<string>()
		const imgConfig = resolvedElements.img
		if (imgConfig) {
			imageComponentNames.add(imgConfig.componentName)
		}

		transforms.push((tree) => {
			unwrapImagesTransform(
				tree,
				imageComponentNames.size > 0 ? { imageComponentNames } : undefined,
			)
		})
	}

	if (isFrontmatterKeyEnabled(mdast)) {
		transforms.push(createFrontmatterInjectTransform({ mdast }))
	}

	// ---------------------------------------------------------------------------
	// Return the combined transformer
	// ---------------------------------------------------------------------------

	return (tree: Root, file: VFile) => {
		for (const transform of transforms) {
			transform(tree, file)
		}
	}
}

export default remarkMdxKitPlugin

/**
 * Helper that returns a typed `[plugin, options]` tuple for use in
 * `remarkPlugins` arrays. Provides full autocomplete on the options object.
 *
 * @example
 * 	import { remarkMdxKit } from 'astro-mdx-kit'
 *
 * 	export default {
 * 	markdown: {
 * 	remarkPlugins: [remarkMdxKit({ directives: { ... } })],
 * 	},
 * 	}
 */
// eslint-disable-next-line ts/no-explicit-any -- interop with Astro's RemarkPlugin type
export function remarkMdxKit(options: MdxKitOptions = {}): [plugin: any, options: MdxKitOptions] {
	return [remarkMdxKitPlugin, options]
}
