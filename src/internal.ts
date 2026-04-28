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
