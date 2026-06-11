import type { RemarkPlugins } from '@astrojs/markdown-remark'
import type { AstroIntegration } from 'astro'
import { isUnifiedProcessor } from '@astrojs/markdown-remark'
import remarkAttributeList from 'remark-attribute-list'
import remarkDirective from 'remark-directive'
import type { MdxKitOptions } from './types.js'
import { SKIP_PARSER_EXTENSIONS } from './internal.js'
import remarkMdxKitPlugin from './remark-plugin.js'

/**
 * Astro integration for astro-mdx-kit.
 *
 * Registers the `remarkMdxKitPlugin` remark plugin on Astro's
 * `markdown.processor` (the default `unified()` pipeline from
 * `@astrojs/markdown-remark`). Use this when you want the convenience of an
 * Astro integration, or use `remarkMdxKit()` directly in the processor's
 * `remarkPlugins` for more control.
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
			'astro:config:setup'({ config, logger }) {
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

				// Astro 6.4+ always sets `config.markdown.processor` (defaulting to
				// `unified()`), and preserves its reference identity across config
				// merges — pushing onto its options is the supported way for
				// integrations to extend the pipeline.
				const { processor } = config.markdown
				if (isUnifiedProcessor(processor)) {
					processor.options.remarkPlugins.push(...remarkPlugins)
				} else {
					logger.warn(
						`The configured \`markdown.processor\` ("${processor.name}") does not run remark plugins, so astro-mdx-kit's transforms won't apply. Use the default \`unified()\` processor from \`@astrojs/markdown-remark\`, or pass a unified processor to \`mdx({ processor })\` if you only need MDX support.`,
					)
				}
			},
		},
		name: 'astro-mdx-kit',
	}
}
