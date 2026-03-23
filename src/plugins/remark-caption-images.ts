/* eslint-disable ts/triple-slash-reference */

/// <reference types="mdast-util-mdx-jsx" />

import type { Image, Parent as MdastParent, Root } from 'mdast'
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import type { Plugin } from 'unified'
import type { Parent } from 'unist'
import { SKIP, visit } from 'unist-util-visit'
import { createJsxFlowElement } from '../utils/ast.js'
import { extractCaptionNodes } from '../utils/caption.js'

/**
 * Tree transformer that wraps stand-alone images with adjacent caption
 * text in `<figure>/<figcaption>` elements.
 *
 * When an image is followed by text in the same paragraph
 * (`![alt](src) Caption text`), the paragraph is replaced with a
 * `<figure>` containing the original image and a `<figcaption>`.
 * Paragraphs with multiple images are skipped to avoid ambiguity.
 *
 * The original MDAST `image` node is preserved inside the figure so
 * that Astro's built-in image optimization still applies.
 * @param tree - The root MDAST node to transform in-place.
 */
export function captionImagesTransform(tree: Root): void {
	// Pre-scan: identify paragraphs with multiple images (skip those)
	const multiImageParagraphs = new WeakSet<MdastParent>()
	visit(tree, 'paragraph', (node) => {
		const imageCount = node.children.filter((child) => child.type === 'image').length
		if (imageCount > 1) {
			multiImageParagraphs.add(node)
		}
	})

	const paragraphReplacements = new Map<MdastParent, MdxJsxFlowElement>()

	visit(tree, 'image', (node: Image, index, parent) => {
		if (index === undefined || !parent) return SKIP
		if (multiImageParagraphs.has(parent)) return SKIP

		const captionNodes = extractCaptionNodes(parent, index)
		if (captionNodes.length === 0) return SKIP

		// Build <figure> with the original image node + <figcaption>
		// Caption nodes go directly inside figcaption (no paragraph wrapper)
		const figcaption = createJsxFlowElement('figcaption', [], captionNodes)
		const figure = createJsxFlowElement('figure', [], [node, figcaption])

		paragraphReplacements.set(parent, figure)
		return SKIP
	})

	// Second pass: replace paragraphs
	if (paragraphReplacements.size > 0) {
		visit(tree, 'paragraph', (node, index, parent) => {
			if (index === undefined || !parent) return
			const replacement = paragraphReplacements.get(node)
			if (!replacement) return
			;(parent as Parent).children[index] = replacement
			return SKIP
		})
	}
}

/**
 * Remark plugin that wraps images with adjacent caption text in
 * `<figure>/<figcaption>`. The original image node is preserved for
 * Astro's image optimization pipeline.
 */
export const remarkMdxKitCaptionImages: Plugin<never[], Root> = () => captionImagesTransform
