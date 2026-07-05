/* eslint-disable ts/triple-slash-reference */

/// <reference types="mdast-util-mdx-jsx" />

import type { RootContent } from 'mdast'
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx'
import type { MdastPluginDefinition, MdastVisitorContext } from 'satteri'
import { isWhitespaceText, lazyChildren, PHRASING_ONLY_ELEMENTS } from '../utils/ast.js'

const PLUGIN_NAME = 'astro-mdx-kit:unwrap-phrasing'

function visitJsxElement(
	node: Readonly<MdxJsxFlowElement | MdxJsxTextElement>,
	context: MdastVisitorContext,
): void {
	if (node.name === null || !PHRASING_ONLY_ELEMENTS.has(node.name)) {
		return
	}

	const children = lazyChildren<RootContent>(node.children)
	const meaningful = children.filter((child) => !isWhitespaceText(child))

	if (meaningful.length !== 1) {
		return
	}

	const only = meaningful[0]
	if (only?.type !== 'paragraph') {
		return
	}

	const newChildren = children.flatMap((child) => (child === only ? [...only.children] : [child]))
	context.setProperty(node, 'children', newChildren)
}

/**
 * Create a Sätteri MDAST plugin that unwraps `<p>` elements from inside MDX JSX
 * elements that only allow phrasing content per the HTML spec.
 *
 * Mirrors the remark {@link unwrapPhrasingContentTransform} for Sätteri
 * pipelines. Fixes invalid nesting produced by Markdown's paragraph wrapping
 * inside MDX elements like `<span>`, `<button>`, `<label>`, etc.
 */
export function createSatteriUnwrapPhrasingPlugin(): MdastPluginDefinition {
	return {
		mdxJsxFlowElement: visitJsxElement,
		mdxJsxTextElement: visitJsxElement,
		name: PLUGIN_NAME,
	}
}
