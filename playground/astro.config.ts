/* eslint-disable ts/naming-convention */
import mdx from '@astrojs/mdx'
// import mdxDirective from 'astro-mdx-directive'
import mdxKit from 'astro-mdx-kit'
import { defineConfig } from 'astro/config'

process.env.BROWSER = 'chromium'

// https://astro.build/config
export default defineConfig({
	integrations: [
		mdxKit({
			captionImages: true,
			directives: {
				Block: 'src/components/Block.astro',
				CustomImage: {
					autoImport: 'src',
					component: 'src/components/CustomImage.astro',
				},
			},
			elements: {
				h1: 'src/components/Heading.astro',
				// Temp off
				// img: {
				// 	component: 'Picture',
				// 	componentModule: 'astro:assets',
				// },
			},
			unwrapImages: true,
		}),
		// MdxDirective({
		// 	directives: {
		// 		leaf: [{ name: 'Block', path: 'src/components/Block.astro' }],
		// 	},
		// }),
		// GFM enabled by default
		mdx(),
	],
})
