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
 * Check whether everything in `value` outside the matched IAL spans is
 * whitespace (i.e. the text consists solely of attribute lists).
 */
function isWhitespaceOutsideMatches(value: string, matches: AttributeMatch[]): boolean {
	let outside = ''
	let cursor = 0
	for (const match of matches) {
		outside += value.slice(cursor, match.start)
		cursor = match.end
	}

	return (outside + value.slice(cursor)).trim() === ''
}

/**
 * Handle a paragraph that consists solely of IALs: apply them all to the
 * directly adjacent block (previous first, then next, matched by source line
 * numbers) and remove the paragraph.
 */
function applyStandaloneParagraph(
	paragraph: Readonly<MdastNode>,
	matches: AttributeMatch[],
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

		let target: Readonly<MdastNode> | undefined
		if (previous?.position && ialStart === previous.position.end.line + 1) {
			target = previous
		} else if (next?.position && ialEnd === next.position.start.line - 1) {
			target = next
		}

		if (target) {
			for (const match of matches) {
				apply(target, match.parsed)
			}
		} else {
			log.debug('Consuming orphan attribute list with no adjacent block')
		}
	}

	context.removeNode(paragraph)
}

/**
 * Count the contiguous chain of IALs at the start of the text (each match
 * beginning exactly where the previous one ends, starting at offset 0).
 */
function findInlineChainLength(matches: AttributeMatch[]): number {
	let count = 0
	let chainEnd = 0
	while (count < matches.length && matches[count]!.start === chainEnd) {
		chainEnd = matches[count]!.end
		count++
	}

	return count
}

/**
 * Find the index of the first match in a trailing own-line IAL block: a suffix
 * of the text containing only IALs and whitespace, beginning at a line start.
 * Returns `matches.length` when there is no such block.
 */
function findTrailingBlockStart(
	value: string,
	matches: AttributeMatch[],
	firstEligible: number,
): number {
	let trailingStart = matches.length
	let boundary = value.length
	for (let i = matches.length - 1; i >= firstEligible; i--) {
		const match = matches[i]!
		if (value.slice(match.end, boundary).trim() !== '') {
			break
		}

		boundary = match.start
		if (value[match.start - 1] === '\n') {
			trailingStart = i
		}
	}

	return trailingStart
}

/**
 * Find the index of the last match in a leading own-line IAL block: a prefix of
 * the text containing only IALs and whitespace, ending at a newline. Returns
 * `-1` when there is no such block.
 */
function findLeadingBlockEnd(
	value: string,
	matches: AttributeMatch[],
	lastEligible: number,
): number {
	if (matches[0]?.start !== 0) {
		return -1
	}

	let leadingEnd = -1
	let boundary = 0
	for (let i = 0; i < lastEligible; i++) {
		const match = matches[i]!
		if (value.slice(boundary, match.start).trim() !== '') {
			break
		}

		boundary = match.end
		if (value[match.end] === '\n') {
			leadingEnd = i
		}
	}

	return leadingEnd
}

type StripInput = {
	apply: ApplyAttributes
	inlineChainCount: number
	leadingEnd: number
	matches: AttributeMatch[]
	parent: Readonly<MdastNode>
	previousSibling: Readonly<MdastNode> | undefined
	trailingStart: number
	value: string
}

/**
 * Apply each IAL match according to its region (inline chain, leading block,
 * trailing block, or none) and return the text value with all consumed spans
 * stripped.
 */
function applyMatchesAndStrip(input: StripInput): string {
	const { apply, inlineChainCount, leadingEnd, matches, parent, previousSibling, trailingStart } =
		input
	const { value } = input
	let newValue = ''
	let cursor = 0

	for (const [i, match] of matches.entries()) {
		// Only line-anchored IALs in an own-line block apply; extras on the same
		// line are consumed without applying (remark parity)
		const isLineStart = match.start === 0 || value[match.start - 1] === '\n'

		let stripStart = match.start
		let stripEnd = match.end

		if (i < inlineChainCount) {
			if (previousSibling && SPAN_TYPES.has(previousSibling.type)) {
				apply(previousSibling, match.parsed)
			}
		} else if (leadingEnd !== -1 && i <= leadingEnd) {
			if (isLineStart) {
				apply(parent, match.parsed)
			}

			// Strip the whole block, including the newline that ends it
			stripStart = cursor
			if (i === leadingEnd) {
				stripEnd = match.end + 1
			}
		} else if (i >= trailingStart) {
			if (isLineStart) {
				apply(parent, match.parsed)
			}

			// Strip the whole block, including the newline that starts it
			stripStart = i === trailingStart ? match.start - 1 : cursor
			if (i === matches.length - 1) {
				stripEnd = value.length
			}
		}
		// Any other position: consume without applying (remark parity)

		newValue += value.slice(cursor, stripStart)
		cursor = stripEnd
	}

	return newValue + value.slice(cursor)
}

/**
 * Create a Sätteri MDAST plugin that applies Kramdown inline attribute lists
 * (`{:.class}`, `{:#id}`, `{:key="value"}`) found as literal text.
 *
 * Mirrors `remark-attribute-list` behavior on the unified pipeline:
 *
 * - An IAL directly following an inline element (image, link, emphasis, …)
 *   applies to that element; contiguous chains (`{:.a}{:.b}`) all apply.
 * - Own-line IALs at the start or end of a paragraph apply to the paragraph;
 *   consecutive own-line IALs stack.
 * - A paragraph consisting solely of IALs applies them to the directly adjacent
 *   block (previous first, then next, matched by source line numbers).
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
			const existingData = target.data as Record<string, unknown> | undefined
			const data = pendingData.get(target) ?? { ...existingData }

			const hProperties: Record<string, unknown> = {
				...(data.hProperties as Record<string, unknown> | undefined),
			}

			if (parsed.classNames.length > 0) {
				// Append to any existing classes (remark parity — stacked IALs merge)
				const existing = hProperties.className
				hProperties.className =
					typeof existing === 'string' && existing !== ''
						? `${existing} ${parsed.classNames.join(' ')}`
						: parsed.classNames.join(' ')
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

			// A paragraph consisting solely of IALs applies to an adjacent block
			if (
				parent.type === 'paragraph' &&
				siblings.length === 1 &&
				isWhitespaceOutsideMatches(value, matches)
			) {
				applyStandaloneParagraph(parent, matches, context, apply)
				return
			}

			const isParagraph = parent.type === 'paragraph'
			const isLastChild = nodeIndex === siblings.length - 1

			// A contiguous chain of IALs at text start directly following an
			// inline element applies to that element (e.g. `*em*{:.a}{:.b}`).
			const inlineChainCount = nodeIndex > 0 ? findInlineChainLength(matches) : 0

			// Own-line IALs (possibly stacked across lines) at the end or start
			// of a paragraph apply to the paragraph.
			const trailingStart =
				isParagraph && isLastChild
					? findTrailingBlockStart(value, matches, inlineChainCount)
					: matches.length
			const leadingEnd =
				isParagraph && nodeIndex === 0 && inlineChainCount === 0
					? findLeadingBlockEnd(value, matches, trailingStart)
					: -1

			const newValue = applyMatchesAndStrip({
				apply,
				inlineChainCount,
				leadingEnd,
				matches,
				parent,
				previousSibling: siblings[nodeIndex - 1],
				trailingStart,
				value,
			})

			if (newValue === '' && siblings.length > 1) {
				context.removeNode(node)
			} else {
				context.setProperty(node, 'value', newValue)
			}
		},
	}
}
