/* eslint-disable ts/triple-slash-reference */
/* eslint-disable ts/naming-convention -- directive names are PascalCase by convention */

/// <reference types="mdast-util-mdx-jsx" />
/// <reference types="mdast-util-mdxjs-esm" />

import type { Root } from 'mdast'
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx'
import type { MdxjsEsm } from 'mdast-util-mdxjs-esm'
import { createMarkdownProcessor } from '@astrojs/markdown-remark'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { VFile } from 'vfile'
import { describe, expect, it } from 'vitest'
import type { MdxKitOptions } from '../src/types'
import { astroPicture } from '../src/presets'
import remarkMdxKitPlugin from '../src/remark-plugin'

function parse(source: string, options: MdxKitOptions): Root {
	return unified().use(remarkParse).use(remarkMdxKitPlugin, options).parse(source)
}

function transform(source: string, options: MdxKitOptions, path?: string): Root {
	const processor = unified().use(remarkParse).use(remarkMdxKitPlugin, options)
	const file = new VFile({ path, value: source })

	return processor.runSync(processor.parse(file), file)
}

function findJsxFlow(tree: Root, name: string): MdxJsxFlowElement | undefined {
	let found: MdxJsxFlowElement | undefined
	visit(tree, 'mdxJsxFlowElement', (node) => {
		if (node.name === name) {
			found = node
		}
	})
	return found
}

function findJsxText(tree: Root, name: string): MdxJsxTextElement | undefined {
	let found: MdxJsxTextElement | undefined
	visit(tree, 'mdxJsxTextElement', (node) => {
		if (node.name === name) {
			found = node
		}
	})
	return found
}

function findEsm(tree: Root): MdxjsEsm[] {
	return tree.children.filter((c): c is MdxjsEsm => c.type === 'mdxjsEsm')
}

describe('attributes option (T3 — end-to-end)', () => {
	it('does not parse {:key="value"} when attributes is false', () => {
		const tree = parse('A paragraph.\n{:.highlight}\n', {})
		// Without attribute-list parsing the `{:.highlight}` survives as plain text
		const text = JSON.stringify(tree)
		expect(text).toContain('{:.highlight}')
	})

	it('attaches kramdown attributes to the preceding paragraph when attributes is true', () => {
		const tree = transform('A paragraph.\n{:.highlight}\n', { attributes: true })

		const paragraph = tree.children.find((c) => c.type === 'paragraph')
		expect(paragraph).toBeDefined()
		// Remark-attribute-list normalizes `{:.highlight}` into hProperties.className
		const hProperties = paragraph?.data?.hProperties
		expect(hProperties?.className).toBeDefined()
	})

	it('attaches kramdown attributes inline to images', () => {
		const tree = transform('![alt](./photo.jpg){:data-lightbox="true"}\n', {
			attributes: true,
		})

		let imageData: Record<string, unknown> | undefined
		visit(tree, 'image', (node) => {
			imageData = node.data?.hProperties
		})
		expect(imageData?.['data-lightbox']).toBe('true')
	})
})

describe('transform composition (T4 — end-to-end)', () => {
	it('runs directives + elements + captionImages + unwrapImages together', () => {
		const source = [
			':::Callout[Heads up]',
			'Body content here.',
			':::',
			'',
			'![Alt](./photo.jpg)',
			'A caption follows.',
			'',
			'![Solo](./solo.jpg)',
			'',
		].join('\n')

		const tree = transform(source, {
			captionImages: true,
			directives: {
				Callout: { component: 'src/components/Callout.astro', label: 'title' },
			},
			elements: {
				img: 'src/components/MyImage.astro',
			},
			unwrapImages: true,
		})

		// Directive should have become a JSX flow element with the resolved name
		const callout = findJsxFlow(tree, '_MdxKit_Callout')
		expect(callout).toBeDefined()
		expect(
			callout?.attributes.some((a) => a.type === 'mdxJsxAttribute' && a.name === 'title'),
		).toBe(true)

		// Caption images: figure + figcaption wraps the captioned image
		const figure = findJsxFlow(tree, 'figure')
		expect(figure).toBeDefined()
		const figcaption = figure?.children.find(
			(c) => c.type === 'mdxJsxFlowElement' && c.name === 'figcaption',
		)
		expect(figcaption).toBeDefined()

		// Solo image: should be unwrapped from its paragraph (not a child of one)
		const topLevelTypes = tree.children.map((c) => c.type)
		// At least one image lives at the top level (the unwrapped solo)
		expect(topLevelTypes).toContain('image')

		// Element override registered the components export and an import
		const esm = findEsm(tree)
		const text = esm.map((n) => n.value).join('\n')
		expect(text).toContain('_MdxKit_Img')
		expect(text).toContain('_MdxKit_Callout')
		expect(text).toContain('export const components')
	})
})

describe('nested directives', () => {
	const directives = {
		Inner: 'src/components/Inner.astro',
		Outer: 'src/components/Outer.astro',
	}

	it('transforms a leaf directive nested in a container directive', () => {
		const tree = transform(':::Outer\n::Inner\n:::\n', { directives })

		const outer = findJsxFlow(tree, '_MdxKit_Outer')
		expect(outer?.children.map((c) => c.type)).toEqual(['mdxJsxFlowElement'])
		expect(findJsxFlow(tree, '_MdxKit_Inner')).toBe(outer?.children[0])
		expect(JSON.stringify(tree)).not.toContain('Directive')
		expect(findEsm(tree)).toHaveLength(2)
	})

	it('transforms a text directive nested in a leaf directive label', () => {
		const tree = transform('::Outer[hello :Inner[x]]\n', { directives })

		const outer = findJsxFlow(tree, '_MdxKit_Outer')
		const paragraph = outer?.children[0]
		expect(paragraph?.type).toBe('paragraph')
		expect(findJsxText(tree, '_MdxKit_Inner')).toBeDefined()
		expect(JSON.stringify(tree)).not.toContain('Directive')
	})

	it('transforms a text directive nested in a text directive', () => {
		const tree = transform('Para :Outer[a :Inner[b]] end\n', { directives })

		const outer = findJsxText(tree, '_MdxKit_Outer')
		expect(outer?.children.map((c) => c.type)).toEqual(['text', 'mdxJsxTextElement'])
		expect(JSON.stringify(tree)).not.toContain('Directive')
	})
})

describe('plain Markdown files', () => {
	const options: MdxKitOptions = {
		captionImages: true,
		directives: { Block: 'src/components/Block.astro' },
		elements: { h1: 'src/components/Heading.astro', img: astroPicture },
		sectionize: true,
		unwrapImages: true,
	}
	const source =
		'# Title\n\n![Alt](./photo.jpg)\nA caption.\n\n![Solo](./solo.jpg)\n\n:::Block\nBody\n:::\n'

	it('skips component-emitting transforms for .md files', () => {
		const tree = transform(source, options, '/docs/page.md')

		expect(findEsm(tree)).toHaveLength(0)
		expect(JSON.stringify(tree)).not.toContain('mdxJsx')
		expect(JSON.stringify(tree)).toContain('containerDirective')
	})

	it('still applies markdown-safe transforms to .md files', () => {
		const tree = transform(source, options, '/docs/page.md')

		const section = tree.children.at(0)
		expect(section?.type).toBe('section')
		expect((section as { children: Array<{ type: string }> }).children.map((c) => c.type)).toEqual([
			'heading',
			'paragraph',
			'image',
			'containerDirective',
		])
	})

	it('applies every transform to .mdx files', () => {
		const tree = transform(source, options, '/docs/page.mdx')

		expect(findEsm(tree).length).toBeGreaterThan(0)
		expect(findJsxFlow(tree, 'Picture')).toBeDefined()
		expect(findJsxFlow(tree, '_MdxKit_Block')).toBeDefined()
		expect(JSON.stringify(tree)).not.toContain('containerDirective')
	})

	it('renders .md files cleanly through the Astro markdown processor', async () => {
		const processor = await createMarkdownProcessor({
			remarkPlugins: [[remarkMdxKitPlugin, options]],
		})
		const result = await processor.render('# Title\n\n![Alt](./photo.jpg)\nA caption.\n', {
			fileURL: new URL('file:///docs/page.md'),
		})

		expect(result.code).toContain('Title</h1>')
		expect(result.code).toContain('<img')
		expect(result.code).toContain('A caption.')
		expect(result.code).not.toContain('import ')
		expect(result.code).not.toContain('export ')
	})
})

describe('unwrapImages option', () => {
	it('keeps recognizing built-in image components when img is overridden', () => {
		const tree = transform(':Picture{src="./photo.jpg"}\n', {
			directives: {
				Picture: { autoImport: 'src', component: 'Picture', componentModule: 'astro:assets' },
			},
			elements: { img: 'src/components/Image.astro' },
			unwrapImages: true,
		})

		expect(tree.children.some((c) => c.type === 'paragraph')).toBe(false)
		expect(tree.children).toContain(findJsxText(tree, 'Picture'))
	})
})

describe('import tracking', () => {
	it('shares component imports and asset numbering across directives and elements', () => {
		const tree = transform('::Picture{src="./a.png" alt="a"}\n\n![b](./b.png)\n', {
			directives: { Picture: astroPicture },
			elements: { img: astroPicture },
		})

		expect(findEsm(tree).map((n) => n.value)).toEqual([
			'import _mdxKitAsset1 from "./b.png"',
			'import { Picture } from "astro:assets"',
			'import _mdxKitAsset0 from "./a.png"',
		])
	})
})

describe('sectionize option', () => {
	it('wraps each heading and its content in nested sections', () => {
		const tree = transform('Intro.\n\n# One\n\nAlpha\n\n## Two\n\nBeta\n\n# Three\n\nGamma\n', {
			sectionize: true,
		})

		expect(tree.children.map((c) => c.type)).toEqual(['paragraph', 'section', 'section'])

		const sections = tree.children as unknown as Array<{
			children: Array<{ type: string }>
			data?: { hName?: string }
			type: string
		}>
		const first = sections[1]
		expect(first?.data?.hName).toBe('section')
		expect(first?.children.map((c) => c.type)).toEqual(['heading', 'paragraph', 'section'])
	})

	it('composes with element overrides on headings', () => {
		const tree = transform('# Title\n\nBody\n', {
			elements: { h1: 'src/components/Heading.astro' },
			sectionize: true,
		})

		const esm = findEsm(tree)
		expect(esm.map((n) => n.value).join('\n')).toContain('_MdxKit_H1')
	})

	it('leaves the tree unchanged when disabled', () => {
		const tree = transform('# One\n\nAlpha\n', {})
		expect(tree.children.map((c) => c.type)).toEqual(['heading', 'paragraph'])
	})
})
