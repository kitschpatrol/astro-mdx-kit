import type { AstroIntegration } from 'astro'
import remarkDirective from 'remark-directive'
import type { RemarkDirectivesOptions } from './plugins/remark-directives.js'
import type { RemarkElementsOptions } from './plugins/remark-elements.js'
import type { MdxKitOptions } from './types.js'
import type { ResolvedComponentConfig } from './utils/resolve-config.js'
import { remarkMdxKitDirectives } from './plugins/remark-directives.js'
import { remarkMdxKitElements } from './plugins/remark-elements.js'
import { resolveComponentConfig } from './utils/resolve-config.js'

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
	const { directives, elements } = options

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
			resolvedElements[name] = resolveComponentConfig(name, config)
		}
	}

	return {
		hooks: {
			'astro:config:setup'({ logger, updateConfig }) {
				const remarkPlugins: unknown[] = []

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
