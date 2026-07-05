import type { Image } from 'mdast'
import type { MdastPluginDefinition, MdastVisitorContext } from 'satteri'
import { log } from '../log.js'
import { createJsxFlowElement } from '../utils/ast.js'
import { extractCaptionNodes } from '../utils/caption.js'

const PLUGIN_NAME = 'astro-mdx-kit:caption-images'

/**
 * Create a Sätteri MDAST plugin that wraps stand-alone images with adjacent
 * caption text in `<figure>/<figcaption>` elements.
 *
 * Mirrors the remark {@link captionImagesTransform} for Sätteri pipelines. The
 * original MDAST `image` node is preserved inside the figure so that Astro's
 * built-in image optimization still applies. Paragraphs with multiple images
 * are skipped to avoid ambiguity.
 */
export function createSatteriCaptionImagesPlugin(): MdastPluginDefinition {
	return {
		image(node: Readonly<Image>, context: MdastVisitorContext) {
			const parent = context.parent(node)
			if (parent.type !== 'paragraph') {
				return
			}

			if (parent.children.filter((child) => child.type === 'image').length > 1) {
				return
			}

			const index = context.indexOf(node)
			if (index === undefined) {
				return
			}

			const captionNodes = extractCaptionNodes(parent, index)
			if (captionNodes.length === 0) {
				return
			}

			log.debug('Wrapping captioned image in <figure>/<figcaption>')
			const figcaption = createJsxFlowElement('figcaption', [], captionNodes)
			const figure = createJsxFlowElement('figure', [], [node, figcaption])
			context.replaceNode(parent, figure)
		},
		name: PLUGIN_NAME,
	}
}
