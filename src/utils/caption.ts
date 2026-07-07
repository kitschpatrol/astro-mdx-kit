import type { Parent as MdastParent, PhrasingContent, Root } from 'mdast'
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import type { Parent } from 'unist'
import { toHtml } from 'hast-util-to-html'
import { toHast } from 'mdast-util-to-hast'
import { toMarkdown } from 'mdast-util-to-markdown'
import { toString } from 'mdast-util-to-string'
import { SKIP, visit } from 'unist-util-visit'
import type { CaptionConfig } from '../types.js'
import { log } from '../log.js'
import { createJsxFlowElement, createStringAttribute } from './ast.js'

/**
 * Extract caption nodes from a paragraph, excluding the node at `excludeIndex`
 * (typically the image). Leading and trailing whitespace text nodes are trimmed
 * or removed so the caption content is clean.
 *
 * @param parent - The paragraph node containing the image and caption text.
 * @param excludeIndex - Index of the child to exclude (the image node).
 *
 * @returns An array of phrasing content nodes representing the caption, or an
 *   empty array if no meaningful caption text was found.
 */
export function extractCaptionNodes(parent: MdastParent, excludeIndex: number): PhrasingContent[] {
	const caption = parent.children.filter(
		(_child, index) => index !== excludeIndex,
	) as PhrasingContent[]

	// Trim leading whitespace from first text node
	const first = caption.at(0)
	if (first?.type === 'text') {
		const trimmed = first.value.trimStart()
		if (trimmed === '') {
			caption.shift()
		} else {
			caption[0] = { type: 'text', value: trimmed }
		}
	}

	// Trim trailing whitespace from last text node
	const last = caption.at(-1)
	if (last?.type === 'text') {
		const trimmed = last.value.trimEnd()
		if (trimmed === '') {
			caption.pop()
		} else {
			caption[caption.length - 1] = { type: 'text', value: trimmed }
		}
	}

	return caption
}

/**
 * Serialize phrasing content AST nodes to a string in the given format.
 *
 * - `'plain'` — plain text, formatting stripped
 * - `'raw'` — raw markdown string
 * - `'rendered'` — rendered HTML string (falls back to plain text on error)
 */
export function serializePhrasingContent(
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
		} catch (error) {
			log.warn(
				`Failed to render caption to HTML, falling back to plain text: ${error instanceof Error ? error.message : String(error)}`,
			)
		}

		return toString(root)
	}

	// 'plain' (default)
	return toString(root)
}

/**
 * Build a replacement node that wraps an image JSX element with its caption,
 * according to the configured caption mode.
 *
 * - `'figure'` — wraps in `<figure><Image
 *   /><figcaption>...</figcaption></figure>`
 * - `'children'` — passes caption nodes as children: `<Image>...</Image>`
 * - `{ prop, format? }` — serializes caption text and passes as a string prop:
 *   `<Image caption="..." />`
 *
 * @param caption - The caption handling mode from the element config.
 * @param imageJsx - The already-constructed JSX element for the image.
 * @param captionNodes - The phrasing content nodes extracted as caption text.
 *
 * @returns A single JSX flow element representing the image with its caption.
 */
export function buildCaptionReplacement(
	caption: CaptionConfig,
	imageJsx: MdxJsxFlowElement,
	captionNodes: PhrasingContent[],
): MdxJsxFlowElement {
	if (imageJsx.name === null) {
		throw new Error('buildCaptionReplacement: imageJsx must have a name')
	}

	const { name } = imageJsx
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
	const serialized = serializePhrasingContent(captionNodes, format)
	return createJsxFlowElement(
		name,
		[...imageAttributes, createStringAttribute(caption.prop, serialized)],
		[],
	)
}

/**
 * Pre-scan a tree for paragraphs containing multiple images.
 *
 * Returns a `WeakSet` of paragraph nodes that should be skipped during caption
 * processing to avoid ambiguity about which image a caption belongs to.
 */
export function findMultiImageParagraphs(tree: Root): WeakSet<MdastParent> {
	const result = new WeakSet<MdastParent>()
	visit(tree, 'paragraph', (node) => {
		const imageCount = node.children.filter((child) => child.type === 'image').length
		if (imageCount > 1) {
			result.add(node)
		}
	})
	return result
}

/**
 * Apply collected paragraph-level replacements by visiting all paragraphs and
 * swapping those found in the replacements map.
 */
export function applyParagraphReplacements(
	tree: Root,
	replacements: Map<MdastParent, MdxJsxFlowElement>,
): void {
	if (replacements.size === 0) {
		return
	}

	visit(tree, 'paragraph', (node, index, parent) => {
		if (index === undefined || !parent) {
			return
		}

		const replacement = replacements.get(node)
		if (!replacement) {
			return
		}

		;(parent as Parent).children[index] = replacement
		return SKIP
	})
}
