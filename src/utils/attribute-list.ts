/**
 * Kramdown inline attribute list (IAL) parsing and MDX source escaping for the
 * Sätteri pipeline.
 *
 * On the unified processor, `remark-attribute-list` handles `{:...}` syntax as
 * a micromark parser extension. Sätteri's Rust parser does not support custom
 * syntax extensions, so the Sätteri pipeline instead:
 *
 * 1. Escapes valid IALs in `.mdx` sources (`{:` → `\{:`) before the MDX parser
 *    runs, so they survive as literal text instead of failing MDX expression
 *    parsing (see {@link escapeMdxAttributeLists}).
 * 2. Parses the literal `{:...}` text out of MDAST text nodes and applies the
 *    attributes with a Sätteri plugin (see `createSatteriAttributesPlugin`).
 *
 * The grammar matches what `remark-attribute-list` accepts: `.class`, `#id`,
 * and `key="value"` / `key='value'` tokens. Unquoted values are not valid —
 * such spans are left untouched, mirroring the remark behavior.
 */

/**
 * Attributes parsed from a single `{:...}` inline attribute list.
 */
export type ParsedAttributeList = {
	/** Class names, in source order. */
	classNames: string[]
	/** Index just past the closing `}` in the source string. */
	end: number
	/** Element id from `#id`, if present. */
	id?: string
	/** `key="value"` pairs, in source order. */
	pairs: Record<string, string>
}

const NAME_CHAR_REGEX = /[\w\-]/v
const KEY_CHAR_REGEX = /[:\w\-]/v

/**
 * Accepted value quote pairs. Includes curly quotes because smart punctuation
 * (enabled by default in Astro) converts straight quotes in text at parse time,
 * before plugins run.
 */
const QUOTE_PAIRS: Record<string, string> = {
	'"': '"',
	"'": "'",
	'‘': '’',
	'“': '”',
}

function isSpaceOrTab(char: string | undefined): boolean {
	return char === ' ' || char === '\t'
}

/**
 * Parse an inline attribute list starting at `start` (which must point at
 * `{:`). Returns `undefined` if the span is not a valid IAL — invalid spans
 * must be left untouched so they render as literal text.
 *
 * IALs are single-line: a newline before the closing `}` invalidates the span.
 *
 * @param source - The string to parse from.
 * @param start - Index of the opening `{`.
 */
export function parseAttributeList(source: string, start: number): ParsedAttributeList | undefined {
	if (!source.startsWith('{:', start)) {
		return undefined
	}

	const classNames: string[] = []
	const pairs: Record<string, string> = {}
	let id: string | undefined
	let sawToken = false
	let index = start + 2

	const readName = (charRegex: RegExp): string => {
		let name = ''
		while (index < source.length && charRegex.test(source[index]!)) {
			name += source[index]
			index++
		}

		return name
	}

	for (;;) {
		while (isSpaceOrTab(source[index])) {
			index++
		}

		const char = source[index]
		if (char === undefined || char === '\n') {
			return undefined
		}

		if (char === '}') {
			if (!sawToken) {
				return undefined
			}

			const result: ParsedAttributeList = { classNames, end: index + 1, pairs }
			if (id !== undefined) {
				result.id = id
			}

			return result
		}

		if (char === '.' || char === '#') {
			index++
			const name = readName(NAME_CHAR_REGEX)
			if (name === '') {
				return undefined
			}

			if (char === '.') {
				classNames.push(name)
			} else {
				id = name
			}
		} else {
			const key = readName(KEY_CHAR_REGEX)
			if (key === '' || source[index] !== '=') {
				return undefined
			}

			index++
			const quote = source[index]
			const closingQuote = quote === undefined ? undefined : QUOTE_PAIRS[quote]
			if (closingQuote === undefined) {
				return undefined
			}

			index++
			const closing = source.indexOf(closingQuote, index)
			if (closing === -1) {
				return undefined
			}

			const value = source.slice(index, closing)
			if (value.includes('\n')) {
				return undefined
			}

			pairs[key] = value
			index = closing + 1
		}

		sawToken = true
	}
}

const FENCE_OPEN_REGEX = /^ {0,3}(`{3,}|~{3,})/v

/**
 * Escape valid inline attribute lists in MDX source (`{:` → `\{\:`) so the MDX
 * parser treats them as literal text instead of failing to parse them as
 * expressions (or, with the directive feature enabled, as text directives).
 *
 * Skips fenced code blocks, inline code spans, and a leading frontmatter block.
 * Only spans matching the strict IAL grammar are escaped — anything else (e.g.
 * `{:key=unquoted}`) is left for the MDX parser to reject, matching the unified
 * pipeline where such spans fail MDX expression parsing too.
 *
 * @param code - The raw MDX source.
 *
 * @returns The escaped source (identical string if nothing needed escaping).
 */
export function escapeMdxAttributeLists(code: string): string {
	const lines = code.split('\n')
	const output: string[] = []

	let lineIndex = 0

	// Skip a leading frontmatter block
	if (lines[0] === '---') {
		output.push(lines[0])
		lineIndex = 1
		while (lineIndex < lines.length) {
			const line = lines[lineIndex]!
			output.push(line)
			lineIndex++
			if (line === '---') {
				break
			}
		}
	}

	let fenceClose: RegExp | undefined

	for (; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex]!

		if (fenceClose) {
			output.push(line)
			if (fenceClose.test(line)) {
				fenceClose = undefined
			}

			continue
		}

		const fenceMatch = FENCE_OPEN_REGEX.exec(line)
		if (fenceMatch) {
			output.push(line)
			const marker = fenceMatch[1]!
			fenceClose = new RegExp(String.raw`^ {0,3}${marker[0]}{${marker.length},}\s*$`, 'v')
			continue
		}

		output.push(escapeLine(line))
	}

	return output.join('\n')
}

function escapeLine(line: string): string {
	let result = ''
	let index = 0

	while (index < line.length) {
		const char = line[index]!

		// Skip inline code spans: a run of N backticks closed by a matching run
		if (char === '`') {
			let runLength = 1
			while (line[index + runLength] === '`') {
				runLength++
			}

			const closing = line.indexOf('`'.repeat(runLength), index + runLength)
			const end = (closing === -1 ? index : closing) + runLength
			result += line.slice(index, end)
			index = end
			continue
		}

		if (char === '{' && line[index + 1] === ':' && line[index - 1] !== '\\') {
			const parsed = parseAttributeList(line, index)
			if (parsed) {
				// Escape both the brace and the colon: `\{` alone would leave a
				// `:name` run that parses as a text directive when the directive
				// feature is enabled.
				result += String.raw`\{\:${line.slice(index + 2, parsed.end)}`
				index = parsed.end
				continue
			}
		}

		result += char
		index++
	}

	return result
}
