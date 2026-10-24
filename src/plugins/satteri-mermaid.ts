import type { MdastPluginDefinition, MdastVisitorContext } from 'satteri'
import type { MermaidOptions } from '../types.js'
import { createMermaidRenderer } from '../utils/mermaid.js'

/**
 * Create a Sätteri plugin that renders fenced Mermaid diagrams to SVG with
 * Pele.
 */
export function createSatteriMermaidPlugin(options: MermaidOptions = {}): MdastPluginDefinition {
	const renderers = new WeakMap<
		MdastVisitorContext['data'],
		ReturnType<typeof createMermaidRenderer>
	>()

	return {
		code(node, context) {
			if (node.lang !== 'mermaid') {
				return
			}

			let render = renderers.get(context.data)
			if (!render) {
				render = createMermaidRenderer(options, context.source, context.fileURL?.href)
				renderers.set(context.data, render)
			}

			context.replaceNode(node, render(node))
		},
		name: 'astro-mdx-kit:mermaid',
		options: { position: true },
	}
}
