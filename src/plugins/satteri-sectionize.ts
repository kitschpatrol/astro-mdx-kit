import type { Heading, Parents } from 'mdast'
import type { MdastNode, MdastPluginDefinition, MdastVisitorContext } from 'satteri'
import { createJsxFlowElement } from '../utils/ast.js'

const PLUGIN_NAME = 'astro-mdx-kit:sectionize'

const SEEN_PARENTS_KEY = Symbol('astro-mdx-kit:sectionize')

/**
 * Get (or lazily create) the per-document set of parents already sectionized.
 * Stored on `ctx.data` under a symbol key so it never leaks into the
 * JSON-serialized compile result, and is naturally scoped to a single document
 * (Sätteri creates a fresh data bag per compile). Parent identity is stable
 * within a pass, so the set can dedupe by object reference.
 */
function getSeenParents(context: MdastVisitorContext): WeakSet<Readonly<Parents>> {
	const data = context.data as unknown as Record<symbol, unknown>
	data[SEEN_PARENTS_KEY] ??= new WeakSet()
	return data[SEEN_PARENTS_KEY] as WeakSet<Readonly<Parents>>
}

/**
 * A section ends at the next heading of equal or shallower depth, or at an ESM
 * import/export statement (which must stay at the top level of the module —
 * mirrors remark-sectionize's `export` boundary, modernized for the MDX v2+
 * `mdxjsEsm` node type).
 */
function isSectionBoundary(node: Readonly<MdastNode>, depth: number): boolean {
	return (node.type === 'heading' && node.depth <= depth) || node.type === 'mdxjsEsm'
}

/**
 * Index of the first node at or after `start` that ends a section of the given
 * depth, or `nodes.length` when the section runs to the end of the list.
 */
function findSectionEnd(
	nodes: ReadonlyArray<Readonly<MdastNode>>,
	start: number,
	depth: number,
): number {
	for (let end = start; end < nodes.length; end++) {
		const candidate = nodes[end]
		if (candidate === undefined || isSectionBoundary(candidate, depth)) {
			return end
		}
	}

	return nodes.length
}

/**
 * Walk a sibling list, calling `wrap` for each heading-led section range and
 * passing other nodes through. `wrap` receives the heading, the (recursively
 * sectionized) content after it, and must return the node(s) representing the
 * section.
 */
function sectionizeSiblings(
	nodes: ReadonlyArray<Readonly<MdastNode>>,
	wrap: (heading: Readonly<MdastNode>, content: MdastNode[]) => MdastNode[],
): MdastNode[] {
	const result: MdastNode[] = []
	let index = 0

	while (index < nodes.length) {
		const node = nodes[index]
		if (node === undefined) {
			break
		}

		if (node.type !== 'heading') {
			result.push(node)
			index++
			continue
		}

		const end = findSectionEnd(nodes, index + 1, node.depth)
		result.push(...wrap(node, sectionizeSiblings(nodes.slice(index + 1, end), wrap)))
		index = end
	}

	return result
}

/**
 * Wrap a section in a `<section>` JSX flow element. Existing Sätteri node
 * handles are reused as-is (the op-stream references them by id and moves
 * them); only the `<section>` wrapper is a new node. Used for MDX compiles —
 * plain Markdown compiles drop JSX elements, so they get raw HTML markers
 * instead.
 */
function wrapInJsxSection(heading: Readonly<MdastNode>, content: MdastNode[]): MdastNode[] {
	return [createJsxFlowElement('section', [], [heading, ...content])]
}

/**
 * Bracket a section with raw `<section>`/`</section>` HTML nodes, leaving the
 * sibling list flat. Nested sections produce balanced nested tags in the
 * rendered output.
 */
function wrapInHtmlSection(heading: Readonly<MdastNode>, content: MdastNode[]): MdastNode[] {
	return [
		{ type: 'html', value: '<section>' },
		heading,
		...content,
		{ type: 'html', value: '</section>' },
	]
}

/**
 * Create a Sätteri MDAST plugin that wraps each heading and its following
 * content in a `<section>` element, nested by heading depth.
 *
 * Mirrors [remark-sectionize](https://github.com/jake-low/remark-sectionize)
 * for Sätteri pipelines. Sectioning is applied per parent, so headings nested
 * inside containers (block quotes, container directives, JSX elements) are
 * sectionized within their parent, just like remark-sectionize.
 */
export function createSatteriSectionizePlugin(): MdastPluginDefinition {
	return {
		heading(node: Readonly<Heading>, context: MdastVisitorContext) {
			const parent = context.parent(node)

			// Every heading triggers its parent, but each parent's sibling list
			// only needs sectionizing once.
			const seenParents = getSeenParents(context)
			if (seenParents.has(parent)) {
				return
			}

			seenParents.add(parent)

			const wrap = context.sourceFormat === 'mdx' ? wrapInJsxSection : wrapInHtmlSection
			context.setProperty(parent, 'children', sectionizeSiblings(parent.children, wrap))
		},
		name: PLUGIN_NAME,
	}
}
