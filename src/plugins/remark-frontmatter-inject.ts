import type { Root } from 'mdast'
import type { Plugin } from 'unified'
import type { VFile } from 'vfile'

const DEFAULT_RAW_MDX_KEY = 'rawMdx'
const DEFAULT_MDAST_KEY = 'mdast'

export type RemarkFrontmatterInjectOptions = {
	mdast?: boolean | string
	rawMdx?: boolean | string
}

function resolveKey(option: boolean | string | undefined, defaultKey: string): string | undefined {
	if (option === true) return defaultKey
	if (typeof option === 'string') return option
	return undefined
}

// Astro's frontmatter lives at `file.data.astro.frontmatter` as an untyped
// record. The VFile `data` property is `Record<string, unknown>`, so
// accessing nested Astro-specific structure requires type narrowing that
// the strict linter considers "unsafe". The runtime guards below ensure
// the structure exists before writing.
/* eslint-disable ts/no-unsafe-type-assertion -- Astro frontmatter is inherently untyped */
function setFrontmatter(file: VFile, key: string, value: unknown): void {
	const { data } = file

	if (!data.astro || typeof data.astro !== 'object') {
		data.astro = { frontmatter: {} }
	}

	const astro = data.astro as Record<string, unknown>
	if (!astro.frontmatter || typeof astro.frontmatter !== 'object') {
		astro.frontmatter = {}
	}

	const frontmatter = astro.frontmatter as Record<string, unknown>
	frontmatter[key] ??= value
}
/* eslint-enable ts/no-unsafe-type-assertion */

/**
 * Create the tree transformer for frontmatter injection.
 * Exported separately from the Plugin wrapper for direct use in tests.
 */
export function createFrontmatterInjectTransform(
	options: RemarkFrontmatterInjectOptions,
): (tree: Root, file: VFile) => void {
	const rawMdxKey = resolveKey(options.rawMdx, DEFAULT_RAW_MDX_KEY)
	const mdastKey = resolveKey(options.mdast, DEFAULT_MDAST_KEY)

	return (tree: Root, file: VFile) => {
		if (rawMdxKey) {
			setFrontmatter(file, rawMdxKey, file.value)
		}

		if (mdastKey) {
			setFrontmatter(file, mdastKey, tree)
		}
	}
}

/**
 * Remark plugin that injects raw MDX source and/or the MDAST tree
 * into `file.data.astro.frontmatter` for access in layouts.
 */
export const remarkFrontmatterInject: Plugin<[RemarkFrontmatterInjectOptions], Root> = (options) =>
	createFrontmatterInjectTransform(options)
