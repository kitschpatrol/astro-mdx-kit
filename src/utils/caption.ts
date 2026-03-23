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
 * `excludeIndex` (typically the image). Leading and trailing whitespace
 * text nodes are trimmed or removed so the caption content is clean.
 * @param parent - The paragraph node containing the image and caption text.
 * @param excludeIndex - Index of the child to exclude (the image node).
 * @returns An array of phrasing content nodes representing the caption,
 *   or an empty array if no meaningful caption text was found.
 */
export function extractCaptionNodes(parent: MdastParent, excludeIndex: number): PhrasingContent[] {
	// eslint-disable-next-line ts/no-unsafe-type-assertion -- paragraph children are PhrasingContent at runtime
	const caption = parent.children.filter(
		(_child, index) => index !== excludeIndex,
	) as PhrasingContent[]

	// Trim leading whitespace from first text node
	const first = caption.at(0)
	if (first?.type === 'text') {
		const trimmed = first.value.trimStart()
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
 * - `'figure'` — wraps in `<figure><Image /><figcaption>...</figcaption></figure>`
 * - `'children'` — passes caption nodes as children: `<Image>...</Image>`
 * - `{ prop, format? }` — serializes caption text and passes as a string prop: `<Image caption="..." />`
 * @param caption - The caption handling mode from the element config.
 * @param imageJsx - The already-constructed JSX element for the image.
 * @param captionNodes - The phrasing content nodes extracted as caption text.
 * @returns A single JSX flow element representing the image with its caption.
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
