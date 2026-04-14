/* eslint-disable ts/no-unsafe-type-assertion -- constructing mock MDX AST nodes requires type widening */
/* eslint-disable ts/triple-slash-reference */

/// <reference types="mdast-util-mdx-jsx" />
/// <reference types="mdast-util-mdxjs-esm" />

import type { Image, Root } from 'mdast'
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import type { MdxjsEsm } from 'mdast-util-mdxjs-esm'
import { visit } from 'unist-util-visit'
import { describe, expect, it } from 'vitest'
import type { ElementConfig } from '../src/types'
import type { ResolvedComponentConfig } from '../src/utils/resolve-config'
import { createElementTransform } from '../src/plugins/remark-elements'
import { createComponentsExportNode } from '../src/utils/ast'
import { resolveElementConfig } from '../src/utils/resolve-config'

function runPlugin(tree: Root, elements: Record<string, ElementConfig>) {
	const configs: Record<string, ResolvedComponentConfig> = {}
	for (const [name, config] of Object.entries(elements)) {
		configs[name] = resolveElementConfig(name, config)
	}

	createElementTransform({ configs })(tree)
	return tree
}

function findEsm(children: Root['children']): MdxjsEsm[] {
	return children.filter((c): c is MdxjsEsm => c.type === 'mdxjsEsm')
}

function findJsxFlowAnywhere(tree: Root): MdxJsxFlowElement | undefined {
	let found: MdxJsxFlowElement | undefined
	visit(tree, 'mdxJsxFlowElement', (node) => {
		found = node
	})
	return found
}

function findAttribute(jsx: MdxJsxFlowElement, name: string): MdxJsxAttribute | undefined {
	return jsx.attributes.find(
		(a): a is MdxJsxAttribute => a.type === 'mdxJsxAttribute' && a.name === name,
	)
}

describe('remarkMdxKitElements — simple overrides (export const components)', () => {
	it('injects export const components for simple element overrides', () => {
		const tree: Root = {
			children: [{ children: [{ type: 'text', value: 'Title' }], depth: 1, type: 'heading' }],
			type: 'root',
		}

		runPlugin(tree, { h1: 'src/components/Heading.astro' })

		const esmNodes = findEsm(tree.children)
		expect(esmNodes.length).toBeGreaterThanOrEqual(2)

		const exportNode = esmNodes.find((n) => n.value.includes('export const components'))
		expect(exportNode).toBeDefined()
		expect(exportNode!.value).toContain('h1')
	})

	it('injects export const components for custom PascalCase component names', () => {
		const tree: Root = {
			children: [
				{
					attributes: [],
					children: [],
					name: 'Excerpt',
					type: 'mdxJsxFlowElement',
				} as unknown as Root['children'][number],
			],
			type: 'root',
		}

		// eslint-disable-next-line ts/naming-convention -- testing PascalCase component name as element key
		runPlugin(tree, { Excerpt: 'src/components/Excerpt.astro' })

		const esmNodes = findEsm(tree.children)
		expect(esmNodes.length).toBeGreaterThanOrEqual(2)

		const importNode = esmNodes.find((n) => n.value.includes('Excerpt.astro'))
		expect(importNode).toBeDefined()
		expect(importNode!.value).toContain('_MdxKit_Excerpt')

		const exportNode = esmNodes.find((n) => n.value.includes('export const components'))
		expect(exportNode).toBeDefined()
		expect(exportNode!.value).toContain('Excerpt')
		expect(exportNode!.value).toContain('_MdxKit_Excerpt')
	})

	it('merges into an existing export const components', () => {
		const existingExport = createComponentsExportNode({ p: '_UserP' })
		const tree: Root = {
			children: [
				existingExport as unknown as Root['children'][number],
				{ children: [{ type: 'text', value: 'Title' }], depth: 1, type: 'heading' },
			],
			type: 'root',
		}

		runPlugin(tree, { h1: 'src/components/Heading.astro' })

		const exportNodes = findEsm(tree.children).filter((n) =>
			n.value.includes('export const components'),
		)
		expect(exportNodes).toHaveLength(1)
	})
})

describe('remarkMdxKitElements — autoImport (direct AST transform)', () => {
	it('transforms image nodes with autoImport', () => {
		const image: Image = {
			alt: 'Hero image',
			title: 'Hero',
			type: 'image',
			url: '../assets/hero.png',
		}
		const tree: Root = {
			children: [{ children: [image], type: 'paragraph' }],
			type: 'root',
		}

		runPlugin(tree, {
			img: {
				autoImport: 'src',
				component: 'Picture',
				componentModule: 'astro:assets',
			},
		})

		const jsx = findJsxFlowAnywhere(tree)

		expect(jsx).toBeDefined()
		expect(jsx!.name).toBe('Picture')

		const srcAttribute = findAttribute(jsx!, 'src')
		expect(srcAttribute!.value).toHaveProperty('type', 'mdxJsxAttributeValueExpression')

		const altAttribute = findAttribute(jsx!, 'alt')
		expect(altAttribute!.value).toBe('Hero image')

		const titleAttribute = findAttribute(jsx!, 'title')
		expect(titleAttribute!.value).toBe('Hero')
	})

	it('deduplicates image imports for same src', () => {
		const image1: Image = { alt: 'First', type: 'image', url: './same.png' }
		const image2: Image = { alt: 'Second', type: 'image', url: './same.png' }
		const tree: Root = {
			children: [
				{ children: [image1], type: 'paragraph' },
				{ children: [image2], type: 'paragraph' },
			],
			type: 'root',
		}

		runPlugin(tree, {
			img: {
				autoImport: 'src',
				component: 'Picture',
				componentModule: 'astro:assets',
			},
		})

		expect(findEsm(tree.children)).toHaveLength(2)
	})

	it('skips autoImport for external URLs', () => {
		const image: Image = {
			alt: 'Remote',
			type: 'image',
			url: 'https://example.com/photo.jpg',
		}
		const tree: Root = {
			children: [{ children: [image], type: 'paragraph' }],
			type: 'root',
		}

		runPlugin(tree, {
			img: {
				autoImport: 'src',
				component: 'Picture',
				componentModule: 'astro:assets',
			},
		})

		const jsx = findJsxFlowAnywhere(tree)

		const srcAttribute = findAttribute(jsx!, 'src')
		expect(srcAttribute!.value).toBe('https://example.com/photo.jpg')

		expect(findEsm(tree.children)).toHaveLength(1)
	})

	it('forwards data.hProperties from remark-attribute-list as JSX attributes', () => {
		const image: Image = {
			alt: 'Photo',
			data: { hProperties: { loading: 'eager', zoom: 'true' } },
			type: 'image',
			url: './photo.png',
		}
		const tree: Root = {
			children: [{ children: [image], type: 'paragraph' }],
			type: 'root',
		}

		runPlugin(tree, {
			img: {
				autoImport: 'src',
				component: 'Picture',
				componentModule: 'astro:assets',
			},
		})

		const jsx = findJsxFlowAnywhere(tree)
		expect(jsx).toBeDefined()

		const zoomAttribute = findAttribute(jsx!, 'zoom')
		expect(zoomAttribute).toBeDefined()
		expect(zoomAttribute!.value).toBe('true')

		const loadingAttribute = findAttribute(jsx!, 'loading')
		expect(loadingAttribute).toBeDefined()
		expect(loadingAttribute!.value).toBe('eager')
	})

	it('auto-imports hProperties values that match autoImport entries', () => {
		const image: Image = {
			alt: 'Dark mode photo',
			data: { hProperties: { srcDark: '../assets/test-dark.jpeg' } },
			type: 'image',
			url: '../assets/test.jpeg',
		}
		const tree: Root = {
			children: [{ children: [image], type: 'paragraph' }],
			type: 'root',
		}

		runPlugin(tree, {
			img: {
				autoImport: ['src', 'srcDark'],
				component: 'Picture',
				componentModule: 'astro:assets',
			},
		})

		const jsx = findJsxFlowAnywhere(tree)
		expect(jsx).toBeDefined()

		// Src should be an expression (auto-imported from node.url)
		const srcAttribute = findAttribute(jsx!, 'src')
		expect(srcAttribute).toBeDefined()
		expect(srcAttribute!.value).toHaveProperty('type', 'mdxJsxAttributeValueExpression')

		// SrcDark should also be an expression (auto-imported from hProperties)
		const srcDarkAttribute = findAttribute(jsx!, 'srcDark')
		expect(srcDarkAttribute).toBeDefined()
		expect(srcDarkAttribute!.value).toHaveProperty('type', 'mdxJsxAttributeValueExpression')

		// The two imports should reference different paths
		const imports = findEsm(tree.children)
		const assetImports = imports.filter((n) => n.value.includes('_mdxKitAsset'))
		expect(assetImports).toHaveLength(2)
		expect(assetImports[0]!.value).not.toBe(assetImports[1]!.value)
	})

	it('does not auto-import hProperties URLs that are not importable paths', () => {
		const image: Image = {
			alt: 'Photo',
			data: { hProperties: { srcDark: 'https://example.com/dark.jpg' } },
			type: 'image',
			url: './photo.png',
		}
		const tree: Root = {
			children: [{ children: [image], type: 'paragraph' }],
			type: 'root',
		}

		runPlugin(tree, {
			img: {
				autoImport: ['src', 'srcDark'],
				component: 'Picture',
				componentModule: 'astro:assets',
			},
		})

		const jsx = findJsxFlowAnywhere(tree)
		expect(jsx).toBeDefined()

		// SrcDark should remain a string (not importable)
		const srcDarkAttribute = findAttribute(jsx!, 'srcDark')
		expect(srcDarkAttribute).toBeDefined()
		expect(srcDarkAttribute!.value).toBe('https://example.com/dark.jpg')
	})

	it('explicit hProperty overrides derived transform for same toProp', () => {
		const image: Image = {
			alt: 'Photo',
			data: { hProperties: { srcDark: './explicit-dark.png' } },
			type: 'image',
			url: './diagram.tldr',
		}
		const tree: Root = {
			children: [{ children: [image], type: 'paragraph' }],
			type: 'root',
		}

		runPlugin(tree, {
			img: {
				autoImport: [
					'src',
					{
						from: 'src',
						to: 'srcDark',
						transform: (path: string) => `${path}?dark=true`,
					},
				],
				component: 'Picture',
				componentModule: 'astro:assets',
			},
		})

		const jsx = findJsxFlowAnywhere(tree)
		expect(jsx).toBeDefined()

		// SrcDark should be the explicit value, not the derived one
		const srcDarkAttribute = findAttribute(jsx!, 'srcDark')
		expect(srcDarkAttribute).toBeDefined()
		expect(srcDarkAttribute!.value).toHaveProperty('type', 'mdxJsxAttributeValueExpression')

		// Verify the import is the explicit path, not the transformed one
		const imports = findEsm(tree.children)
		const importValues = imports.map((n) => n.value)
		expect(importValues.some((v) => v.includes('explicit-dark.png'))).toBe(true)
		expect(importValues.some((v) => v.includes('dark=true'))).toBe(false)
	})

	it('forwards non-autoImport hProperties as strings alongside imported ones', () => {
		const image: Image = {
			alt: 'Photo',
			data: { hProperties: { loading: 'eager', srcDark: '../dark.png' } },
			type: 'image',
			url: './photo.png',
		}
		const tree: Root = {
			children: [{ children: [image], type: 'paragraph' }],
			type: 'root',
		}

		runPlugin(tree, {
			img: {
				autoImport: ['src', 'srcDark'],
				component: 'Picture',
				componentModule: 'astro:assets',
			},
		})

		const jsx = findJsxFlowAnywhere(tree)
		expect(jsx).toBeDefined()

		// Src and srcDark are expressions (auto-imported)
		expect(findAttribute(jsx!, 'src')!.value).toHaveProperty(
			'type',
			'mdxJsxAttributeValueExpression',
		)
		expect(findAttribute(jsx!, 'srcDark')!.value).toHaveProperty(
			'type',
			'mdxJsxAttributeValueExpression',
		)

		// Loading is forwarded as a plain string
		expect(findAttribute(jsx!, 'loading')!.value).toBe('eager')
	})

	it('transforms JSX <img> elements with autoImport', () => {
		const tree: Root = {
			children: [
				{
					attributes: [
						{ name: 'src', type: 'mdxJsxAttribute', value: './photo.webp' },
						{ name: 'alt', type: 'mdxJsxAttribute', value: 'Photo' },
					],
					children: [],
					name: 'img',
					type: 'mdxJsxFlowElement',
				} as unknown as Root['children'][number],
			],
			type: 'root',
		}

		runPlugin(tree, {
			img: {
				autoImport: 'src',
				component: 'Picture',
				componentModule: 'astro:assets',
			},
		})

		const jsx = tree.children.find((c): c is MdxJsxFlowElement => c.type === 'mdxJsxFlowElement')

		expect(jsx!.name).toBe('Picture')

		const srcAttribute = findAttribute(jsx!, 'src')
		expect(srcAttribute!.value).toHaveProperty('type', 'mdxJsxAttributeValueExpression')
	})

	it('transforms JSX <img> elements with multiple autoImport entries', () => {
		const tree: Root = {
			children: [
				{
					attributes: [
						{ name: 'src', type: 'mdxJsxAttribute', value: './photo.webp' },
						{ name: 'srcDark', type: 'mdxJsxAttribute', value: './dark.webp' },
						{ name: 'alt', type: 'mdxJsxAttribute', value: 'Photo' },
					],
					children: [],
					name: 'img',
					type: 'mdxJsxFlowElement',
				} as unknown as Root['children'][number],
			],
			type: 'root',
		}

		runPlugin(tree, {
			img: {
				autoImport: ['src', 'srcDark'],
				component: 'Picture',
				componentModule: 'astro:assets',
			},
		})

		const jsx = tree.children.find((c): c is MdxJsxFlowElement => c.type === 'mdxJsxFlowElement')

		expect(jsx!.name).toBe('Picture')

		// Both src and srcDark should be expression attributes
		const srcAttribute = findAttribute(jsx!, 'src')
		expect(srcAttribute!.value).toHaveProperty('type', 'mdxJsxAttributeValueExpression')

		const srcDarkAttribute = findAttribute(jsx!, 'srcDark')
		expect(srcDarkAttribute!.value).toHaveProperty('type', 'mdxJsxAttributeValueExpression')

		// Alt should remain a string
		const altAttribute = findAttribute(jsx!, 'alt')
		expect(altAttribute!.value).toBe('Photo')
	})
})

describe('remarkMdxKitElements — mixed overrides', () => {
	it('handles both simple and autoImport overrides together', () => {
		const image: Image = { alt: 'Hero', type: 'image', url: './hero.png' }
		const tree: Root = {
			children: [
				{ children: [{ type: 'text', value: 'Title' }], depth: 1, type: 'heading' },
				{ children: [image], type: 'paragraph' },
			],
			type: 'root',
		}

		runPlugin(tree, {
			h1: 'src/components/Heading.astro',
			img: {
				autoImport: 'src',
				component: 'Picture',
				componentModule: 'astro:assets',
			},
		})

		const esmNodes = findEsm(tree.children)
		expect(esmNodes.length).toBeGreaterThanOrEqual(3)

		const exportNode = esmNodes.find((n) => n.value.includes('export const components'))
		expect(exportNode).toBeDefined()

		const jsx = findJsxFlowAnywhere(tree)
		expect(jsx).toBeDefined()
	})
})

function makeImageParagraph(captionText: string): Root {
	const image: Image = { alt: 'Photo', type: 'image', url: './photo.png' }
	return {
		children: [
			{
				children: [image, { type: 'text', value: ` ${captionText}` }],
				type: 'paragraph',
			},
		],
		type: 'root',
	}
}

describe('remarkMdxKitElements — caption modes', () => {
	const figureConfig: ElementConfig = {
		autoImport: 'src',
		caption: 'figure',
		component: 'Picture',
		componentModule: 'astro:assets',
	}

	const childrenConfig: ElementConfig = {
		autoImport: 'src',
		caption: 'children',
		component: 'src/components/FancyImage.astro',
	}

	it('figure mode wraps image + caption in <figure>/<figcaption>', () => {
		const tree = makeImageParagraph('A beautiful sunset')
		runPlugin(tree, { img: figureConfig })

		const figure = tree.children.find((c): c is MdxJsxFlowElement => c.type === 'mdxJsxFlowElement')
		expect(figure).toBeDefined()
		expect(figure!.name).toBe('figure')
		expect(figure!.children).toHaveLength(2)

		// First child: the image component
		const imageChild = figure!.children[0]
		if (imageChild === undefined) {
			throw new Error('imageChild is undefined')
		}
		expect(imageChild.type).toBe('mdxJsxFlowElement')
		expect((imageChild as MdxJsxFlowElement).name).toBe('Picture')

		// Second child: figcaption
		const figcaptionChild = figure!.children[1]
		if (figcaptionChild === undefined) {
			throw new Error('figcaptionChild is undefined')
		}
		expect(figcaptionChild.type).toBe('mdxJsxFlowElement')
		expect((figcaptionChild as MdxJsxFlowElement).name).toBe('figcaption')
	})

	it('children mode passes caption as children of the component', () => {
		const tree = makeImageParagraph('Caption text')
		runPlugin(tree, { img: childrenConfig })

		const jsx = findJsxFlowAnywhere(tree)
		expect(jsx).toBeDefined()
		expect(jsx!.name).toBe('_MdxKit_Img')
		// Should have children (a paragraph wrapping the caption)
		expect(jsx!.children.length).toBeGreaterThan(0)
	})

	it('prop mode passes caption as a string attribute (plain text default)', () => {
		const tree = makeImageParagraph('Plain caption')
		runPlugin(tree, {
			img: {
				autoImport: 'src',
				caption: { prop: 'caption' },
				component: 'src/components/FancyImage.astro',
			},
		})

		const jsx = findJsxFlowAnywhere(tree)
		expect(jsx).toBeDefined()
		const captionAttribute = findAttribute(jsx!, 'caption')
		expect(captionAttribute).toBeDefined()
		expect(captionAttribute!.value).toBe('Plain caption')
	})

	it('prop mode with format: raw passes raw markdown', () => {
		const image: Image = { alt: 'Photo', type: 'image', url: './photo.png' }
		const tree: Root = {
			children: [
				{
					children: [
						image,
						{ type: 'text', value: ' ' },
						{
							children: [{ type: 'text', value: 'bold' }],
							type: 'strong',
						},
						{ type: 'text', value: ' caption' },
					],
					type: 'paragraph',
				},
			],
			type: 'root',
		}

		runPlugin(tree, {
			img: {
				autoImport: 'src',
				caption: { format: 'raw', prop: 'caption' },
				component: 'src/components/FancyImage.astro',
			},
		})

		const jsx = findJsxFlowAnywhere(tree)
		const captionAttribute = findAttribute(jsx!, 'caption')
		expect(captionAttribute).toBeDefined()
		// Raw markdown should contain ** for bold
		expect(captionAttribute!.value).toContain('**bold**')
	})

	it('prop mode with format: rendered passes HTML', () => {
		const image: Image = { alt: 'Photo', type: 'image', url: './photo.png' }
		const tree: Root = {
			children: [
				{
					children: [
						image,
						{ type: 'text', value: ' ' },
						{
							children: [{ type: 'text', value: 'bold' }],
							type: 'strong',
						},
					],
					type: 'paragraph',
				},
			],
			type: 'root',
		}

		runPlugin(tree, {
			img: {
				autoImport: 'src',
				caption: { format: 'rendered', prop: 'caption' },
				component: 'src/components/FancyImage.astro',
			},
		})

		const jsx = findJsxFlowAnywhere(tree)
		const captionAttribute = findAttribute(jsx!, 'caption')
		expect(captionAttribute).toBeDefined()
		// Rendered HTML should contain <strong>
		expect(captionAttribute!.value).toContain('<strong>')
	})

	it('does not wrap when there is no caption text', () => {
		const image: Image = { alt: 'Photo', type: 'image', url: './photo.png' }
		const tree: Root = {
			children: [{ children: [image], type: 'paragraph' }],
			type: 'root',
		}

		runPlugin(tree, { img: figureConfig })

		// Should NOT produce a <figure> — just the image in the paragraph
		const figure = tree.children.find(
			(c): c is MdxJsxFlowElement => c.type === 'mdxJsxFlowElement' && c.name === 'figure',
		)
		expect(figure).toBeUndefined()
	})

	it('preserves current behavior when caption is undefined', () => {
		const tree = makeImageParagraph('Some text')
		runPlugin(tree, {
			img: {
				autoImport: 'src',
				component: 'Picture',
				componentModule: 'astro:assets',
			},
		})

		// Paragraph should still exist (no figure wrapping)
		expect(tree.children.some((c) => c.type === 'paragraph')).toBe(true)
	})

	it('skips caption extraction when paragraph has multiple images', () => {
		const img1: Image = { alt: 'First', type: 'image', url: './a.png' }
		const img2: Image = { alt: 'Second', type: 'image', url: './b.png' }
		const tree: Root = {
			children: [
				{
					children: [img1, { type: 'text', value: ' middle ' }, img2],
					type: 'paragraph',
				},
			],
			type: 'root',
		}

		runPlugin(tree, { img: figureConfig })

		// Should NOT produce a <figure>
		const figure = tree.children.find(
			(c): c is MdxJsxFlowElement => c.type === 'mdxJsxFlowElement' && c.name === 'figure',
		)
		expect(figure).toBeUndefined()
	})

	it('figure mode still generates correct imports', () => {
		const tree = makeImageParagraph('Caption')
		runPlugin(tree, { img: figureConfig })

		const imports = findEsm(tree.children)
		// Component import + asset import
		expect(imports.length).toBeGreaterThanOrEqual(2)
	})
})
