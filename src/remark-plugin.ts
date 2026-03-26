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
import { log } from './log.js'
import { captionImagesTransform } from './plugins/remark-caption-images.js'
import { createDirectiveTransform } from './plugins/remark-directives.js'
import { createElementTransform } from './plugins/remark-elements.js'
import { createFrontmatterInjectTransform } from './plugins/remark-frontmatter-inject.js'
import { unwrapImagesTransform } from './plugins/remark-unwrap-images.js'
import { resolveComponentConfig, resolveElementConfig } from './utils/resolve-config.js'

/**
 * All-in-one remark plugin for astro-mdx-kit.
 *
 * Registers parser extensions (for directives) and runs all configured
 * transforms in a single plugin. Can be used directly in any unified/remark
 * pipeline or via the Astro integration wrapper.
 * @example
 * ```ts
 * import remarkMdxKitPlugin from 'astro-mdx-kit/remark'
 *
 * // In Astro MDX config:
 * mdx({ remarkPlugins: [[remarkMdxKitPlugin, options]] })
 *
 * // Or in any unified pipeline:
 * unified().use(remarkParse).use(remarkMdxKitPlugin, options).use(remarkRehype)
 * ```
 */
const remarkMdxKitPlugin: Plugin<[MdxKitOptions?], Root> = function (
	this: Processor,
	options: MdxKitOptions = {},
) {
	const { attributes, captionImages, directives, elements, mdast, rawMdx, unwrapImages } = options

	// ---------------------------------------------------------------------------
	// Parser extensions — registered on the processor via this.data()
	// ---------------------------------------------------------------------------

	const data = this.data()

	if (directives && Object.keys(directives).length > 0) {
		data.micromarkExtensions ??= []
		data.micromarkExtensions.push(directive())

		data.fromMarkdownExtensions ??= []
		data.fromMarkdownExtensions.push(directiveFromMarkdown())
	}

	if (attributes) {
		// Remark-attribute-list registers its own micromark extensions via this.use()
		this.use(remarkAttributeList)
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
			if (config === undefined) continue
			resolvedElements[name] = resolveElementConfig(name, config)
		}
	}

	// ---------------------------------------------------------------------------
	// Build the transform pipeline
	// ---------------------------------------------------------------------------

	const transforms: Array<(tree: Root, file: VFile) => void> = []

	if (rawMdx) {
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

	if (unwrapImages) {
		transforms.push(unwrapImagesTransform)
	}

	if (mdast) {
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
 * @example
 * ```ts
 * import { remarkMdxKit } from 'astro-mdx-kit'
 *
 * export default {
 *   markdown: {
 *     remarkPlugins: [remarkMdxKit({ directives: { ... } })],
 *   },
 * }
 * ```
 */
// eslint-disable-next-line ts/no-explicit-any -- interop with Astro's RemarkPlugin type
export function remarkMdxKit(options: MdxKitOptions = {}): [plugin: any, options: MdxKitOptions] {
	return [remarkMdxKitPlugin, options]
}
