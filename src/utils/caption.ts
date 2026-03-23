import type { Parent as MdastParent, PhrasingContent, Root } from 'mdast'
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import { toHtml } from 'hast-util-to-html'
import { toHast } from 'mdast-util-to-hast'
import { toMarkdown } from 'mdast-util-to-markdown'
import { toString } from 'mdast-util-to-string'
import type { CaptionConfig } from '../types.js'
import { log } from '../log.js'
import { createJsxFlowElement, createStringAttribute } from './ast.js'

/**
 * Extract caption nodes from a paragraph, excluding the node at
 * `excludeIndex` (the image). Leading/trailing whitespace text nodes
 * are trimmed or removed.
 */
export function extractCaptionNodes(parent: MdastParent, excludeIndex: number): PhrasingContent[] {
	// eslint-disable-next-line ts/no-unsafe-type-assertion -- paragraph children are PhrasingContent at runtime
	const caption = parent.children.filter(
		(_child, index) => index !== excludeIndex,
	) as PhrasingContent[]

	// Trim leading whitespace from first text node
	if (caption.length > 0 && caption[0].type === 'text') {
		const trimmed = caption[0].value.trimStart()
		if (trimmed) {
			caption[0] = { type: 'text', value: trimmed }
		} else {
			caption.shift()
		}
	}

	// Trim trailing whitespace from last text node
	const last = caption.at(-1)
	if (last?.type === 'text') {
		const trimmed = last.value.trimEnd()
		if (trimmed) {
			caption[caption.length - 1] = { type: 'text', value: trimmed }
		} else {
			caption.pop()
		}
	}

	return caption
}

/**
 * Serialize caption AST nodes to a string in the given format.
 */
function serializeCaptionNodes(
	nodes: PhrasingContent[],
	format: 'plain' | 'raw' | 'rendered',
): string {
	const paragraph = { children: nodes, type: 'paragraph' as const }
	const root: Root = { children: [paragraph], type: 'root' }

	if (format === 'raw') {
		return toMarkdown(root).trim()
	}

	if (format === 'rendered') {
		try {
			return toHtml(toHast(root))
		} catch {
			log.warn('Failed to render caption to HTML, falling back to plain text')
		}

		return toString(root)
	}

	// 'plain' (default)
	return toString(root)
}

/**
 * Build a replacement node that wraps an image JSX element with its
 * caption, according to the configured caption mode.
 *
 * - `'figure'` → `<figure><Image /><figcaption>...</figcaption></figure>`
 * - `'children'` → `<Image>...</Image>`
 * - `{ prop }` → `<Image caption="..." />`
 */
export function buildCaptionReplacement(
	caption: CaptionConfig,
	imageJsx: MdxJsxFlowElement,
	captionNodes: PhrasingContent[],
): MdxJsxFlowElement {
	const name = imageJsx.name ?? imageJsx.type
	const imageAttributes = imageJsx.attributes.filter(
		(a): a is MdxJsxAttribute => a.type === 'mdxJsxAttribute',
	)

	if (caption === 'children') {
		return createJsxFlowElement(name, imageAttributes, captionNodes)
	}

	if (caption === 'figure') {
		const figcaption = createJsxFlowElement('figcaption', [], captionNodes)
		return createJsxFlowElement('figure', [], [imageJsx, figcaption])
	}

	// Prop mode: serialize caption and add as a string attribute
	const format = caption.format ?? 'plain'
	const serialized = serializeCaptionNodes(captionNodes, format)
	return createJsxFlowElement(
		name,
		[...imageAttributes, createStringAttribute(caption.prop, serialized)],
		[],
	)
}
