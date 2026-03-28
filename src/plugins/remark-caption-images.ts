/* eslint-disable ts/triple-slash-reference */

/// <reference types="mdast-util-mdx-jsx" />

import type { Image, Parent as MdastParent, Root } from 'mdast'
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import type { Plugin } from 'unified'
import { SKIP, visit } from 'unist-util-visit'
import { log } from '../log.js'
import { createJsxFlowElement } from '../utils/ast.js'
import {
	applyParagraphReplacements,
	extractCaptionNodes,
	findMultiImageParagraphs,
} from '../utils/caption.js'

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
	const multiImageParagraphs = findMultiImageParagraphs(tree)
	const paragraphReplacements = new Map<MdastParent, MdxJsxFlowElement>()

	visit(tree, 'image', (node: Image, index, parent) => {
		if (index === undefined || !parent) return SKIP
		if (multiImageParagraphs.has(parent)) return SKIP

		const captionNodes = extractCaptionNodes(parent, index)
		if (captionNodes.length === 0) return SKIP

		const figcaption = createJsxFlowElement('figcaption', [], captionNodes)
		const figure = createJsxFlowElement('figure', [], [node, figcaption])

		paragraphReplacements.set(parent, figure)
		return SKIP
	})

	if (paragraphReplacements.size > 0) {
		log.debug(`Wrapping ${paragraphReplacements.size} captioned image(s) in <figure>/<figcaption>`)
	}

	applyParagraphReplacements(tree, paragraphReplacements)
}

/**
 * Remark plugin that wraps images with adjacent caption text in
 * `<figure>/<figcaption>`. The original image node is preserved for
 * Astro's image optimization pipeline.
 */
export const remarkMdxKitCaptionImages: Plugin<never[], Root> = () => captionImagesTransform
