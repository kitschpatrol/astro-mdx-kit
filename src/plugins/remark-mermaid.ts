import type { Root } from 'mdast'
import type { Plugin } from 'unified'
import type { VFile } from 'vfile'
import { SKIP, visit } from 'unist-util-visit'
import type { MermaidOptions } from '../types.js'
import { createMermaidRenderer } from '../utils/mermaid.js'

/**
 * Create a transformer that renders fenced Mermaid diagrams to SVG with Pele.
 */
export function createMermaidTransform(
	options: MermaidOptions = {},
): (tree: Root, file: VFile) => void {
	return (tree, file) => {
		const render = createMermaidRenderer(options, file.toString(), file.path)
		visit(tree, 'code', (node, index, parent) => {
			if (index === undefined || !parent || node.lang !== 'mermaid') {
				return
			}

			parent.children[index] = render(node)
			return SKIP
		})
	}
}

/**
 * Remark plugin that renders fenced Mermaid diagrams to SVG with Pele.
 */
export const remarkMdxKitMermaid: Plugin<[MermaidOptions?], Root> = (options) =>
	createMermaidTransform(options)
