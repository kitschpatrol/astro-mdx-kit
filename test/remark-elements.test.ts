/* eslint-disable ts/no-unsafe-type-assertion -- constructing mock MDX AST nodes requires type widening */
/* eslint-disable ts/triple-slash-reference */

/// <reference types="mdast-util-mdx-jsx" />
/// <reference types="mdast-util-mdxjs-esm" />

import type { Image, Root } from 'mdast'
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import type { MdxjsEsm } from 'mdast-util-mdxjs-esm'
import { visit } from 'unist-util-visit'
import { describe, expect, it } from 'vitest'
import type { ComponentConfig } from '../src/types'
import type { ResolvedComponentConfig } from '../src/utils/resolve-config'
import { createElementTransform } from '../src/plugins/remark-elements'
import { createComponentsExportNode } from '../src/utils/ast'
import { resolveComponentConfig } from '../src/utils/resolve-config'

function runPlugin(tree: Root, elements: Record<string, ComponentConfig>) {
	const configs: Record<string, ResolvedComponentConfig> = {}
	for (const [name, config] of Object.entries(elements)) {
		configs[name] = resolveComponentConfig(name, config)
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
