import type { RemarkPlugins } from '@astrojs/markdown-remark'
import type { AstroIntegration } from 'astro'
import { isUnifiedProcessor } from '@astrojs/markdown-remark'
import { isSatteriProcessor } from '@astrojs/markdown-satteri'
import remarkAttributeList from 'remark-attribute-list'
import remarkDirective from 'remark-directive'
import type { MdxKitOptions } from './types.js'
import { SKIP_PARSER_EXTENSIONS } from './internal.js'
import remarkMdxKitPlugin from './remark-plugin.js'
import { satteriMdxKit } from './satteri-plugin.js'
import { escapeMdxAttributeLists } from './utils/attribute-list.js'

const MDX_FILE_REGEX = /\.mdx(?:\?|$)/v

/**
 * Astro integration for astro-mdx-kit.
 *
 * Registers the astro-mdx-kit transforms on Astro's `markdown.processor`:
 *
 * - On the default Sätteri processor (`satteri()` from
 *   `@astrojs/markdown-satteri`), the Sätteri MDAST plugins from
 *   `satteriMdxKit()` are registered and the `directive` parser feature is
 *   enabled when directives are configured. With `attributes` enabled, a Vite
 *   transform escapes attribute lists in `.mdx` sources before MDX parsing.
 * - On the unified processor (`unified()` from `@astrojs/markdown-remark`), the
 *   `remarkMdxKitPlugin` remark plugin is registered.
 *
 * @example
 * 	import { mdxKit } from 'astro-mdx-kit'
 *
 * 	export default defineConfig({
 * 		integrations: [
 * 			mdxKit({
 * 				directives: { Block: 'src/components/Block.astro' },
 * 				elements: { h1: 'src/components/Heading.astro' },
 * 			}),
 * 		],
 * 	})
 */
export default function mdxKit(options: MdxKitOptions = {}): AstroIntegration {
	return {
		hooks: {
			'astro:config:setup'({ config, logger, updateConfig }) {
				// Astro always sets `config.markdown.processor` (defaulting to
				// `satteri()` in Astro 7), and preserves its reference identity
				// across config merges — pushing onto its options is the supported
				// way for integrations to extend the pipeline.
				const { processor } = config.markdown

				if (isSatteriProcessor(processor)) {
					if (options.attributes) {
						// Sätteri's MDX parser treats `{:...}` as an (invalid) expression.
						// Escape valid attribute lists to literal text before the MDX
						// Vite plugin runs; the Sätteri attributes plugin picks them up
						// from text nodes. Plain markdown needs no escaping.
						updateConfig({
							vite: {
								plugins: [
									{
										enforce: 'pre',
										name: 'astro-mdx-kit:attribute-escape',
										transform(code, id) {
											if (!MDX_FILE_REGEX.test(id)) {
												return
											}

											const escaped = escapeMdxAttributeLists(code)
											// eslint-disable-next-line unicorn/no-null -- Vite's transform API uses null for "no sourcemap"
											return escaped === code ? undefined : { code: escaped, map: null }
										},
									},
								],
							},
						})
					}

					if (options.directives && Object.keys(options.directives).length > 0) {
						processor.options.features.directive = true
					}

					processor.options.mdastPlugins.push(...satteriMdxKit(options))
					return
				}

				if (isUnifiedProcessor(processor)) {
					// Parser extension plugins must be registered separately because
					// Astro's MDX integration uses its own unified processor — extensions
					// registered via this.data() in the remark plugin only apply to the
					// markdown processor, not the MDX one.
					const remarkPlugins: RemarkPlugins = []

					if (options.attributes) {
						remarkPlugins.push(remarkAttributeList)
					}

					if (options.directives && Object.keys(options.directives).length > 0) {
						remarkPlugins.push(remarkDirective)
					}

					remarkPlugins.push([remarkMdxKitPlugin, { ...options, [SKIP_PARSER_EXTENSIONS]: true }])
					processor.options.remarkPlugins.push(...remarkPlugins)
					return
				}

				logger.warn(
					`The configured \`markdown.processor\` ("${processor.name}") is not supported by astro-mdx-kit, so its transforms won't apply. Use the default \`satteri()\` processor from \`@astrojs/markdown-satteri\` or the \`unified()\` processor from \`@astrojs/markdown-remark\`.`,
				)
			},
		},
		name: 'astro-mdx-kit',
	}
}
