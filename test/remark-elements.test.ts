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
			children: [{ children: [{ type: 'text', value: 'Title' }], depth: 1, type: 'heading' }],
			type: 'root',
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
			children: [
				existingExport as unknown as Root['children'][number],
				{ children: [{ type: 'text', value: 'Title' }], depth: 1, type: 'heading' },
			],
			type: 'root',
		}

		runPlugin(tree, { h1: 'src/components/Heading.astro' })

		// Should NOT create a second export — should merge into existing
		const exportNodes = (
			tree.children.filter((c) => c.type === 'mdxjsEsm') as unknown as MdxjsEsm[]
		).filter((n) => n.value.includes('export const components'))
		expect(exportNodes).toHaveLength(1)
	})
})

describe('remarkMdxKitElements — autoImport (direct AST transform)', () => {
	it('transforms image nodes with autoImport', () => {
		const tree: Root = {
			children: [
				{
					children: [
						{
							alt: 'Hero image',
							title: 'Hero',
							type: 'image',
							url: '../assets/hero.png',
						} as Image,
					],
					type: 'paragraph',
				},
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

		// The image node should be replaced with a JSX element
		const paragraph = tree.children.find((c) => c.type === 'paragraph')!
		const jsx = (paragraph as { children: unknown[] }).children.find(
			(c: { type: string }) => c.type === 'mdxJsxFlowElement',
		)!

		expect(jsx).toBeDefined()
		expect(jsx.name).toBe('Picture')

		// Src should be an expression attribute
		const srcAttribute = jsx.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'src',
		)
		expect(srcAttribute!.value).toHaveProperty('type', 'mdxJsxAttributeValueExpression')

		// Alt and title should be string attributes
		const altAttribute = jsx.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'alt',
		)
		expect(altAttribute!.value).toBe('Hero image')

		const titleAttribute = jsx.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'title',
		)
		expect(titleAttribute!.value).toBe('Hero')
	})

	it('deduplicates image imports for same src', () => {
		const tree: Root = {
			children: [
				{
					children: [{ alt: 'First', type: 'image', url: './same.png' } as Image],
					type: 'paragraph',
				},
				{
					children: [{ alt: 'Second', type: 'image', url: './same.png' } as Image],
					type: 'paragraph',
				},
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

		// Should have one component import + one asset import (deduplicated)
		const imports = tree.children.filter((c) => c.type === 'mdxjsEsm')
		expect(imports).toHaveLength(2)
	})

	it('skips autoImport for external URLs', () => {
		const tree: Root = {
			children: [
				{
					children: [
						{
							alt: 'Remote',
							type: 'image',
							url: 'https://example.com/photo.jpg',
						} as Image,
					],
					type: 'paragraph',
				},
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

		const paragraph = tree.children.find((c) => c.type === 'paragraph')!
		const jsx = (paragraph as { children: unknown[] }).children.find(
			(c: { type: string }) => c.type === 'mdxJsxFlowElement',
		)!

		// Src should be a plain string for URLs
		const srcAttribute = jsx.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'src',
		)
		expect(srcAttribute!.value).toBe('https://example.com/photo.jpg')

		// Only one import (component), no asset import
		const imports = tree.children.filter((c) => c.type === 'mdxjsEsm')
		expect(imports).toHaveLength(1)
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

		const jsx = tree.children.find(
			(c) => c.type === 'mdxJsxFlowElement',
		) as unknown as MdxJsxFlowElement

		expect(jsx.name).toBe('Picture')

		const srcAttribute = jsx.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'src',
		)
		expect(srcAttribute!.value).toHaveProperty('type', 'mdxJsxAttributeValueExpression')
	})
})

describe('remarkMdxKitElements — mixed overrides', () => {
	it('handles both simple and autoImport overrides together', () => {
		const tree: Root = {
			children: [
				{ children: [{ type: 'text', value: 'Title' }], depth: 1, type: 'heading' },
				{
					children: [{ alt: 'Hero', type: 'image', url: './hero.png' } as Image],
					type: 'paragraph',
				},
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

		// Should have imports for both components + asset
		const esmNodes = tree.children.filter((c) => c.type === 'mdxjsEsm')
		expect(esmNodes.length).toBeGreaterThanOrEqual(3) // Heading import + picture import + asset import

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
