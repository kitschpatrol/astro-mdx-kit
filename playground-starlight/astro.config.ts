// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import mdxKit from 'astro-mdx-kit'

export default defineConfig({
	integrations: [
		mdxKit({
			attributes: true,
			captionImages: true,
			directives: {
				Block: 'src/components/Block.astro',
				CustomImage: {
					autoImport: 'src',
					component: 'src/components/CustomImage.astro',
				},
			},
			elements: {
				h2: 'src/components/HeadingTwo.astro',
				// Temp off
				// img: {
				// 	component: 'Picture',
				// 	componentModule: 'astro:assets',
				// },
			},
			unwrapImages: true,
		}),
		starlight({
			title: 'My Docs',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/withastro/starlight' }],
			sidebar: [
				{
					label: 'Guides',
					items: [
						// Each item here is one entry in the navigation menu.
						{ label: 'Example Guide', slug: 'guides/example' },
					],
				},
				{
					label: 'Reference',
					autogenerate: { directory: 'reference' },
				},
			],
		}),
	],
})
