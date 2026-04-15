/* eslint-disable ts/triple-slash-reference */

/// <reference types="mdast-util-mdx-jsx" />

import type { Parent, Root } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

/**
 * HTML elements whose content model is phrasing content — they cannot legally
 * contain `<p>` per the HTML spec.
 *
 * Excludes `<a>` (transparent content model, can contain flow content) and
 * heading elements (Markdown doesn't nest `<p>` inside them).
 *
 * @see https://html.spec.whatwg.org/multipage/text-level-semantics.html
 * @see https://html.spec.whatwg.org/multipage/form-elements.html
 */
const PHRASING_ONLY_ELEMENTS = new Set([
	'abbr',
	'b',
	'bdi',
	'bdo',
	'button',
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
])

function isWhitespaceText(node: { type: string; value?: string }): boolean {
	return node.type === 'text' && !node.value?.trim()
}

/**
 * Tree transformer that unwraps `<p>` elements from inside MDX JSX elements
 * that only allow phrasing content per the HTML spec.
 *
 * When a `paragraph` node is the sole meaningful child (ignoring whitespace
 * text) of a phrasing-only JSX element, the `paragraph` is replaced with its
 * children.
 *
 * @param tree - The root MDAST node to transform in-place.
 */
export function unwrapPhrasingContentTransform(tree: Root): void {
	visit(tree, (node) => {
		if (node.type !== 'mdxJsxFlowElement' && node.type !== 'mdxJsxTextElement') return
		if (node.name === null) return
		if (!PHRASING_ONLY_ELEMENTS.has(node.name)) return

		const parent = node as Parent
		const meaningful = parent.children.filter(
			(child) => !isWhitespaceText(child as { type: string; value?: string }),
		)

		if (meaningful.length !== 1) return

		const only = meaningful[0]
		if (only?.type !== 'paragraph') return

		const paragraph = only as Parent
		const pIndex = parent.children.indexOf(only)
		parent.children.splice(pIndex, 1, ...paragraph.children)
	})
}

/**
 * Remark plugin that unwraps `<p>` elements from inside MDX JSX elements that
 * only allow phrasing content per the HTML spec.
 *
 * Fixes invalid nesting produced by Markdown's paragraph wrapping inside MDX
 * elements like `<span>`, `<button>`, `<label>`, etc.
 */
export const remarkMdxKitUnwrapPhrasingContent: Plugin<never[], Root> = () => unwrapPhrasingContentTransform
