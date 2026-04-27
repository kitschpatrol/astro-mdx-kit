import type { AutoImportEntry, DetailedElementConfig } from './types.js'

/**
 * Element override that replaces `<img>` with Astro's `<Image>` component from
 * `astro:assets`, with automatic ESM imports for the `src` prop.
 *
 * @example
 * 	import { astroImage } from 'astro-mdx-kit'
 *
 * 	mdxKit({
 * 		elements: { img: astroImage },
 * 	})
 */
export const astroImage: DetailedElementConfig = {
	autoImport: 'src',
	component: 'Image',
	componentModule: 'astro:assets',
}

/**
 * Element override that replaces `<img>` with Astro's `<Picture>` component
 * from `astro:assets`, with automatic ESM imports for the `src` prop.
 *
 * @example
 * 	import { astroPicture } from 'astro-mdx-kit'
 *
 * 	mdxKit({
 * 		elements: { img: astroPicture },
 * 	})
 */
export const astroPicture: DetailedElementConfig = {
	autoImport: 'src',
	component: 'Picture',
	componentModule: 'astro:assets',
}

/**
 * Auto-import entry that generates a dark variant for `.tldr` files via
 * `@kitschpatrol/unplugin-tldraw`.
 *
 * Add to an `autoImport` array alongside the primary import to automatically
 * set `srcDark` for `.tldr` paths.
 *
 * @example
 * 	elements: {
 * 	img: {
 * 	autoImport: ['src', tldrawDarkImport],
 * 	component: 'Picture',
 * 	componentModule: 'astro-media-kit/components',
 * 	},
 * 	}
 */
const TLDRAW_EXTENSION_REGEX = /\.tldr(?:\?|$)/

export const tldrawDarkImport: AutoImportEntry = {
	from: 'src',
	to: 'srcDark',
	transform(path: string) {
		if (!TLDRAW_EXTENSION_REGEX.test(path)) {
			// eslint-disable-next-line unicorn/no-useless-undefined
			return undefined
		}

		return `${path}${path.includes('?') ? '&' : '?'}dark=true&tldr`
	},
}
