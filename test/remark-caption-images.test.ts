/* eslint-disable ts/triple-slash-reference */

/// <reference types="mdast-util-mdx-jsx" />

import type { Image, Root } from 'mdast'
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import { visit } from 'unist-util-visit'
import { describe, expect, it } from 'vitest'
import { captionImagesTransform } from '../src/plugins/remark-caption-images'

function findJsxFlowAnywhere(tree: Root, name?: string): MdxJsxFlowElement | undefined {
	let found: MdxJsxFlowElement | undefined
	visit(tree, 'mdxJsxFlowElement', (node) => {
		if (name === undefined || node.name === name) {
			found = node
		}
	})
	return found
}

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

describe('captionImagesTransform', () => {
	it('wraps image + caption in <figure>/<figcaption>', () => {
		const tree = makeImageParagraph('A sunset')
		captionImagesTransform(tree)

		const figure = findJsxFlowAnywhere(tree, 'figure')
		expect(figure).toBeDefined()
		expect(figure!.children).toHaveLength(2)

		// First child: the original MDAST image node (preserved for Astro optimization)
		expect(figure!.children.at(0)?.type).toBe('image')

		// Second child: <figcaption> with caption text directly inside (no <p> wrapper)
		const figcaption = findJsxFlowAnywhere(tree, 'figcaption')
		expect(figcaption).toBeDefined()
		expect(figcaption!.children).toHaveLength(1)
		expect(figcaption!.children.at(0)?.type).toBe('text')
	})

	it('does not wrap when there is no caption', () => {
		const image: Image = { alt: 'Photo', type: 'image', url: './photo.png' }
		const tree: Root = {
			children: [{ children: [image], type: 'paragraph' }],
			type: 'root',
		}

		captionImagesTransform(tree)

		const figure = findJsxFlowAnywhere(tree, 'figure')
		expect(figure).toBeUndefined()
		expect(tree.children.at(0)?.type).toBe('paragraph')
	})

	it('skips paragraphs with multiple images', () => {
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

		captionImagesTransform(tree)

		const figure = findJsxFlowAnywhere(tree, 'figure')
		expect(figure).toBeUndefined()
	})

	it('preserves the original image node for Astro optimization', () => {
		const image: Image = { alt: 'Sunset', title: 'Nice', type: 'image', url: './sunset.png' }
		const tree: Root = {
			children: [
				{
					children: [image, { type: 'text', value: ' Caption' }],
					type: 'paragraph',
				},
			],
			type: 'root',
		}

		captionImagesTransform(tree)

		const figure = findJsxFlowAnywhere(tree, 'figure')
		expect(figure).toBeDefined()

		// The image node should be the exact same MDAST node, not a JSX replacement
		const imageChild = figure!.children.at(0) as unknown as Record<string, unknown>
		expect(imageChild.type).toBe('image')
		expect(imageChild.url).toBe('./sunset.png')
		expect(imageChild.alt).toBe('Sunset')
	})

	it('trims leading whitespace from caption text', () => {
		const tree = makeImageParagraph('  Trimmed caption')
		captionImagesTransform(tree)

		const figcaption = findJsxFlowAnywhere(tree, 'figcaption')
		expect(figcaption).toBeDefined()
		const textNode = figcaption!.children.at(0) as unknown as Record<string, unknown>
		expect(textNode.type).toBe('text')
		expect(textNode.value).toBe('Trimmed caption')
	})
})
