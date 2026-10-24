import type { Code, Parent } from 'mdast'
import { fromHtml } from 'hast-util-from-html'
import { createHash } from 'node:crypto'
import { render } from 'pele'
import type { MermaidOptions } from '../types.js'

/**
 * Rendered Mermaid block, with its SVG stored in `data.hChildren`.
 */
export type MermaidNode = Parent & { type: 'mermaid' }

declare module 'mdast' {
	// eslint-disable-next-line ts/consistent-type-definitions -- Declaration merging requires an interface.
	interface BlockContentMap {
		mermaid: MermaidNode
	}

	// eslint-disable-next-line ts/consistent-type-definitions -- Declaration merging requires an interface.
	interface RootContentMap {
		mermaid: MermaidNode
	}
}

/**
 * Create a document-scoped renderer with deterministic, distinct SVG IDs.
 * Parsed HAST children preserve SVG namespaces, styles, and text in both
 * Markdown and MDX without raw HTML or a browser runtime.
 */
export function createMermaidRenderer(
	options: MermaidOptions,
	source: string,
	filePath?: string,
): (node: Readonly<Code>) => MermaidNode {
	const documentId = createHash('sha256')
		.update(filePath ?? source)
		.digest('hex')
		.slice(0, 12)
	let index = 0

	return (node) => {
		try {
			const { svg } = render(node.value, {
				...options,
				idPrefix: `mdx-kit-mermaid-${documentId}-${index++}`,
			})

			// A custom block with HAST overrides works in Markdown and MDX.
			// Using a paragraph here would lose the SVG in Sätteri's tight lists.
			return {
				children: [],
				data: {
					hChildren: fromHtml(svg, { fragment: true }).children.filter(
						(child) => child.type === 'element',
					),
					hName: 'div',
					hProperties: { className: ['mermaid'] },
				},
				position: node.position,
				type: 'mermaid',
			}
		} catch (error) {
			const location = `${filePath ?? 'document'}:${node.position?.start.line ?? 1}`
			const message = error instanceof Error ? error.message : String(error)
			throw new Error(`Failed to render Mermaid diagram at ${location}: ${message}`, {
				cause: error,
			})
		}
	}
}
