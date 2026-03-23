import type { AstroIntegration } from 'astro'
import remarkDirective from 'remark-directive'
import type { RemarkDirectivesOptions } from './plugins/remark-directives.js'
import type { RemarkElementsOptions } from './plugins/remark-elements.js'
import type { RemarkFrontmatterInjectOptions } from './plugins/remark-frontmatter-inject.js'
import type { MdxKitOptions } from './types.js'
import type { ResolvedComponentConfig } from './utils/resolve-config.js'
import { remarkCaptionImages } from './plugins/remark-caption-images.js'
import { remarkMdxKitDirectives } from './plugins/remark-directives.js'
import { remarkMdxKitElements } from './plugins/remark-elements.js'
import { remarkFrontmatterInject } from './plugins/remark-frontmatter-inject.js'
import { remarkUnwrapImages } from './plugins/remark-unwrap-images.js'
import { resolveComponentConfig, resolveElementConfig } from './utils/resolve-config.js'

/**
 * Create the `astro-mdx-kit` Astro integration.
 *
 * Add this to your `integrations` array in `astro.config.mjs`.
 * When used alongside Starlight, list it **before** Starlight so that
 * directive transforms run before Starlight's restoration plugin.
 * @example
 * ```ts
 * import mdxKit from 'astro-mdx-kit'
 *
 * export default defineConfig({
 *   integrations: [
 *     mdxKit({
 *       directives: {
 *         Block: 'src/components/Block.astro',
 *       },
 *       elements: {
 *         h1: 'src/components/Heading.astro',
 *       },
 *     }),
 *   ],
 * })
 * ```
 */
export default function mdxKit(options: MdxKitOptions = {}): AstroIntegration {
	const { captionImages, directives, elements, mdast, rawMdx, unwrapImages } = options

	// Pre-resolve all configs at integration setup time (not per-file)
	const resolvedDirectives: Record<string, ResolvedComponentConfig> = {}
	if (directives) {
		for (const [name, config] of Object.entries(directives)) {
			resolvedDirectives[name] = resolveComponentConfig(name, config)
		}
	}

	const resolvedElements: Record<string, ResolvedComponentConfig> = {}
	if (elements) {
		for (const [name, config] of Object.entries(elements)) {
			resolvedElements[name] = resolveElementConfig(name, config)
		}
	}

	return {
		hooks: {
			'astro:config:setup'({ logger, updateConfig }) {
				const remarkPlugins: unknown[] = []

				// Raw MDX injection runs first to capture the original source
				if (rawMdx) {
					remarkPlugins.push([
						remarkFrontmatterInject,
						{ rawMdx } satisfies RemarkFrontmatterInjectOptions,
					])
				}

				if (Object.keys(resolvedDirectives).length > 0) {
					logger.info(
						`Registering ${Object.keys(resolvedDirectives).length} directive(s): ${Object.keys(resolvedDirectives).join(', ')}`,
					)

					// Remark-directive parses the :::/::/: syntax into AST nodes.
					// Safe to include even if Starlight already adds it — the
					// second pass is a no-op.
					remarkPlugins.push(remarkDirective, [
						remarkMdxKitDirectives,
						{ configs: resolvedDirectives } satisfies RemarkDirectivesOptions,
					])
				}

				if (Object.keys(resolvedElements).length > 0) {
					logger.info(
						`Registering ${Object.keys(resolvedElements).length} element override(s): ${Object.keys(resolvedElements).join(', ')}`,
					)

					remarkPlugins.push([
						remarkMdxKitElements,
						{ configs: resolvedElements } satisfies RemarkElementsOptions,
					])
				}

				// Global caption handling for images not already handled by element overrides
				if (captionImages) {
					remarkPlugins.push(remarkCaptionImages)
				}

				// Unwrap stand-alone images after element overrides and captions
				if (unwrapImages) {
					remarkPlugins.push(remarkUnwrapImages)
				}

				// Mdast runs last to capture the tree after our transforms
				if (mdast) {
					remarkPlugins.push([
						remarkFrontmatterInject,
						{ mdast } satisfies RemarkFrontmatterInjectOptions,
					])
				}

				if (remarkPlugins.length > 0) {
					updateConfig({
						markdown: {
							// eslint-disable-next-line ts/no-unsafe-type-assertion
							remarkPlugins: remarkPlugins as never,
						},
					})
				}
			},
		},
		name: 'astro-mdx-kit',
	}
}
