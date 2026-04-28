/* eslint-disable ts/triple-slash-reference */
/* eslint-disable ts/naming-convention -- directive names are PascalCase by convention */

/// <reference types="mdast-util-mdx-jsx" />
/// <reference types="mdast-util-mdxjs-esm" />

import type { Root } from 'mdast'
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import type { MdxjsEsm } from 'mdast-util-mdxjs-esm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { describe, expect, it } from 'vitest'
import type { MdxKitOptions } from '../src/types'
import remarkMdxKitPlugin from '../src/remark-plugin'

function parse(source: string, options: MdxKitOptions): Root {
	return unified().use(remarkParse).use(remarkMdxKitPlugin, options).parse(source)
}

function transform(source: string, options: MdxKitOptions): Root {
	const processor = unified().use(remarkParse).use(remarkMdxKitPlugin, options)
	const tree = processor.parse(source)

	return processor.runSync(tree)
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
