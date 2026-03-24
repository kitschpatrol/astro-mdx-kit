import type { AutoImportEntry } from './types.js'

/**
 * Auto-import entry that generates a dark variant for `.tldr` files
 * via `@kitschpatrol/unplugin-tldraw`.
 *
 * Add to an `autoImport` array alongside the primary import to
 * automatically set `srcDark` for `.tldr` paths.
 * @example
 * ```ts
 * elements: {
 *   img: {
 *     autoImport: ['src', tldrawDarkImport],
 *     component: 'Picture',
 *     componentModule: 'astro-media-kit/components',
 *   },
 * }
 * ```
 */
export const tldrawDarkImport: AutoImportEntry = {
	from: 'src',
	to: 'srcDark',
	transform(path: string) {
		// eslint-disable-next-line unicorn/no-useless-undefined
		if (!/\.tldr(?:\?|$)/.test(path)) return undefined
		return `${path}${path.includes('?') ? '&' : '?'}dark=true&tldr`
	},
}
