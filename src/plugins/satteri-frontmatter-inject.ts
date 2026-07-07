import type { MdastPluginDefinition } from 'satteri'
import { createFireOncePlugin, materializeTree, setSatteriFrontmatter } from '../utils/satteri.js'

const DEFAULT_RAW_MDX_KEY = 'rawMdx'
const DEFAULT_MDAST_KEY = 'mdast'

function resolveKey(option: string | true, defaultKey: string): string {
	return typeof option === 'string' ? option : defaultKey
}

/**
 * Create a Sätteri MDAST plugin that injects the raw source string into the
 * document frontmatter (`ctx.data.astro.frontmatter`), making it accessible in
 * layouts and components via `Astro.props.frontmatter`.
 *
 * Mirrors the `rawMdx` half of the remark
 * {@link createFrontmatterInjectTransform} for Sätteri pipelines.
 *
 * @param rawMdx - `true` to inject as `frontmatter.rawMdx`, or a string to use
 *   a custom property name.
 */
export function createSatteriRawMdxInjectPlugin(rawMdx: string | true): MdastPluginDefinition {
	const key = resolveKey(rawMdx, DEFAULT_RAW_MDX_KEY)
	return createFireOncePlugin('astro-mdx-kit:frontmatter-raw-mdx', (_root, context) => {
		setSatteriFrontmatter(context, key, context.source)
	})
}

/**
 * Create a Sätteri MDAST plugin that injects the MDAST tree into the document
 * frontmatter (`ctx.data.astro.frontmatter`).
 *
 * The tree is materialized to a plain JSON object reflecting the state
 * **after** the astro-mdx-kit transforms (this plugin runs as the last pass)
 * but **before** HAST/MDX compilation.
 *
 * Mirrors the `mdast` half of the remark
 * {@link createFrontmatterInjectTransform} for Sätteri pipelines.
 *
 * @param mdast - `true` to inject as `frontmatter.mdast`, or a string to use a
 *   custom property name.
 */
export function createSatteriMdastInjectPlugin(mdast: string | true): MdastPluginDefinition {
	const key = resolveKey(mdast, DEFAULT_MDAST_KEY)
	return createFireOncePlugin('astro-mdx-kit:frontmatter-mdast', (root, context) => {
		setSatteriFrontmatter(context, key, materializeTree(root))
	})
}
