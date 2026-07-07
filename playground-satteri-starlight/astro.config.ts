/* eslint-disable ts/naming-convention */

import mdx from '@astrojs/mdx'
import starlight from '@astrojs/starlight'
import mdxKit, { astroPicture } from 'astro-mdx-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
	integrations: [
		mdxKit({
			// Not supported on Sätteri — exercises the warning
			attributes: true,
			captionImages: true,
			directives: {
				Block: 'src/components/Block.astro',
				Callout: {
					component: 'src/components/Callout.astro',
					label: 'title',
					propMap: { type: 'variant' },
				},
				CustomImage: {
					autoImport: 'src',
					component: 'src/components/CustomImage.astro',
				},
			},
			elements: {
				Excerpt: 'src/components/Excerpt.astro',
				h2: 'src/components/HeadingTwo.astro',
				img: {
					...astroPicture,
					caption: 'figure',
				},
			},
			mdast: true,
			rawMdx: true,
			unwrapImages: true,
		}),
		starlight({
			sidebar: [
				{
					items: [{ label: 'MDX Kit Features', slug: 'guides/mdx-kit-features' }],
					label: 'Guides',
				},
			],
			social: [{ href: 'https://github.com/withastro/starlight', icon: 'github', label: 'GitHub' }],
			title: 'astro-mdx-kit Playground (Sätteri)',
		}),
		// Starlight adds `mdx({ optimize: true })` by default, but MDX's optimizer
		// renders static elements as raw HTML, bypassing `components` overrides.
		// Providing MDX explicitly (after Starlight, so astro-expressive-code stays
		// ahead of it) lets us exempt h2 so the `elements.h2` override applies.
		mdx({ optimize: { ignoreElementNames: ['h2'] } }),
	],
})
