import type { Parent, Root } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

/**
 * Options for the unwrap-images transform.
 */
export type RemarkUnwrapImagesOptions = {
	/**
	 * Additional JSX element names to treat as images when deciding whether a
	 * paragraph contains a stand-alone image. Native `image` nodes are always
	 * recognized.
	 *
	 * When omitted, falls back to a built-in set: `img`, `Image`, `Picture`.
	 */
	imageComponentNames?: Set<string>
}

const DEFAULT_IMAGE_NAMES = new Set(['Image', 'img', 'Picture'])

function isWhitespaceText(node: { type: string; value?: string }): boolean {
	return node.type === 'text' && !node.value?.trim()
}

function isImageLike(node: { name?: string; type: string }, names: Set<string>): boolean {
	if (node.type === 'image') return true
	if (node.type !== 'mdxJsxFlowElement' && node.type !== 'mdxJsxTextElement') return false
	return node.name !== undefined && names.has(node.name)
}

function isStandaloneImage(paragraph: Parent, names: Set<string>): boolean {
	const meaningful = paragraph.children.filter(
		(child) => !isWhitespaceText(child as { type: string; value?: string }),
	)

	if (meaningful.length !== 1) return false
	// eslint-disable-next-line ts/no-unsafe-type-assertion
	return isImageLike(meaningful[0] as { name?: string; type: string }, names)
}

function unwrapParagraph(parent: { children: unknown[] }, index: number, paragraph: Parent): void {
	parent.children.splice(index, 1, ...paragraph.children)
}

/**
 * Tree transformer that removes the wrapping `<p>` from paragraphs containing a
 * single stand-alone image (or JSX image component).
 *
 * Handles both top-level paragraphs and those nested inside block quotes, list
 * items, etc. Exported separately from the plugin wrapper for use in tests and
 * composed transform pipelines.
 *
 * @param tree - The root MDAST node to transform in-place.
 * @param options - Optional configuration for image component names.
 */
export function unwrapImagesTransform(tree: Root, options?: RemarkUnwrapImagesOptions): void {
	const names = options?.imageComponentNames ?? DEFAULT_IMAGE_NAMES

	// Walk in reverse so splicing doesn't shift unvisited indices
	for (let index = tree.children.length - 1; index >= 0; index--) {
		const child = tree.children[index]
		if (child?.type !== 'paragraph') continue
		if (!isStandaloneImage(child, names)) continue

		unwrapParagraph(tree, index, child)
	}

	// Also handle images nested deeper (e.g. inside block quotes, list items)
	visit(tree, 'paragraph', (node, index, parent) => {
		if (index === undefined || !parent) return
		if (!isStandaloneImage(node, names)) return
		unwrapParagraph(parent as { children: unknown[] }, index, node)
	})
}

/**
 * Remark plugin that removes the wrapping paragraph from stand-alone images.
 *
 * Works with both native MDAST `image` nodes and MDX JSX elements produced by
 * element overrides (e.g. `<Picture>`).
 */
export const remarkMdxKitUnwrapImages: Plugin<[RemarkUnwrapImagesOptions?], Root> = (options) => {
	const resolvedOptions = options ?? {}
	return (tree: Root) => {
		unwrapImagesTransform(tree, resolvedOptions)
	}
}
