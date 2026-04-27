/* eslint-disable ts/triple-slash-reference */
/* eslint-disable ts/consistent-type-assertions -- constructing mock MDX AST nodes */
/* eslint-disable ts/no-unsafe-type-assertion -- constructing mock MDX AST nodes */

/// <reference types="mdast-util-mdx-jsx" />

import type { Parent, Root } from 'mdast'
import { describe, expect, it } from 'vitest'
import { unwrapPhrasingContentTransform } from '../src/plugins/remark-unwrap-phrasing'

const unwrap = unwrapPhrasingContentTransform

function childrenOf(node: unknown): Array<{ type: string; value?: string }> {
	return (node as Parent).children
}

describe('remarkMdxKitUnwrapPhrasingContent', () => {
	it('unwraps a paragraph from inside a <span>', () => {
		const tree: Root = {
			children: [
				{
					attributes: [],
					children: [
						{
							children: [{ type: 'text', value: 'Hello' }],
							type: 'paragraph',
						},
					],
					name: 'span',
					type: 'mdxJsxFlowElement',
				} as never,
			],
			type: 'root',
		}

		unwrap(tree)

		const kids = childrenOf(tree.children.at(0))
		expect(kids).toHaveLength(1)
		expect(kids.at(0)?.type).toBe('text')
		expect(kids.at(0)?.value).toBe('Hello')
	})

	it('unwraps a paragraph from inside a <button>', () => {
		const tree: Root = {
			children: [
				{
					attributes: [],
					children: [
						{
							children: [{ type: 'text', value: 'Click me' }],
							type: 'paragraph',
						},
					],
					name: 'button',
					type: 'mdxJsxFlowElement',
				} as never,
			],
			type: 'root',
		}

		unwrap(tree)

		const kids = childrenOf(tree.children.at(0))
		expect(kids).toHaveLength(1)
		expect(kids.at(0)?.type).toBe('text')
		expect(kids.at(0)?.value).toBe('Click me')
	})

	it('unwraps from all phrasing-only elements', () => {
		const phrasingElements = [
			'abbr',
			'b',
			'bdi',
			'bdo',
			'cite',
			'code',
			'data',
			'dfn',
			'em',
			'i',
			'kbd',
			'label',
			'mark',
			'output',
			'q',
			'ruby',
			's',
			'samp',
			'small',
			'span',
			'strong',
			'sub',
			'sup',
			'time',
			'u',
			'var',
		]

		for (const tagName of phrasingElements) {
			const tree: Root = {
				children: [
					{
						attributes: [],
						children: [
							{
								children: [{ type: 'text', value: 'text' }],
								type: 'paragraph',
							},
						],
						name: tagName,
						type: 'mdxJsxFlowElement',
					} as never,
				],
				type: 'root',
			}

			unwrap(tree)

			const kids = childrenOf(tree.children.at(0))
			expect(kids.at(0)?.type, `expected <${tagName}> to have paragraph unwrapped`).toBe('text')
		}
	})

	it('does not unwrap from <div> (flow content allowed)', () => {
		const tree: Root = {
			children: [
				{
					attributes: [],
					children: [
						{
							children: [{ type: 'text', value: 'Hello' }],
							type: 'paragraph',
						},
					],
					name: 'div',
					type: 'mdxJsxFlowElement',
				} as never,
			],
			type: 'root',
		}

		unwrap(tree)

		expect(childrenOf(tree.children.at(0)).at(0)?.type).toBe('paragraph')
	})

	it('does not unwrap from <a> (transparent content model)', () => {
		const tree: Root = {
			children: [
				{
					attributes: [],
					children: [
						{
							children: [{ type: 'text', value: 'Link text' }],
							type: 'paragraph',
						},
					],
					name: 'a',
					type: 'mdxJsxFlowElement',
				} as never,
			],
			type: 'root',
		}

		unwrap(tree)

		expect(childrenOf(tree.children.at(0)).at(0)?.type).toBe('paragraph')
	})

	it('does not unwrap when there are multiple meaningful children', () => {
		const tree: Root = {
			children: [
				{
					attributes: [],
					children: [
						{
							children: [{ type: 'text', value: 'First' }],
							type: 'paragraph',
						},
						{
							children: [{ type: 'text', value: 'Second' }],
							type: 'paragraph',
						},
					],
					name: 'span',
					type: 'mdxJsxFlowElement',
				} as never,
			],
			type: 'root',
		}

		unwrap(tree)

		const kids = childrenOf(tree.children.at(0))
		expect(kids).toHaveLength(2)
		expect(kids.at(0)?.type).toBe('paragraph')
		expect(kids.at(1)?.type).toBe('paragraph')
	})

	it('ignores whitespace text nodes when finding sole child', () => {
		const tree: Root = {
			children: [
				{
					attributes: [],
					children: [
						{ type: 'text', value: '\n' },
						{
							children: [{ type: 'text', value: 'Hello' }],
							type: 'paragraph',
						},
						{ type: 'text', value: '\n' },
					],
					name: 'span',
					type: 'mdxJsxFlowElement',
				} as never,
			],
			type: 'root',
		}

		unwrap(tree)

		// Whitespace nodes preserved, paragraph replaced with its children
		const kids = childrenOf(tree.children.at(0))
		expect(kids).toHaveLength(3)
		expect(kids.at(0)?.value).toBe('\n')
		expect(kids.at(1)?.type).toBe('text')
		expect(kids.at(1)?.value).toBe('Hello')
		expect(kids.at(2)?.value).toBe('\n')
	})

	it('preserves paragraph children with inline formatting', () => {
		const tree: Root = {
			children: [
				{
					attributes: [],
					children: [
						{
							children: [
								{ type: 'text', value: 'Hello ' },
								{
									children: [{ type: 'text', value: 'world' }],
									type: 'strong',
								},
							],
							type: 'paragraph',
						},
					],
					name: 'span',
					type: 'mdxJsxFlowElement',
				} as never,
			],
			type: 'root',
		}

		unwrap(tree)

		const kids = childrenOf(tree.children.at(0))
		expect(kids).toHaveLength(2)
		expect(kids.at(0)?.type).toBe('text')
		expect(kids.at(1)?.type).toBe('strong')
	})

	it('works with mdxJsxTextElement nodes', () => {
		const tree: Root = {
			children: [
				{
					children: [
						{
							attributes: [],
							children: [
								{
									children: [{ type: 'text', value: 'inline' }],
									type: 'paragraph',
								},
							],
							name: 'span',
							type: 'mdxJsxTextElement',
						} as never,
					],
					type: 'paragraph',
				},
			],
			type: 'root',
		}

		unwrap(tree)

		const outerParagraph = tree.children.at(0) as Parent | undefined
		const span = outerParagraph?.children.at(0)
		expect(childrenOf(span).at(0)?.type).toBe('text')
	})

	it('does not unwrap non-paragraph sole children', () => {
		const tree: Root = {
			children: [
				{
					attributes: [],
					children: [
						{
							children: [{ type: 'text', value: 'code' }],
							type: 'heading',
						},
					],
					name: 'span',
					type: 'mdxJsxFlowElement',
				} as never,
			],
			type: 'root',
		}

		unwrap(tree)

		expect(childrenOf(tree.children.at(0)).at(0)?.type).toBe('heading')
	})

	it('handles nested phrasing elements', () => {
		const tree: Root = {
			children: [
				{
					attributes: [],
					children: [
						{
							children: [
								{
									attributes: [],
									children: [
										{
											children: [{ type: 'text', value: 'deep' }],
											type: 'paragraph',
										},
									],
									name: 'em',
									type: 'mdxJsxTextElement',
								} as never,
							],
							type: 'paragraph',
						},
					],
					name: 'span',
					type: 'mdxJsxFlowElement',
				} as never,
			],
			type: 'root',
		}

		unwrap(tree)

		// Both levels should be unwrapped
		const spanKids = childrenOf(tree.children.at(0))
		const em = spanKids.at(0)
		expect(childrenOf(em).at(0)?.type).toBe('text')
	})

	it('does not unwrap from custom components', () => {
		const tree: Root = {
			children: [
				{
					attributes: [],
					children: [
						{
							children: [{ type: 'text', value: 'Hello' }],
							type: 'paragraph',
						},
					],
					name: 'CustomCard',
					type: 'mdxJsxFlowElement',
				} as never,
			],
			type: 'root',
		}

		unwrap(tree)

		expect(childrenOf(tree.children.at(0)).at(0)?.type).toBe('paragraph')
	})
})
