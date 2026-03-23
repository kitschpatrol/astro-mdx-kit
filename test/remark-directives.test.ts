/* eslint-disable ts/triple-slash-reference */

/// <reference types="mdast-util-directive" />
/// <reference types="mdast-util-mdx-jsx" />
/// <reference types="mdast-util-mdxjs-esm" />

import type { Root } from 'mdast'
import type { ContainerDirective, LeafDirective, TextDirective } from 'mdast-util-directive'
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx'
import type { MdxjsEsm } from 'mdast-util-mdxjs-esm'
import { describe, expect, it } from 'vitest'
import { remarkMdxKitDirectives } from '../src/plugins/remark-directives'
import { resolveComponentConfig } from '../src/utils/resolve-config'

function runPlugin(
	tree: Root,
	directives: Record<string, Parameters<typeof resolveComponentConfig>[1]>,
) {
	const configs: Record<string, ReturnType<typeof resolveComponentConfig>> = {}
	for (const [name, config] of Object.entries(directives)) {
		configs[name] = resolveComponentConfig(name, config)
	}

	const plugin = remarkMdxKitDirectives({ configs })
	;(plugin as (tree: Root) => void)(tree)
	return tree
}

describe('remarkMdxKitDirectives', () => {
	it('transforms a leaf directive to a JSX flow element', () => {
		const tree: Root = {
			children: [
				{
					attributes: { icon: 'star' },
					children: [],
					name: 'Block',
					type: 'leafDirective',
				} satisfies LeafDirective as Root['children'][number],
			],
			type: 'root',
		}

		runPlugin(tree, { Block: 'src/components/block.astro' })

		// Should have import + JSX element
		const esmNodes = tree.children.filter((c) => c.type === 'mdxjsEsm')
		const jsxNodes = tree.children.filter((c) => c.type === 'mdxJsxFlowElement')
		expect(esmNodes).toHaveLength(1)
		expect(jsxNodes).toHaveLength(1)

		const jsx = jsxNodes[0] as unknown as MdxJsxFlowElement
		expect(jsx.name).toBe('_MdxKit_Block')
		expect(jsx.attributes).toHaveLength(1)
		expect(jsx.attributes[0]).toMatchObject({
			name: 'icon',
			type: 'mdxJsxAttribute',
			value: 'star',
		})
	})

	it('transforms a text directive to a JSX text element', () => {
		const tree: Root = {
			children: [
				{
					children: [
						{
							attributes: { color: 'red' },
							children: [{ type: 'text', value: 'important' }],
							name: 'Highlight',
							type: 'textDirective',
						} as TextDirective,
					],
					type: 'paragraph',
				},
			],
			type: 'root',
		}

		runPlugin(tree, { Highlight: 'src/components/Highlight.astro' })

		const paragraph = tree.children.find((c) => c.type === 'paragraph')!
		const jsx = (paragraph as { children: unknown[] }).children.find(
			(c: { type: string }) => c.type === 'mdxJsxTextElement',
		)!

		expect(jsx).toBeDefined()
		expect(jsx.name).toBe('_MdxKit_Highlight')
		expect(jsx.children).toHaveLength(1)
	})

	it('transforms a container directive preserving children', () => {
		const tree: Root = {
			children: [
				{
					attributes: { type: 'warning' },
					children: [{ children: [{ type: 'text', value: 'Watch out!' }], type: 'paragraph' }],
					name: 'Callout',
					type: 'containerDirective',
				} as ContainerDirective as Root['children'][number],
			],
			type: 'root',
		}

		runPlugin(tree, { Callout: 'src/components/Callout.astro' })

		const jsxNodes = tree.children.filter((c) => c.type === 'mdxJsxFlowElement')
		expect(jsxNodes).toHaveLength(1)

		const jsx = jsxNodes[0] as unknown as MdxJsxFlowElement
		expect(jsx.name).toBe('_MdxKit_Callout')
		expect(jsx.children).toHaveLength(1)
	})

	it('handles autoImport — replaces prop value with imported identifier', () => {
		const tree: Root = {
			children: [
				{
					attributes: { alt: 'Hero', src: '../assets/hero.png' },
					children: [],
					name: 'Picture',
					type: 'leafDirective',
				} as LeafDirective as Root['children'][number],
			],
			type: 'root',
		}

		runPlugin(tree, {
			Picture: {
				autoImport: 'src',
				component: 'Picture',
				componentModule: 'astro:assets',
			},
		})

		const jsx = tree.children.find(
			(c) => c.type === 'mdxJsxFlowElement',
		) as unknown as MdxJsxFlowElement

		expect(jsx.name).toBe('Picture')

		// Src should be an expression attribute, not a string
		const srcAttribute = jsx.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'src',
		)
		expect(srcAttribute).toBeDefined()
		expect(srcAttribute!.value).toHaveProperty('type', 'mdxJsxAttributeValueExpression')

		// Alt should remain a string
		const altAttribute = jsx.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'alt',
		)
		expect(altAttribute!.value).toBe('Hero')

		// Should have two imports: component + asset
		const imports = tree.children.filter((c) => c.type === 'mdxjsEsm') as unknown as MdxjsEsm[]
		expect(imports).toHaveLength(2)
	})

	it('deduplicates asset imports for same path', () => {
		const tree: Root = {
			children: [
				{
					attributes: { alt: 'First', src: './img.png' },
					children: [],
					name: 'Pic',
					type: 'leafDirective',
				} as LeafDirective as Root['children'][number],
				{
					attributes: { alt: 'Second', src: './img.png' },
					children: [],
					name: 'Pic',
					type: 'leafDirective',
				} as LeafDirective as Root['children'][number],
			],
			type: 'root',
		}

		runPlugin(tree, {
			Pic: {
				autoImport: 'src',
				component: 'Picture',
				componentModule: 'astro:assets',
			},
		})

		const imports = tree.children.filter((c) => c.type === 'mdxjsEsm')
		// One component import + one asset import (deduplicated)
		expect(imports).toHaveLength(2)
	})

	it('ignores directives not in config', () => {
		const tree: Root = {
			children: [
				{
					attributes: {},
					children: [],
					name: 'Unknown',
					type: 'leafDirective',
				} as LeafDirective as Root['children'][number],
			],
			type: 'root',
		}

		runPlugin(tree, { Block: 'src/components/block.astro' })

		// The unknown directive should remain untouched
		expect(tree.children[0].type).toBe('leafDirective')
	})

	it('skips autoImport for URL values', () => {
		const tree: Root = {
			children: [
				{
					attributes: { alt: 'Remote', src: 'https://example.com/img.png' },
					children: [],
					name: 'Pic',
					type: 'leafDirective',
				} as LeafDirective as Root['children'][number],
			],
			type: 'root',
		}

		runPlugin(tree, {
			Pic: {
				autoImport: 'src',
				component: 'Picture',
				componentModule: 'astro:assets',
			},
		})

		const jsx = tree.children.find(
			(c) => c.type === 'mdxJsxFlowElement',
		) as unknown as MdxJsxFlowElement

		// Src should be a plain string attribute (URL not imported)
		const srcAttribute = jsx.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'src',
		)
		expect(srcAttribute!.value).toBe('https://example.com/img.png')

		// Only one import (component), no asset import
		const imports = tree.children.filter((c) => c.type === 'mdxjsEsm')
		expect(imports).toHaveLength(1)
	})
})
