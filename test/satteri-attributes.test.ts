import { markdownToHtml, mdxToJs } from 'satteri'
import { describe, expect, it } from 'vitest'
import type { MdxKitOptions } from '../src/types'
import { escapeMdxAttributeLists, satteriMdxKit } from '../src/satteri-plugin'
import { parseAttributeList } from '../src/utils/attribute-list'

const ASSET_IMPORT_DARK_REGEX = /import _mdxKitAsset\w+ from "\.\/dark\.jpg"/v
const SRC_DARK_ATTRIBUTE_REGEX = /srcDark: _mdxKitAsset\w+/v

async function compileMd(source: string, options?: MdxKitOptions) {
	const result = await markdownToHtml(source, {
		mdastPlugins: satteriMdxKit(options ?? { attributes: true }),
	})
	return result.html
}

async function compileMdx(source: string, options?: MdxKitOptions) {
	const result = await mdxToJs(escapeMdxAttributeLists(source), {
		data: {},
		features: { directive: true },
		jsxImportSource: 'astro',
		mdastPlugins: satteriMdxKit(options ?? { attributes: true }),
	})
	return result.code
}

describe('parseAttributeList', () => {
	it('parses classes, ids, and quoted key-value pairs', () => {
		expect(parseAttributeList('{:.a .b #x k="v" k2=\'w\'}', 0)).toEqual({
			classNames: ['a', 'b'],
			end: 24,
			id: 'x',
			pairs: { k: 'v', k2: 'w' },
		})
	})

	it('allows leading whitespace inside the braces', () => {
		expect(parseAttributeList('{: .spaced}', 0)?.classNames).toEqual(['spaced'])
	})

	it('rejects unquoted values, empty lists, and newlines', () => {
		expect(parseAttributeList('{:key=unquoted}', 0)).toBeUndefined()
		expect(parseAttributeList('{:}', 0)).toBeUndefined()
		expect(parseAttributeList('{:.a\n}', 0)).toBeUndefined()
		expect(parseAttributeList('{:.a', 0)).toBeUndefined()
	})
})

describe('escapeMdxAttributeLists', () => {
	it('escapes valid attribute lists', () => {
		expect(escapeMdxAttributeLists('![a](x){:.zoom}')).toBe(String.raw`![a](x)\{\:.zoom}`)
	})

	it('leaves invalid spans, code fences, inline code, and frontmatter alone', () => {
		const source = [
			'---',
			'title: {:.not-an-ial}',
			'---',
			'',
			'`code {:.x}` and text {:.y}',
			'',
			'```md',
			'fenced {:.z}',
			'```',
			'',
			'{:key=unquoted}',
			'',
		].join('\n')

		const escaped = escapeMdxAttributeLists(source)
		expect(escaped).toContain('title: {:.not-an-ial}')
		expect(escaped).toContain('`code {:.x}` and text \\{\\:.y}')
		expect(escaped).toContain('fenced {:.z}')
		expect(escaped).toContain('{:key=unquoted}')
	})

	it('does not double-escape already escaped lists', () => {
		expect(escapeMdxAttributeLists(String.raw`\{:.x}`)).toBe(String.raw`\{:.x}`)
	})

	it('recognizes frontmatter fences with trailing whitespace', () => {
		const escaped = escapeMdxAttributeLists('---\ntitle: x\n--- \n\nBody {:.y}\n')
		expect(escaped).toContain('title: x')
		expect(escaped).toContain(String.raw`Body \{\:.y}`)
	})

	it('recognizes frontmatter fences in CRLF sources', () => {
		const escaped = escapeMdxAttributeLists('---\r\ntitle: "{:.x}"\r\n---\r\n\r\nBody {:.y}\r\n')
		expect(escaped).toContain('title: "{:.x}"')
		expect(escaped).toContain(String.raw`Body \{\:.y}`)
	})

	it('treats an unclosed opening fence as content, not frontmatter', () => {
		expect(escapeMdxAttributeLists('---\nBody {:.y}\n')).toContain(String.raw`Body \{\:.y}`)
	})
})

describe('satteri attributes in markdown', () => {
	it('applies an IAL directly after an image', async () => {
		const html = await compileMd('![alt](./x.jpg){:data-zoom="true"}\n')
		expect(html).toContain('data-zoom="true"')
		expect(html).not.toContain('{:')
	})

	it('applies an own-line IAL to the paragraph', async () => {
		const html = await compileMd('A paragraph.\n{:.highlight}\n')
		expect(html).toContain('class="highlight"')
		expect(html).toContain('A paragraph.')
		expect(html).not.toContain('{:')
	})

	it('applies a leading own-line IAL to the paragraph', async () => {
		const html = await compileMd('{:.lead}\nA paragraph after.\n')
		expect(html).toContain('class="lead"')
		expect(html).not.toContain('{:')
	})

	it('applies a standalone IAL paragraph to the adjacent previous block', async () => {
		const html = await compileMd('# Title\n{:#custom-id .fancy}\n')
		expect(html).toContain('id="custom-id"')
		expect(html).toContain('class="fancy"')
		expect(html).not.toContain('{:')
	})

	it('applies an IAL after inline emphasis and strong', async () => {
		const html = await compileMd('Some *em*{:.e} and **strong**{:.s} text.\n')
		expect(html).toContain('<em class="e">')
		expect(html).toContain('<strong class="s">')
	})

	it('applies stacked standalone IALs to the previous block', async () => {
		const html = await compileMd('# Title\n{:.a}\n{:.b}\n')
		expect(html).toContain('<h1 class="a b">')
		expect(html).not.toContain('<p')
		expect(html).not.toContain('{:')
	})

	it('applies stacked trailing own-line IALs to the paragraph', async () => {
		const html = await compileMd('A paragraph.\n{:.a}\n{:.b}\n')
		expect(html).toContain('<p class="a b">A paragraph.</p>')
	})

	it('applies stacked leading own-line IALs to the paragraph', async () => {
		const html = await compileMd('{:.a}\n{:.b}\nA paragraph.\n')
		expect(html).toContain('<p class="a b">A paragraph.</p>')
	})

	it('applies chained IALs after an inline element', async () => {
		const html = await compileMd('Some *em*{:.a}{:.b} text.\n')
		expect(html).toContain('<em class="a b">em</em>')
	})

	it('consumes same-line extras after an own-line IAL without applying them', async () => {
		const html = await compileMd('A paragraph.\n{:.a} {:.b}\n')
		expect(html).toContain('<p class="a">A paragraph.</p>')
		expect(html).not.toContain('{:')
	})

	it('leaves no residue when consuming orphan stacked IALs', async () => {
		const html = await compileMd('A paragraph.\n\n{:.a}\n{:.b}\n')
		expect(html).toContain('<p>A paragraph.</p>')
		expect(html).not.toContain('class=')
		expect(html).not.toContain('{:')
	})

	it('consumes same-line and mid-text IALs without applying them', async () => {
		const html = await compileMd('Same line.{:.nope} and mid {:.also-nope} text.\n')
		expect(html).not.toContain('{:')
		expect(html).not.toContain('nope')
	})

	it('consumes orphan IAL paragraphs separated by blank lines', async () => {
		const html = await compileMd('A block.\n\n\n\n{:.orphan}\n')
		expect(html).not.toContain('{:')
		expect(html).not.toContain('orphan')
	})

	it('leaves invalid attribute lists as literal text', async () => {
		const html = await compileMd('Keep {:key=unquoted} as text.\n')
		expect(html).toContain('{:key=unquoted}')
	})
})

describe('satteri attributes in MDX', () => {
	it('applies image attributes through the escape + plugin round trip', async () => {
		const code = await compileMdx('![alt](./x.jpg){:data-zoom="true"}\n')
		expect(code).toContain('"data-zoom": "true"')
		expect(code).not.toContain('{:')
	})

	it('feeds attribute-list props into img element overrides', async () => {
		const code = await compileMdx('![alt](./x.jpg){:srcDark="./dark.jpg"}\n', {
			attributes: true,
			elements: {
				img: {
					autoImport: [
						'src',
						{ from: 'src', to: 'srcDark', transform: (path) => path.replace('.jpg', '-x.jpg') },
					],
					component: 'Picture',
					componentModule: 'astro:assets',
				},
			},
		})

		// The explicit {:srcDark} attribute takes priority over the derived transform
		expect(code).toMatch(ASSET_IMPORT_DARK_REGEX)
		expect(code).toMatch(SRC_DARK_ATTRIBUTE_REGEX)
	})

	it('restores unescaped source in rawMdx frontmatter injection', async () => {
		const source = 'A paragraph.\n{:.highlight}\n'
		const data: Record<string, unknown> = {}
		await mdxToJs(escapeMdxAttributeLists(source), {
			data,
			jsxImportSource: 'astro',
			mdastPlugins: satteriMdxKit({ attributes: true, rawMdx: true }),
		})

		const astro = data.astro as { frontmatter: Record<string, unknown> }
		expect(astro.frontmatter.rawMdx).toBe(source)
	})
})
