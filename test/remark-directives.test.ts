/* eslint-disable ts/triple-slash-reference */

/// <reference types="mdast-util-directive" />
/// <reference types="mdast-util-mdx-jsx" />
/// <reference types="mdast-util-mdxjs-esm" />

import type { Root } from 'mdast'
import type { ContainerDirective, LeafDirective, TextDirective } from 'mdast-util-directive'
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import type { MdxjsEsm } from 'mdast-util-mdxjs-esm'
import { describe, expect, it } from 'vitest'
import type { ComponentConfig } from '../src/types'
import type { ResolvedComponentConfig } from '../src/utils/resolve-config'
import { createDirectiveTransform } from '../src/plugins/remark-directives'
import { resolveComponentConfig } from '../src/utils/resolve-config'

function runPlugin(tree: Root, directives: Record<string, ComponentConfig>) {
	const configs: Record<string, ResolvedComponentConfig> = {}
	for (const [name, config] of Object.entries(directives)) {
		configs[name] = resolveComponentConfig(name, config)
	}

	createDirectiveTransform({ configs })(tree)
	return tree
}

function findJsxFlow(children: Root['children']): MdxJsxFlowElement | undefined {
	return children.find((c): c is MdxJsxFlowElement => c.type === 'mdxJsxFlowElement')
}

function findEsm(children: Root['children']): MdxjsEsm[] {
	return children.filter((c): c is MdxjsEsm => c.type === 'mdxjsEsm')
}

describe('remarkMdxKitDirectives', () => {
	it('transforms a leaf directive to a JSX flow element', () => {
		const directive: LeafDirective = {
			attributes: { icon: 'star' },
			children: [],
			name: 'Block',
			type: 'leafDirective',
		}
		const tree: Root = { children: [directive], type: 'root' }

		runPlugin(tree, Object.fromEntries([['Block', 'src/components/block.astro']]))

		const esmNodes = findEsm(tree.children)
		expect(esmNodes).toHaveLength(1)

		const jsx = findJsxFlow(tree.children)
		expect(jsx).toBeDefined()
		expect(jsx!.name).toBe('_MdxKit_Block')
		expect(jsx!.attributes).toHaveLength(1)
		expect(jsx!.attributes[0]).toMatchObject({
			name: 'icon',
			type: 'mdxJsxAttribute',
			value: 'star',
		})
	})

	it('transforms a text directive to a JSX text element', () => {
		const directive: TextDirective = {
			attributes: { color: 'red' },
			children: [{ type: 'text', value: 'important' }],
			name: 'Highlight',
			type: 'textDirective',
		}
		const tree: Root = {
			children: [{ children: [directive], type: 'paragraph' }],
			type: 'root',
		}

		runPlugin(tree, Object.fromEntries([['Highlight', 'src/components/Highlight.astro']]))

		const paragraph = tree.children.find((c) => c.type === 'paragraph')
		expect(paragraph).toBeDefined()
		if (paragraph?.type === 'paragraph') {
			const textJsx = paragraph.children.find((c) => c.type === 'mdxJsxTextElement')
			expect(textJsx).toBeDefined()
		}
	})

	it('transforms a container directive preserving children', () => {
		const directive: ContainerDirective = {
			attributes: { type: 'warning' },
			children: [{ children: [{ type: 'text', value: 'Watch out!' }], type: 'paragraph' }],
			name: 'Callout',
			type: 'containerDirective',
		}
		const tree: Root = { children: [directive], type: 'root' }

		runPlugin(tree, Object.fromEntries([['Callout', 'src/components/Callout.astro']]))

		const jsx = findJsxFlow(tree.children)
		expect(jsx).toBeDefined()
		expect(jsx!.name).toBe('_MdxKit_Callout')
		expect(jsx!.children).toHaveLength(1)
	})

	it('handles autoImport — replaces prop value with imported identifier', () => {
		const directive: LeafDirective = {
			attributes: { alt: 'Hero', src: '../assets/hero.png' },
			children: [],
			name: 'Picture',
			type: 'leafDirective',
		}
		const tree: Root = { children: [directive], type: 'root' }

		const pictureConfig: ComponentConfig = {
			autoImport: 'src',
			component: 'Picture',
			componentModule: 'astro:assets',
		}
		runPlugin(tree, Object.fromEntries([['Picture', pictureConfig]]))

		const jsx = findJsxFlow(tree.children)
		expect(jsx).toBeDefined()
		expect(jsx!.name).toBe('Picture')

		const srcAttribute = jsx!.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'src',
		)
		expect(srcAttribute).toBeDefined()
		expect(srcAttribute!.value).toHaveProperty('type', 'mdxJsxAttributeValueExpression')

		const altAttribute = jsx!.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'alt',
		)
		expect(altAttribute!.value).toBe('Hero')

		expect(findEsm(tree.children)).toHaveLength(2)
	})

	it('preserves original prop when autoImport remaps to a different name', () => {
		const directive: LeafDirective = {
			attributes: { alt: 'Hero', src: '../assets/hero.png' },
			children: [],
			name: 'CustomImage',
			type: 'leafDirective',
		}
		const tree: Root = { children: [directive], type: 'root' }

		const config: ComponentConfig = {
			autoImport: { from: 'src', to: 'srcImported' },
			component: 'src/components/CustomImage.astro',
		}
		runPlugin(tree, Object.fromEntries([['CustomImage', config]]))

		const jsx = findJsxFlow(tree.children)
		expect(jsx).toBeDefined()

		// Imported value on the 'to' prop
		const importedAttribute = jsx!.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'srcImported',
		)
		expect(importedAttribute).toBeDefined()
		expect(importedAttribute!.value).toHaveProperty('type', 'mdxJsxAttributeValueExpression')

		// Original string preserved on the 'from' prop
		const originalAttribute = jsx!.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'src',
		)
		expect(originalAttribute).toBeDefined()
		expect(originalAttribute!.value).toBe('../assets/hero.png')

		// Alt still passed through
		const altAttribute = jsx!.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'alt',
		)
		expect(altAttribute!.value).toBe('Hero')
	})

	it('deduplicates asset imports for same path', () => {
		const d1: LeafDirective = {
			attributes: { alt: 'First', src: './img.png' },
			children: [],
			name: 'Pic',
			type: 'leafDirective',
		}
		const d2: LeafDirective = {
			attributes: { alt: 'Second', src: './img.png' },
			children: [],
			name: 'Pic',
			type: 'leafDirective',
		}
		const tree: Root = {
			children: [d1, d2] as Root['children'],
			type: 'root',
		}

		const picConfig: ComponentConfig = {
			autoImport: 'src',
			component: 'Picture',
			componentModule: 'astro:assets',
		}
		runPlugin(tree, Object.fromEntries([['Pic', picConfig]]))

		expect(findEsm(tree.children)).toHaveLength(2)
	})

	it('ignores directives not in config', () => {
		const directive: LeafDirective = {
			attributes: {},
			children: [],
			name: 'Unknown',
			type: 'leafDirective',
		}
		const tree: Root = { children: [directive], type: 'root' }

		runPlugin(tree, Object.fromEntries([['Block', 'src/components/block.astro']]))

		expect(tree.children.at(0)?.type).toBe('leafDirective')
	})

	it('skips autoImport for URL values', () => {
		const directive: LeafDirective = {
			attributes: { alt: 'Remote', src: 'https://example.com/img.png' },
			children: [],
			name: 'Pic',
			type: 'leafDirective',
		}
		const tree: Root = { children: [directive], type: 'root' }

		const picConfig: ComponentConfig = {
			autoImport: 'src',
			component: 'Picture',
			componentModule: 'astro:assets',
		}
		runPlugin(tree, Object.fromEntries([['Pic', picConfig]]))

		const jsx = findJsxFlow(tree.children)
		const srcAttribute = jsx!.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'src',
		)
		expect(srcAttribute!.value).toBe('https://example.com/img.png')

		expect(findEsm(tree.children)).toHaveLength(1)
	})

	it('handles multiple autoImport entries from different directive attributes', () => {
		const directive: LeafDirective = {
			attributes: { alt: 'Hero', src: '../assets/hero.png', srcDark: '../assets/dark.png' },
			children: [],
			name: 'Picture',
			type: 'leafDirective',
		}
		const tree: Root = { children: [directive], type: 'root' }

		const pictureConfig: ComponentConfig = {
			autoImport: ['src', 'srcDark'],
			component: 'Picture',
			componentModule: 'astro:assets',
		}
		runPlugin(tree, Object.fromEntries([['Picture', pictureConfig]]))

		const jsx = findJsxFlow(tree.children)
		expect(jsx).toBeDefined()

		// Both src and srcDark should be expression (auto-imported)
		const srcAttribute = jsx!.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'src',
		)
		expect(srcAttribute!.value).toHaveProperty('type', 'mdxJsxAttributeValueExpression')

		const srcDarkAttribute = jsx!.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'srcDark',
		)
		expect(srcDarkAttribute!.value).toHaveProperty('type', 'mdxJsxAttributeValueExpression')

		// Alt should remain a string
		const altAttribute = jsx!.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'alt',
		)
		expect(altAttribute!.value).toBe('Hero')

		// Component + 2 asset imports
		expect(findEsm(tree.children)).toHaveLength(3)
	})

	it('remaps attribute names via propMap', () => {
		const directive: LeafDirective = {
			attributes: { icon: 'star', type: 'warning' },
			children: [],
			name: 'Block',
			type: 'leafDirective',
		}
		const tree: Root = { children: [directive], type: 'root' }

		const config: ComponentConfig = {
			component: 'src/components/Block.astro',
			propMap: { icon: 'iconName', type: 'variant' },
		}
		runPlugin(tree, Object.fromEntries([['Block', config]]))

		const jsx = findJsxFlow(tree.children)
		expect(jsx).toBeDefined()

		const iconName = jsx!.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'iconName',
		)
		expect(iconName!.value).toBe('star')

		const variant = jsx!.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'variant',
		)
		expect(variant!.value).toBe('warning')

		// Original names should not be present
		const icon = jsx!.attributes.find((a) => a.type === 'mdxJsxAttribute' && a.name === 'icon')
		expect(icon).toBeUndefined()
	})

	it('passes unmapped attributes through with propMap', () => {
		const directive: LeafDirective = {
			attributes: { icon: 'star', title: 'Hello' },
			children: [],
			name: 'Block',
			type: 'leafDirective',
		}
		const tree: Root = { children: [directive], type: 'root' }

		const config: ComponentConfig = {
			component: 'src/components/Block.astro',
			propMap: { icon: 'iconName' },
		}
		runPlugin(tree, Object.fromEntries([['Block', config]]))

		const jsx = findJsxFlow(tree.children)
		const title = jsx!.attributes.find((a) => a.type === 'mdxJsxAttribute' && a.name === 'title')
		expect(title!.value).toBe('Hello')
	})

	it('applies propMap together with autoImport', () => {
		const directive: LeafDirective = {
			attributes: { alt: 'Hero', source: '../assets/hero.png' },
			children: [],
			name: 'Pic',
			type: 'leafDirective',
		}
		const tree: Root = { children: [directive], type: 'root' }

		const config: ComponentConfig = {
			autoImport: 'source',
			component: 'Picture',
			componentModule: 'astro:assets',
			propMap: { alt: 'altText' },
		}
		runPlugin(tree, Object.fromEntries([['Pic', config]]))

		const jsx = findJsxFlow(tree.children)

		// Alt was remapped to altText
		const altText = jsx!.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'altText',
		)
		expect(altText!.value).toBe('Hero')

		// Source was auto-imported (expression, not string)
		const source = jsx!.attributes.find((a) => a.type === 'mdxJsxAttribute' && a.name === 'source')
		expect(source!.value).toHaveProperty('type', 'mdxJsxAttributeValueExpression')
	})

	it('extracts container directive label as plain text prop', () => {
		const directive: ContainerDirective = {
			attributes: { type: 'warning' },
			children: [
				{
					children: [{ type: 'text', value: 'Watch out!' }],
					data: { directiveLabel: true },
					type: 'paragraph',
				},
				{ children: [{ type: 'text', value: 'Body content' }], type: 'paragraph' },
			],
			name: 'Callout',
			type: 'containerDirective',
		}
		const tree: Root = { children: [directive], type: 'root' }

		const config: ComponentConfig = {
			component: 'src/components/Callout.astro',
			label: 'title',
		}
		runPlugin(tree, Object.fromEntries([['Callout', config]]))

		const jsx = findJsxFlow(tree.children)
		expect(jsx).toBeDefined()

		// Label extracted as title prop
		const title = jsx!.attributes.find((a) => a.type === 'mdxJsxAttribute' && a.name === 'title')
		expect(title!.value).toBe('Watch out!')

		// Label removed from children, only body remains
		expect(jsx!.children).toHaveLength(1)
	})

	it('extracts label with rendered format', () => {
		const directive: ContainerDirective = {
			attributes: {},
			children: [
				{
					children: [
						{ type: 'text', value: 'A ' },
						{ children: [{ type: 'text', value: 'bold' }], type: 'strong' },
						{ type: 'text', value: ' label' },
					],
					data: { directiveLabel: true },
					type: 'paragraph',
				},
			],
			name: 'Note',
			type: 'containerDirective',
		}
		const tree: Root = { children: [directive], type: 'root' }

		const config: ComponentConfig = {
			component: 'src/components/Note.astro',
			label: { format: 'rendered', prop: 'heading' },
		}
		runPlugin(tree, Object.fromEntries([['Note', config]]))

		const jsx = findJsxFlow(tree.children)
		const heading = jsx!.attributes.find(
			(a) => a.type === 'mdxJsxAttribute' && a.name === 'heading',
		)
		expect(heading!.value).toContain('<strong>')
	})

	it('does nothing when label config is set but no directiveLabel in children', () => {
		const directive: ContainerDirective = {
			attributes: {},
			children: [{ children: [{ type: 'text', value: 'Just body' }], type: 'paragraph' }],
			name: 'Note',
			type: 'containerDirective',
		}
		const tree: Root = { children: [directive], type: 'root' }

		const config: ComponentConfig = {
			component: 'src/components/Note.astro',
			label: 'title',
		}
		runPlugin(tree, Object.fromEntries([['Note', config]]))

		const jsx = findJsxFlow(tree.children)

		// No title prop added
		const title = jsx!.attributes.find((a) => a.type === 'mdxJsxAttribute' && a.name === 'title')
		expect(title).toBeUndefined()

		// Body preserved
		expect(jsx!.children).toHaveLength(1)
	})

	it('extracts label from leaf directive [content]', () => {
		const directive: LeafDirective = {
			attributes: {},
			children: [{ type: 'text', value: 'Leaf content' }],
			name: 'Note',
			type: 'leafDirective',
		}
		const tree: Root = { children: [directive], type: 'root' }

		const config: ComponentConfig = {
			component: 'src/components/Note.astro',
			label: 'title',
		}
		runPlugin(tree, Object.fromEntries([['Note', config]]))

		const jsx = findJsxFlow(tree.children)

		const title = jsx!.attributes.find((a) => a.type === 'mdxJsxAttribute' && a.name === 'title')
		expect(title!.value).toBe('Leaf content')

		// Children removed since they became the label
		expect(jsx!.children).toHaveLength(0)
	})

	it('extracts label from text directive [content]', () => {
		const directive: TextDirective = {
			attributes: { color: 'red' },
			children: [{ type: 'text', value: 'inline label' }],
			name: 'Tag',
			type: 'textDirective',
		}
		const tree: Root = {
			children: [{ children: [directive], type: 'paragraph' }],
			type: 'root',
		}

		const config: ComponentConfig = {
			component: 'src/components/Tag.astro',
			label: 'text',
		}
		runPlugin(tree, Object.fromEntries([['Tag', config]]))

		const paragraph = tree.children.find((c) => c.type === 'paragraph')
		expect(paragraph?.type).toBe('paragraph')
		if (paragraph?.type !== 'paragraph') {
			return
		}

		const textJsx = paragraph.children.find((c) => c.type === 'mdxJsxTextElement')
		expect(textJsx).toBeDefined()
		if (textJsx?.type !== 'mdxJsxTextElement') {
			return
		}

		const text = textJsx.attributes.find((a) => a.type === 'mdxJsxAttribute' && a.name === 'text')
		expect(text).toBeDefined()
		expect(text!.value).toBe('inline label')
		expect(textJsx.children).toHaveLength(0)
	})

	it('preserves leaf directive [content] as children without label config', () => {
		const directive: LeafDirective = {
			attributes: {},
			children: [{ type: 'text', value: 'Leaf content' }],
			name: 'Note',
			type: 'leafDirective',
		}
		const tree: Root = { children: [directive], type: 'root' }

		runPlugin(tree, Object.fromEntries([['Note', 'src/components/Note.astro']]))

		const jsx = findJsxFlow(tree.children)
		expect(jsx!.children).toHaveLength(1)
	})
})
