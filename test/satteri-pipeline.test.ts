/* eslint-disable ts/naming-convention -- directive names are PascalCase by convention */

import type { Data } from 'satteri'
import { markdownToHtml, mdxToJs } from 'satteri'
import { describe, expect, it } from 'vitest'
import type { MdxKitOptions } from '../src/types'
import { satteriMdxKit } from '../src/satteri-plugin'

const ASSET_IMPORT_REGEX = /import _mdxKitAsset\w+ from "\.\/photo\.jpg"/v
const SRC_ATTRIBUTE_REGEX = /src: _mdxKitAsset\w+/v
const H1_MAPPING_REGEX = /h1: _MdxKit_H1/v
const PICTURE_IN_PARAGRAPH_REGEX = /_components\.p, \{\s*children: _jsx\(Picture/v
const PARAGRAPH_IN_SPAN_REGEX = /span[\s\S]*?_components\.p/v

async function compileMdx(source: string, options: MdxKitOptions, data: Data = {}) {
	return mdxToJs(source, {
		data,
		features: { directive: true },
		jsxImportSource: 'astro',
		mdastPlugins: satteriMdxKit(options),
	})
}

describe('satteri directives', () => {
	it('transforms a container directive into a JSX component with an import', async () => {
		const source = ':::Block{type="warning"}\nBody content\n:::\n'
		const result = await compileMdx(source, {
			directives: { Block: 'src/components/Block.astro' },
		})

		expect(result.code).toContain('import _MdxKit_Block from "/src/components/Block.astro"')
		expect(result.code).toContain('_MdxKit_Block')
		expect(result.code).toContain('type: "warning"')
		expect(result.code).toContain('Body content')
	})

	it('extracts container labels and applies propMap renaming', async () => {
		const source = ':::Callout[The **label** text]{type="info"}\nBody\n:::\n'
		const result = await compileMdx(source, {
			directives: {
				Callout: {
					component: 'src/components/Callout.astro',
					label: 'title',
					propMap: { type: 'variant' },
				},
			},
		})

		expect(result.code).toContain('title: "The label text"')
		expect(result.code).toContain('variant: "info"')
		expect(result.code).not.toContain('type: "info"')
	})

	it('transforms leaf and text directives', async () => {
		const source = '::Video[intro]{id="abc"}\n\nInline :Note[note text] here.\n'
		const result = await compileMdx(source, {
			directives: {
				Note: { component: 'src/components/Note.astro', label: 'content' },
				Video: { component: 'src/components/Video.astro', label: 'title' },
			},
		})

		expect(result.code).toContain('title: "intro"')
		expect(result.code).toContain('id: "abc"')
		expect(result.code).toContain('content: "note text"')
	})

	it('resolves directive autoImport attributes to asset imports', async () => {
		const source = '::CustomImage{src="./photo.jpg" alt="hi"}\n'
		const result = await compileMdx(source, {
			directives: {
				CustomImage: { autoImport: 'src', component: 'src/components/CustomImage.astro' },
			},
		})

		expect(result.code).toMatch(ASSET_IMPORT_REGEX)
		expect(result.code).toMatch(SRC_ATTRIBUTE_REGEX)
		expect(result.code).toContain('alt: "hi"')
	})

	it('leaves directives without a matching config alone', async () => {
		const source = ':::Block\nKeep me\n:::\n\n:::Other\nDropped by satteri\n:::\n'
		const result = await compileMdx(source, {
			directives: { Block: 'src/components/Block.astro' },
		})

		expect(result.code).toContain('_MdxKit_Block')
		expect(result.code).not.toContain('_MdxKit_Other')
	})

	it('deduplicates component imports across multiple directives', async () => {
		const source = ':::Block\nOne\n:::\n\n:::Block\nTwo\n:::\n'
		const result = await compileMdx(source, {
			directives: { Block: 'src/components/Block.astro' },
		})

		const importCount = result.code.split('import _MdxKit_Block').length - 1
		expect(importCount).toBe(1)
	})
})

describe('satteri elements', () => {
	it('injects export const components for simple overrides', async () => {
		const result = await compileMdx('# Title\n', {
			elements: { h1: 'src/components/Heading.astro' },
		})

		expect(result.code).toContain('import _MdxKit_H1 from "/src/components/Heading.astro"')
		expect(result.code).toMatch(H1_MAPPING_REGEX)
	})

	it('merges into an existing components export, with document entries taking precedence', async () => {
		const source = [
			"import Quote from './Quote.astro'",
			'',
			'export const components = { blockquote: Quote }',
			'',
			'# Title',
			'',
		].join('\n')
		const result = await compileMdx(source, {
			elements: { h1: 'src/components/Heading.astro' },
		})

		// Single merged export containing both mappings
		expect(result.code).toContain('h1: _MdxKit_H1')
		expect(result.code).toContain('blockquote: Quote')
		const exportCount = result.code.split('export const components').length - 1
		expect(exportCount).toBe(1)
	})

	it('merges into a multi-declarator components export', async () => {
		const source = [
			"import Quote from './Quote.astro'",
			'',
			'export const level = 2, components = { blockquote: Quote }',
			'',
			'# Title',
			'',
		].join('\n')
		const result = await compileMdx(source, {
			elements: { h1: 'src/components/Heading.astro' },
		})

		// Merged into the existing declarator — no separate injected export
		expect(result.code).toContain('export const level = 2, components =')
		expect(result.code).toContain('h1: _MdxKit_H1')
		expect(result.code).toContain('blockquote: Quote')
		expect(result.code).not.toContain('export const components')
	})

	it('does not inject a duplicate export when components is re-exported via a specifier', async () => {
		const source = ["export { components } from './components-map.js'", '', '# Title', ''].join(
			'\n',
		)
		const result = await compileMdx(source, {
			elements: { h1: 'src/components/Heading.astro' },
		})

		// This form can't be merged into — the override is skipped (with a
		// warning) rather than emitting a second, conflicting export
		expect(result.code).not.toContain('export const components')
	})

	it('replaces markdown images with the component when autoImport is set', async () => {
		const result = await compileMdx('![Alt text](./photo.jpg)\n', {
			elements: {
				img: { autoImport: 'src', component: 'Picture', componentModule: 'astro:assets' },
			},
		})

		expect(result.code).toContain('import { Picture } from "astro:assets"')
		expect(result.code).toMatch(ASSET_IMPORT_REGEX)
		expect(result.code).toMatch(SRC_ATTRIBUTE_REGEX)
		expect(result.code).toContain('alt: "Alt text"')
	})

	it('renames raw JSX elements and rewrites their attributes', async () => {
		const result = await compileMdx('<img src="./raw.jpg" alt="raw" data-x="1" />\n', {
			elements: {
				img: { autoImport: 'src', component: 'Picture', componentModule: 'astro:assets' },
			},
		})

		expect(result.code).toContain('import { Picture } from "astro:assets"')
		expect(result.code).toMatch(SRC_ATTRIBUTE_REGEX)
		expect(result.code).toContain('alt: "raw"')
		expect(result.code).toContain('"data-x": "1"')
	})

	it('serializes adjacent caption text into a prop when caption is prop-configured', async () => {
		const result = await compileMdx('![Alt](./photo.jpg) A *fancy* caption.\n', {
			elements: {
				img: {
					autoImport: 'src',
					caption: { format: 'plain', prop: 'caption' },
					component: 'Picture',
					componentModule: 'astro:assets',
				},
			},
		})

		expect(result.code).toContain('caption: "A fancy caption."')
	})

	it('wraps image and caption in figure/figcaption when caption is "figure"', async () => {
		const result = await compileMdx('![Alt](./photo.jpg) The caption.\n', {
			elements: {
				img: {
					autoImport: 'src',
					caption: 'figure',
					component: 'Picture',
					componentModule: 'astro:assets',
				},
			},
		})

		expect(result.code).toContain('figure')
		expect(result.code).toContain('figcaption')
		expect(result.code).toContain('The caption.')
	})
})

describe('satteri captionImages', () => {
	it('wraps captioned images in figure/figcaption preserving the image node', async () => {
		const result = await compileMdx('![Alt](./photo.jpg) A caption here.\n', {
			captionImages: true,
		})

		expect(result.code).toContain('figure')
		expect(result.code).toContain('figcaption')
		expect(result.code).toContain('A caption here.')
		// Original markdown image preserved (rendered via _components.img)
		expect(result.code).toContain('./photo.jpg')
	})

	it('skips paragraphs with multiple images', async () => {
		const result = await compileMdx('![One](./a.jpg) ![Two](./b.jpg) caption?\n', {
			captionImages: true,
		})

		expect(result.code).not.toContain('figcaption')
	})
})

describe('satteri unwrapImages', () => {
	it('unwraps stand-alone images from their paragraph', async () => {
		const result = await compileMdx('![Alt](./photo.jpg)\n', {
			elements: {
				img: { autoImport: 'src', component: 'Picture', componentModule: 'astro:assets' },
			},
			unwrapImages: true,
		})

		// The Picture element is emitted directly, not inside a paragraph
		expect(result.code).not.toMatch(PICTURE_IN_PARAGRAPH_REGEX)
	})
})

describe('satteri unwrapPhrasingContent', () => {
	it('removes paragraphs nested in phrasing-only elements', async () => {
		const source = '<span>\n\nJust text\n\n</span>\n'
		const result = await compileMdx(source, { unwrapPhrasingContent: true })

		expect(result.code).not.toMatch(PARAGRAPH_IN_SPAN_REGEX)
		expect(result.code).toContain('Just text')
	})
})

describe('satteri frontmatter injection', () => {
	it('injects raw source and mdast tree into frontmatter', async () => {
		const source = '# Hello\n\nWorld\n'
		const data: Data = {
			astro: {
				frontmatter: { existing: true },
				headings: [],
				localImagePaths: new Set(),
				remoteImagePaths: new Set(),
			},
		}
		await compileMdx(source, { mdast: true, rawMdx: true }, data)

		const astro = data.astro as { frontmatter: Record<string, unknown> }
		expect(astro.frontmatter.existing).toBe(true)
		expect(astro.frontmatter.rawMdx).toBe(source)

		const mdast = astro.frontmatter.mdast as { children: unknown[]; type: string }
		expect(mdast.type).toBe('root')
		expect(mdast.children.length).toBeGreaterThan(0)
		expect(JSON.stringify(mdast)).not.toContain('"_id"')
	})

	it('supports custom frontmatter keys', async () => {
		const data: Data = {}
		await compileMdx('# Hi\n', { mdast: 'tree', rawMdx: 'source' }, data)

		const astro = data.astro as { frontmatter: Record<string, unknown> }
		expect(astro.frontmatter.source).toBe('# Hi\n')
		expect(astro.frontmatter.tree).toBeDefined()
	})
})

describe('satteri plain markdown compatibility', () => {
	it('does not crash when running on plain markdown', async () => {
		const result = await markdownToHtml('# Hello\n\n![Alt](./photo.jpg)\n', {
			features: { directive: true },
			mdastPlugins: satteriMdxKit({
				captionImages: true,
				directives: { Block: 'src/components/Block.astro' },
				unwrapImages: true,
			}),
		})

		expect(result.html).toContain('Hello')
	})
})

describe('satteriMdxKit plugin list', () => {
	it('returns no plugins when no options are set', () => {
		expect(satteriMdxKit({})).toEqual([])
	})

	it('orders plugins to match the remark pipeline', () => {
		const plugins = satteriMdxKit({
			captionImages: true,
			directives: { Block: 'src/components/Block.astro' },
			elements: { h1: 'src/components/Heading.astro' },
			mdast: true,
			rawMdx: true,
			unwrapImages: true,
			unwrapPhrasingContent: true,
		})

		const names = plugins.map((plugin) => plugin.name)
		expect(names).toEqual([
			'astro-mdx-kit:frontmatter-raw-mdx',
			'astro-mdx-kit:directives',
			'astro-mdx-kit:elements-components-merge',
			'astro-mdx-kit:elements-components-inject',
			'astro-mdx-kit:caption-images',
			'astro-mdx-kit:unwrap-phrasing',
			'astro-mdx-kit:unwrap-images',
			'astro-mdx-kit:frontmatter-mdast',
		])
	})
})
