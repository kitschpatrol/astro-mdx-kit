/// <reference types="mdast-util-mdx-jsx" />
/// <reference types="mdast-util-mdxjs-esm" />

import type { Image, Root } from 'mdast'
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import type { MdxjsEsm } from 'mdast-util-mdxjs-esm'
import { describe, expect, it } from 'vitest'
import { remarkMdxKitElements } from '../src/plugins/remark-elements'
import { createComponentsExportNode } from '../src/utils/ast'
import { resolveComponentConfig } from '../src/utils/resolve-config'

function runPlugin(
	tree: Root,
	elements: Record<string, Parameters<typeof resolveComponentConfig>[1]>,
) {
	const configs: Record<string, ReturnType<typeof resolveComponentConfig>> = {}
	for (const [name, config] of Object.entries(elements)) {
		configs[name] = resolveComponentConfig(name, config)
	}

	const plugin = remarkMdxKitElements({ configs })
	;(plugin as (tree: Root) => void)(tree)
	return tree
}

describe('remarkMdxKitElements — simple overrides (export const components)', () => {
	it('injects export const components for simple element overrides', () => {
		const tree: Root = {
			type: 'root',
			children: [{ type: 'heading', depth: 1, children: [{ type: 'text', value: 'Title' }] }],
		}

		runPlugin(tree, { h1: 'src/components/Heading.astro' })

		// Should inject an import and an export const components
		const esmNodes = tree.children.filter((c) => c.type === 'mdxjsEsm') as unknown as MdxjsEsm[]
		expect(esmNodes.length).toBeGreaterThanOrEqual(2) // import + export

		const exportNode = esmNodes.find((n) => n.value.includes('export const components'))
		expect(exportNode).toBeDefined()
		expect(exportNode!.value).toContain('h1')
	})

	it('merges into an existing export const components', () => {
		const existingExport = createComponentsExportNode({ p: '_UserP' })
		const tree: Root = {
			type: 'root',
			children: [
				existingExport as unknown as Root['children'][number],
				{ type: 'heading', depth: 1, children: [{ type: 'text', value: 'Title' }] },
			],
		}

		runPlugin(tree, { h1: 'src/components/Heading.astro' })

		// Should NOT create a second export — should merge into existing
		const exportNodes = (tree.children.filter((c) => c.type === 'mdxjsEsm') as unknown as MdxjsEsm[]).filter(
			(n) => n.value.includes('export const components'),
		)
		expect(exportNodes).toHaveLength(1)
	})
})

describe('remarkMdxKitElements — autoImport (direct AST transform)', () => {
	it('transforms image nodes with autoImport', () => {
		const tree: Root = {
			type: 'root',
			children: [
				{
					type: 'paragraph',
					children: [
						{
							type: 'image',
							url: '../assets/hero.png',
							alt: 'Hero image',
							title: 'Hero',
						} as Image,
					],
				},
			],
		}

		runPlugin(tree, {
			img: {
				component: 'Picture',
				componentModule: 'astro:assets',
				autoImport: 'src',
			},
		})

		// The image node should be replaced with a JSX element
		const paragraph = tree.children.find((c) => c.type === 'paragraph')!
		const jsx = (paragraph as { children: unknown[] }).children.find(
			(c: { type: string }) => c.type === 'mdxJsxFlowElement',
		) as unknown as MdxJsxFlowElement

		expect(jsx).toBeDefined()
		expect(jsx.name).toBe('Picture')

		// src should be an expression attribute
		const srcAttr = jsx.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'src',
		)
		expect(srcAttr!.value).toHaveProperty('type', 'mdxJsxAttributeValueExpression')

		// alt and title should be string attributes
		const altAttr = jsx.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'alt',
		)
		expect(altAttr!.value).toBe('Hero image')

		const titleAttr = jsx.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'title',
		)
		expect(titleAttr!.value).toBe('Hero')
	})

	it('deduplicates image imports for same src', () => {
		const tree: Root = {
			type: 'root',
			children: [
				{
					type: 'paragraph',
					children: [
						{ type: 'image', url: './same.png', alt: 'First' } as Image,
					],
				},
				{
					type: 'paragraph',
					children: [
						{ type: 'image', url: './same.png', alt: 'Second' } as Image,
					],
				},
			],
		}

		runPlugin(tree, {
			img: {
				component: 'Picture',
				componentModule: 'astro:assets',
				autoImport: 'src',
			},
		})

		// Should have one component import + one asset import (deduplicated)
		const imports = tree.children.filter((c) => c.type === 'mdxjsEsm')
		expect(imports).toHaveLength(2)
	})

	it('skips autoImport for external URLs', () => {
		const tree: Root = {
			type: 'root',
			children: [
				{
					type: 'paragraph',
					children: [
						{
							type: 'image',
							url: 'https://example.com/photo.jpg',
							alt: 'Remote',
						} as Image,
					],
				},
			],
		}

		runPlugin(tree, {
			img: {
				component: 'Picture',
				componentModule: 'astro:assets',
				autoImport: 'src',
			},
		})

		const paragraph = tree.children.find((c) => c.type === 'paragraph')!
		const jsx = (paragraph as { children: unknown[] }).children.find(
			(c: { type: string }) => c.type === 'mdxJsxFlowElement',
		) as unknown as MdxJsxFlowElement

		// src should be a plain string for URLs
		const srcAttr = jsx.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'src',
		)
		expect(srcAttr!.value).toBe('https://example.com/photo.jpg')

		// Only one import (component), no asset import
		const imports = tree.children.filter((c) => c.type === 'mdxjsEsm')
		expect(imports).toHaveLength(1)
	})

	it('transforms JSX <img> elements with autoImport', () => {
		const tree: Root = {
			type: 'root',
			children: [
				{
					type: 'mdxJsxFlowElement',
					name: 'img',
					attributes: [
						{ type: 'mdxJsxAttribute', name: 'src', value: './photo.webp' },
						{ type: 'mdxJsxAttribute', name: 'alt', value: 'Photo' },
					],
					children: [],
				} as unknown as Root['children'][number],
			],
		}

		runPlugin(tree, {
			img: {
				component: 'Picture',
				componentModule: 'astro:assets',
				autoImport: 'src',
			},
		})

		const jsx = tree.children.find(
			(c) => c.type === 'mdxJsxFlowElement',
		) as unknown as MdxJsxFlowElement

		expect(jsx.name).toBe('Picture')

		const srcAttr = jsx.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'src',
		)
		expect(srcAttr!.value).toHaveProperty('type', 'mdxJsxAttributeValueExpression')
	})
})

describe('remarkMdxKitElements — mixed overrides', () => {
	it('handles both simple and autoImport overrides together', () => {
		const tree: Root = {
			type: 'root',
			children: [
				{ type: 'heading', depth: 1, children: [{ type: 'text', value: 'Title' }] },
				{
					type: 'paragraph',
					children: [
						{ type: 'image', url: './hero.png', alt: 'Hero' } as Image,
					],
				},
			],
		}

		runPlugin(tree, {
			h1: 'src/components/Heading.astro',
			img: {
				component: 'Picture',
				componentModule: 'astro:assets',
				autoImport: 'src',
			},
		})

		// Should have imports for both components + asset
		const esmNodes = tree.children.filter((c) => c.type === 'mdxjsEsm')
		expect(esmNodes.length).toBeGreaterThanOrEqual(3) // heading import + picture import + asset import

		// Should have an export const components for h1
		const exportNode = (esmNodes as unknown as MdxjsEsm[]).find((n) =>
			n.value.includes('export const components'),
		)
		expect(exportNode).toBeDefined()

		// Image should be transformed to JSX
		const paragraph = tree.children.find((c) => c.type === 'paragraph')!
		const jsx = (paragraph as { children: unknown[] }).children.find(
			(c: { type: string }) => c.type === 'mdxJsxFlowElement',
		)
		expect(jsx).toBeDefined()
	})
})
