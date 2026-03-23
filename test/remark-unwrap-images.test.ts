/* eslint-disable ts/triple-slash-reference */
/* eslint-disable ts/no-unsafe-type-assertion -- constructing mock MDX AST nodes */

/// <reference types="mdast-util-mdx-jsx" />

import type { Image, Root } from 'mdast'
import { describe, expect, it } from 'vitest'
import { unwrapImagesTransform } from '../src/plugins/remark-unwrap-images'

const unwrap = unwrapImagesTransform

describe('remarkMdxKitUnwrapImages', () => {
	it('unwraps a stand-alone image from its paragraph', () => {
		const image: Image = { alt: 'Photo', type: 'image', url: './photo.png' }
		const tree: Root = {
			children: [{ children: [image], type: 'paragraph' }],
			type: 'root',
		}

		unwrap(tree)

		expect(tree.children).toHaveLength(1)
		expect(tree.children.at(0)?.type).toBe('image')
	})

	it('does not unwrap images that share a paragraph with other content', () => {
		const image: Image = { alt: 'Photo', type: 'image', url: './photo.png' }
		const tree: Root = {
			children: [
				{
					children: [{ type: 'text', value: 'Before ' }, image],
					type: 'paragraph',
				},
			],
			type: 'root',
		}

		unwrap(tree)

		// Paragraph should remain
		expect(tree.children).toHaveLength(1)
		expect(tree.children.at(0)?.type).toBe('paragraph')
	})

	it('unwraps images with only whitespace siblings', () => {
		const image: Image = { alt: 'Photo', type: 'image', url: './photo.png' }
		const tree: Root = {
			children: [
				{
					children: [{ type: 'text', value: '  ' }, image, { type: 'text', value: '\n' }],
					type: 'paragraph',
				},
			],
			type: 'root',
		}

		unwrap(tree)

		// Should unwrap — whitespace-only siblings don't count
		const imageNode = tree.children.find((c) => c.type === 'image')
		expect(imageNode).toBeDefined()
	})

	it('unwraps MDX JSX flow elements (component overrides like <Picture>)', () => {
		const jsxElement = {
			attributes: [],
			children: [],
			name: 'Picture',
			type: 'mdxJsxFlowElement',
		}
		const tree: Root = {
			children: [
				{
					children: [jsxElement as never],
					type: 'paragraph',
				},
			],
			type: 'root',
		}

		unwrap(tree)

		expect(tree.children).toHaveLength(1)
		expect(tree.children.at(0)?.type).toBe('mdxJsxFlowElement')
	})

	it('preserves non-image paragraphs', () => {
		const tree: Root = {
			children: [{ children: [{ type: 'text', value: 'Just text' }], type: 'paragraph' }],
			type: 'root',
		}

		unwrap(tree)

		expect(tree.children).toHaveLength(1)
		expect(tree.children.at(0)?.type).toBe('paragraph')
	})

	it('handles multiple stand-alone images', () => {
		const img1: Image = { alt: 'First', type: 'image', url: './a.png' }
		const img2: Image = { alt: 'Second', type: 'image', url: './b.png' }
		const tree: Root = {
			children: [
				{ children: [img1], type: 'paragraph' },
				{ children: [{ type: 'text', value: 'Text' }], type: 'paragraph' },
				{ children: [img2], type: 'paragraph' },
			],
			type: 'root',
		}

		unwrap(tree)

		expect(tree.children).toHaveLength(3)
		expect(tree.children.at(0)?.type).toBe('image')
		expect(tree.children.at(1)?.type).toBe('paragraph')
		expect(tree.children.at(2)?.type).toBe('image')
	})
})
