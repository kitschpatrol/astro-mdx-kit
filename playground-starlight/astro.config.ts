/* eslint-disable ts/naming-convention */

import starlight from '@astrojs/starlight'
import mdxKit, { astroPicture } from 'astro-mdx-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
	integrations: [
		mdxKit({
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
			title: 'astro-mdx-kit Playground',
		}),
	],
})
