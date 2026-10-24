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

const STARLIGHT_COLORS: Record<string, string> = {
	'--pele-accent': '--sl-color-text-accent',
	'--pele-bg': '--sl-color-bg',
	'--pele-border': '--sl-color-gray-4',
	'--pele-critical': '--sl-color-red-high',
	'--pele-error': '--sl-color-red-high',
	'--pele-fg': '--sl-color-text',
	'--pele-line': '--sl-color-gray-1',
	'--pele-muted': '--sl-color-gray-3',
	'--pele-surface': '--sl-color-gray-6',
	'--pele-surface-alt': '--sl-color-bg-inline-code',
}

function withStarlightColors(style: string): string {
	// Extend Pele's fallbacks instead of defining --pele-* properties, so
	// explicit themes inherited from any ancestor keep taking precedence.
	return style.replaceAll(
		/var\((--pele-[\w\-]+),([^\(\)]*)\)/gv,
		(match: string, property: string, fallback: string) => {
			const starlightProperty = STARLIGHT_COLORS[property]
			return starlightProperty === undefined
				? match
				: `var(${property},var(${starlightProperty},${fallback}))`
		},
	)
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
			const children = fromHtml(svg, { fragment: true }).children.filter(
				(child) => child.type === 'element',
			)
			for (const child of children) {
				if (child.tagName === 'svg' && typeof child.properties.style === 'string') {
					child.properties.style = withStarlightColors(child.properties.style)
				}
			}

			// A custom block with HAST overrides works in Markdown and MDX.
			// Using a paragraph here would lose the SVG in Sätteri's tight lists.
			return {
				children: [],
				data: {
					hChildren: children,
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
