import type { MdastPluginDefinition } from 'satteri'
import type { MdxKitOptions } from './types.js'
import type { ResolvedComponentConfig } from './utils/resolve-config.js'
import { isFrontmatterKeyEnabled } from './internal.js'
import { log } from './log.js'
import { createSatteriAttributesPlugin } from './plugins/satteri-attributes.js'
import { createSatteriCaptionImagesPlugin } from './plugins/satteri-caption-images.js'
import { createSatteriDirectivesPlugin } from './plugins/satteri-directives.js'
import { createSatteriElementsPlugins } from './plugins/satteri-elements.js'
import {
	createSatteriMdastInjectPlugin,
	createSatteriRawMdxInjectPlugin,
} from './plugins/satteri-frontmatter-inject.js'
import { createSatteriUnwrapImagesPlugin } from './plugins/satteri-unwrap-images.js'
import { createSatteriUnwrapPhrasingPlugin } from './plugins/satteri-unwrap-phrasing.js'
import { resolveComponentConfig, resolveElementConfig } from './utils/resolve-config.js'

export { escapeMdxAttributeLists } from './utils/attribute-list.js'

/**
 * Build the ordered list of Sätteri MDAST plugins for astro-mdx-kit.
 *
 * Mirrors the remark plugin pipeline (`remarkMdxKit`) for Sätteri, Astro 7's
 * default Markdown processor. The Astro integration registers these plugins
 * automatically; use this directly when configuring a Sätteri processor by hand
 * or running Sätteri outside Astro.
 *
 * Requires the `directive` parser feature when directives are configured (the
 * Astro integration enables it automatically):
 *
 * @example
 * 	import { satteri } from '@astrojs/markdown-satteri'
 * 	import { satteriMdxKit } from 'astro-mdx-kit/satteri'
 *
 * 	export default defineConfig({
 * 	markdown: {
 * 	processor: satteri({
 * 	features: { directive: true },
 * 	mdastPlugins: satteriMdxKit({ directives: { ... } }),
 * 	}),
 * 	},
 * 	})
 *
 * 	Note: with `attributes` enabled, `.mdx` sources must have their attribute
 * 	lists escaped (`{:` → `\{:`) before MDX parsing — the Astro integration does
 * 	this via a Vite transform; standalone users can call
 * 	`escapeMdxAttributeLists`. Plain markdown needs no escaping.
 */
export function satteriMdxKit(options: MdxKitOptions = {}): MdastPluginDefinition[] {
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
	// Build the ordered plugin list (same order as the remark pipeline)
	// ---------------------------------------------------------------------------

	const plugins: MdastPluginDefinition[] = []

	// Attributes run first, matching the unified pipeline where
	// remark-attribute-list applies at parse time before all transforms.
	if (attributes) {
		plugins.push(createSatteriAttributesPlugin())
	}

	if (isFrontmatterKeyEnabled(rawMdx)) {
		plugins.push(createSatteriRawMdxInjectPlugin(rawMdx, attributes ?? false))
	}

	if (Object.keys(resolvedDirectives).length > 0) {
		log.debug(
			`Registering ${Object.keys(resolvedDirectives).length} directive(s): ${Object.keys(resolvedDirectives).join(', ')}`,
		)
		plugins.push(createSatteriDirectivesPlugin(resolvedDirectives))
	}

	if (Object.keys(resolvedElements).length > 0) {
		log.debug(
			`Registering ${Object.keys(resolvedElements).length} element override(s): ${Object.keys(resolvedElements).join(', ')}`,
		)
		plugins.push(...createSatteriElementsPlugins(resolvedElements))
	}

	if (captionImages) {
		plugins.push(createSatteriCaptionImagesPlugin())
	}

	if (unwrapPhrasingContent) {
		plugins.push(createSatteriUnwrapPhrasingPlugin())
	}

	if (unwrapImages) {
		// Collect component names used for img overrides so the unwrap
		// transform recognizes them as image-like elements.
		const imgConfig = resolvedElements.img
		plugins.push(
			createSatteriUnwrapImagesPlugin(imgConfig ? new Set([imgConfig.componentName]) : undefined),
		)
	}

	if (isFrontmatterKeyEnabled(mdast)) {
		plugins.push(createSatteriMdastInjectPlugin(mdast))
	}

	return plugins
}
