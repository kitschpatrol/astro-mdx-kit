import type { Parent, Root } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

function isWhitespaceText(node: { type: string; value?: string }): boolean {
	return node.type === 'text' && !node.value?.trim()
}

function isImageLike(node: { type: string }): boolean {
	return (
		node.type === 'image' || node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement'
	)
}

function isStandaloneImage(paragraph: Parent): boolean {
	const meaningful = paragraph.children.filter(
		(child) => !isWhitespaceText(child as { type: string; value?: string }),
	)
	// eslint-disable-next-line ts/no-unsafe-type-assertion
	return meaningful.length === 1 && isImageLike(meaningful.at(0) as { type: string })
}

function unwrapParagraph(parent: { children: unknown[] }, index: number, paragraph: Parent): void {
	parent.children.splice(index, 1, ...paragraph.children)
}

/**
 * Tree transformer that removes the wrapping `<p>` from paragraphs
 * containing a single stand-alone image (or JSX image component).
 *
 * Handles both top-level paragraphs and those nested inside block
 * quotes, list items, etc. Exported separately from the plugin wrapper
 * for use in tests and composed transform pipelines.
 * @param tree - The root MDAST node to transform in-place.
 */
export function unwrapImagesTransform(tree: Root): void {
	// Walk in reverse so splicing doesn't shift unvisited indices
	for (let index = tree.children.length - 1; index >= 0; index--) {
		const child = tree.children[index]
		if (child?.type !== 'paragraph') continue
		if (!isStandaloneImage(child)) continue

		unwrapParagraph(tree, index, child)
	}

	// Also handle images nested deeper (e.g. inside block quotes, list items)
	visit(tree, 'paragraph', (node, index, parent) => {
		if (index === undefined || !parent) return
		if (!isStandaloneImage(node)) return
		unwrapParagraph(parent as { children: unknown[] }, index, node)
	})
}

/**
 * Remark plugin that removes the wrapping paragraph from stand-alone images.
 *
 * Works with both native MDAST `image` nodes and MDX JSX elements
 * produced by element overrides (e.g. `<Picture>`).
 */
export const remarkMdxKitUnwrapImages: Plugin<never[], Root> = () => unwrapImagesTransform
