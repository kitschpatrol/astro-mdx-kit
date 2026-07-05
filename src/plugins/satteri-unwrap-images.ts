import type { Paragraph } from 'mdast'
import type { MdastPluginDefinition, MdastVisitorContext } from 'satteri'
import { isWhitespaceText } from '../utils/ast.js'
import { DEFAULT_IMAGE_NAMES, isImageLike } from '../utils/images.js'

const PLUGIN_NAME = 'astro-mdx-kit:unwrap-images'

/**
 * Create a Sätteri MDAST plugin that removes the wrapping `<p>` from paragraphs
 * containing a single stand-alone image (or JSX image component).
 *
 * Mirrors the remark {@link unwrapImagesTransform} for Sätteri pipelines. Runs
 * after element overrides so it also unwraps images that have been replaced by
 * custom components.
 *
 * @param imageComponentNames - Additional JSX element names to treat as images.
 *   Falls back to a built-in set: `img`, `Image`, `Picture`.
 */
export function createSatteriUnwrapImagesPlugin(
	imageComponentNames?: ReadonlySet<string>,
): MdastPluginDefinition {
	const names = imageComponentNames ?? DEFAULT_IMAGE_NAMES

	return {
		name: PLUGIN_NAME,
		paragraph(node: Readonly<Paragraph>, _context: MdastVisitorContext) {
			const meaningful = node.children.filter((child) => !isWhitespaceText(child))

			if (meaningful.length !== 1) {
				return
			}

			const only = meaningful[0]
			if (!only || !isImageLike(only, names)) {
				return
			}

			// Replace the paragraph with the image node itself
			return only
		},
	}
}
