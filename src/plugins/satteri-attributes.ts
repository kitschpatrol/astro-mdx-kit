import type { Text } from 'mdast'
import type { MdastNode, MdastPluginDefinition, MdastVisitorContext } from 'satteri'
import type { ParsedAttributeList } from '../utils/attribute-list.js'
import { log } from '../log.js'
import { parseAttributeList } from '../utils/attribute-list.js'

const PLUGIN_NAME = 'astro-mdx-kit:attributes'

/**
 * Inline node types an IAL directly following the node applies to, per
 * `remark-attribute-list` behavior (text is excluded — an IAL after plain text
 * is consumed without being applied).
 */
const SPAN_TYPES = new Set([
	'delete',
	'emphasis',
	'footnoteReference',
	'image',
	'imageReference',
	'inlineCode',
	'link',
	'linkReference',
	'strong',
])

type AttributeMatch = {
	end: number
	parsed: ParsedAttributeList
	start: number
}

function findAttributeLists(value: string): AttributeMatch[] {
	const matches: AttributeMatch[] = []
	let index = value.indexOf('{:')
	while (index !== -1) {
		const parsed = parseAttributeList(value, index)
		if (parsed) {
			matches.push({ end: parsed.end, parsed, start: index })
			index = value.indexOf('{:', parsed.end)
		} else {
			index = value.indexOf('{:', index + 2)
		}
	}

	return matches
}

type ApplyAttributes = (target: Readonly<MdastNode>, parsed: ParsedAttributeList) => void

/**
 * Handle a paragraph that consists solely of an IAL: apply it to the directly
 * adjacent block (previous first, then next, matched by source line numbers)
 * and remove the paragraph.
 */
function applyStandaloneParagraph(
	paragraph: Readonly<MdastNode>,
	match: AttributeMatch,
	context: MdastVisitorContext,
	apply: ApplyAttributes,
): void {
	const grandparent = context.parent(paragraph)
	if (grandparent) {
		const paragraphIndex = context.indexOf(paragraph)
		const blocks = grandparent.children
		const ialStart = paragraph.position?.start.line
		const ialEnd = paragraph.position?.end.line
		const previous = paragraphIndex === undefined ? undefined : blocks[paragraphIndex - 1]
		const next = paragraphIndex === undefined ? undefined : blocks[paragraphIndex + 1]

		if (previous?.position && ialStart === previous.position.end.line + 1) {
			apply(previous, match.parsed)
		} else if (next?.position && ialEnd === next.position.start.line - 1) {
			apply(next, match.parsed)
		} else {
			log.debug('Consuming orphan attribute list with no adjacent block')
		}
	}

	context.removeNode(paragraph)
}

/**
 * Create a Sätteri MDAST plugin that applies Kramdown inline attribute lists
 * (`{:.class}`, `{:#id}`, `{:key="value"}`) found as literal text.
 *
 * Mirrors `remark-attribute-list` behavior on the unified pipeline:
 *
 * - An IAL directly following an inline element (image, link, emphasis, …)
 *   applies to that element.
 * - An IAL on its own line at the start or end of a paragraph applies to the
 *   paragraph.
 * - An IAL forming its own paragraph applies to the directly adjacent block
 *   (previous first, then next, matched by source line numbers).
 * - Any other IAL is consumed without being applied.
 *
 * In `.md` files the `{:...}` text is available as-is; in `.mdx` files the
 * Astro integration escapes IALs first (see `escapeMdxAttributeLists`) so they
 * survive MDX expression parsing as literal text.
 */
export function createSatteriAttributesPlugin(): MdastPluginDefinition {
	// Accumulates merged data per target node so multiple IALs applying to the
	// same node within one pass don't clobber each other (Sätteri mutation
	// commands are applied after the pass, so re-reading `node.data` is stale).
	const pendingData = new WeakMap<Readonly<MdastNode>, Record<string, unknown>>()

	function makeApply(context: MdastVisitorContext): ApplyAttributes {
		return (target, parsed) => {
			// eslint-disable-next-line ts/no-unsafe-type-assertion -- node data is an open record
			const existingData = target.data as Record<string, unknown> | undefined
			const data = pendingData.get(target) ?? { ...existingData }

			const hProperties: Record<string, unknown> = {
				// eslint-disable-next-line ts/no-unsafe-type-assertion -- hProperties is an open record
				...(data.hProperties as Record<string, unknown> | undefined),
			}

			if (parsed.classNames.length > 0) {
				hProperties.className = parsed.classNames.join(' ')
			}

			if (parsed.id !== undefined) {
				hProperties.id = parsed.id
				data.id = parsed.id
			}

			Object.assign(hProperties, parsed.pairs)
			data.hProperties = hProperties
			pendingData.set(target, data)
			context.setProperty(target, 'data', data)
		}
	}

	return {
		name: PLUGIN_NAME,
		text(node: Readonly<Text>, context: MdastVisitorContext) {
			const { value } = node
			const matches = findAttributeLists(value)
			if (matches.length === 0) {
				return
			}

			const apply = makeApply(context)
			const parent = context.parent(node)
			const nodeIndex = context.indexOf(node) ?? 0
			const siblings = parent.children

			// A paragraph consisting solely of an IAL applies to an adjacent block
			const [first] = matches
			if (
				parent.type === 'paragraph' &&
				siblings.length === 1 &&
				matches.length === 1 &&
				first &&
				value.trim() === value.slice(first.start, first.end)
			) {
				applyStandaloneParagraph(parent, first, context, apply)
				return
			}

			const position: TextPosition = { nodeIndex, parent, siblings, value }
			let newValue = ''
			let cursor = 0

			for (const match of matches) {
				const { stripStart, stripEnd } = applyMatch(match, position, apply)
				newValue += value.slice(cursor, stripStart)
				cursor = stripEnd
			}

			newValue += value.slice(cursor)

			if (newValue === '' && siblings.length > 1) {
				context.removeNode(node)
			} else {
				context.setProperty(node, 'value', newValue)
			}
		},
	}
}

type TextPosition = {
	nodeIndex: number
	parent: Readonly<MdastNode>
	siblings: ReadonlyArray<Readonly<MdastNode>>
	value: string
}

/**
 * Apply a single IAL match according to its position, returning the source
 * range to strip from the text node.
 */
function applyMatch(
	match: AttributeMatch,
	{ nodeIndex, parent, siblings, value }: TextPosition,
	apply: ApplyAttributes,
): { stripStart: number; stripEnd: number } {
	const isLastChild = nodeIndex === siblings.length - 1
	const previousChar = value[match.start - 1]
	const nextChar = value[match.end]

	if (match.start === 0 && nodeIndex > 0) {
		// IAL at text start directly following an inline element
		const previousSibling = siblings[nodeIndex - 1]
		if (previousSibling && SPAN_TYPES.has(previousSibling.type)) {
			apply(previousSibling, match.parsed)
		}
	} else if (
		parent.type === 'paragraph' &&
		isLastChild &&
		previousChar === '\n' &&
		match.end === value.length
	) {
		// IAL on its own line at the end of a paragraph → the paragraph.
		// Also strip the preceding newline.
		apply(parent, match.parsed)
		return { stripStart: match.start - 1, stripEnd: match.end }
	} else if (
		parent.type === 'paragraph' &&
		nodeIndex === 0 &&
		match.start === 0 &&
		nextChar === '\n'
	) {
		// IAL on its own line at the start of a paragraph → the paragraph.
		// Also strip the following newline.
		apply(parent, match.parsed)
		return { stripStart: match.start, stripEnd: match.end + 1 }
	}

	// Any other position: consume without applying (remark parity)
	return { stripStart: match.start, stripEnd: match.end }
}
