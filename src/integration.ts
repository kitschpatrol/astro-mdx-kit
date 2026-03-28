import type { AstroIntegration } from 'astro'
import remarkAttributeList from 'remark-attribute-list'
import remarkDirective from 'remark-directive'
import type { MdxKitOptions } from './types.js'
import remarkMdxKitPlugin, { SKIP_PARSER_EXTENSIONS } from './remark-plugin.js'

/**
 * Astro integration for astro-mdx-kit.
 *
 * Registers the `remarkMdxKitPlugin` remark plugin via Astro's `updateConfig`.
 * Use this when you want the convenience of an Astro integration, or use
 * `remarkMdxKit()` directly in `remarkPlugins` for more control.
 * @example
 * ```ts
 * import { mdxKit } from 'astro-mdx-kit'
 *
 * export default defineConfig({
 *   integrations: [
 *     mdxKit({
 *       directives: { Block: 'src/components/Block.astro' },
 *       elements: { h1: 'src/components/Heading.astro' },
 *     }),
 *   ],
 * })
 * ```
 */
export default function mdxKit(options: MdxKitOptions = {}): AstroIntegration {
	return {
		hooks: {
			'astro:config:setup'({ updateConfig }) {
				// Parser extension plugins must be registered separately because
				// Astro's MDX integration uses its own unified processor — extensions
				// registered via this.data() in the remark plugin only apply to the
				// markdown processor, not the MDX one.
				const remarkPlugins: unknown[] = []

				if (options.attributes) {
					remarkPlugins.push(remarkAttributeList)
				}

				if (options.directives && Object.keys(options.directives).length > 0) {
					remarkPlugins.push(remarkDirective)
				}

				remarkPlugins.push([
				remarkMdxKitPlugin,
				{ ...options, [SKIP_PARSER_EXTENSIONS]: true },
			])

				updateConfig({
					markdown: {
						// eslint-disable-next-line ts/no-unsafe-type-assertion
						remarkPlugins: remarkPlugins as never,
					},
				})
			},
		},
		name: 'astro-mdx-kit',
	}
}
