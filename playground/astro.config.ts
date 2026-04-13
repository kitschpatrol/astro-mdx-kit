/* eslint-disable ts/naming-convention */
import mdx from '@astrojs/mdx'
import mdxKit from 'astro-mdx-kit'
import { defineConfig } from 'astro/config'

process.env.BROWSER = 'chromium'

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
				h1: 'src/components/Heading.astro',
				img: {
					autoImport: 'src',
					caption: { format: 'rendered', prop: 'caption' },
					component: 'src/components/CustomImage.astro',
				},
			},
			mdast: true,
			rawMdx: true,
			unwrapImages: true,
		}),
		// GFM enabled by default
		mdx(),
	],
})
