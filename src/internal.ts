/**
 * Internal options key used by the Astro integration to signal that parser
 * extensions (directive, attribute-list) have already been registered as
 * separate remark plugins via `updateConfig`. When set, the remark plugin skips
 * its own `this.data()` / `this.use()` registration to avoid duplicates.
 *
 * Not part of the public API — this module is intentionally not listed in
 * `package.json` exports.
 */
export const SKIP_PARSER_EXTENSIONS = Symbol('skipParserExtensions')

/**
 * Check whether a `boolean | string` frontmatter injection option (`rawMdx`,
 * `mdast`) is enabled: `true` or a non-empty custom key. Narrows out `false`,
 * `undefined`, and the degenerate empty string.
 */
export function isFrontmatterKeyEnabled(
	option: boolean | string | undefined,
): option is string | true {
	return option === true || (typeof option === 'string' && option !== '')
}
