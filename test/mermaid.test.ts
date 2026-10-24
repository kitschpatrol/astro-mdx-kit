import { toHtml } from 'hast-util-to-html'
import { toHast } from 'mdast-util-to-hast'
import remarkParse from 'remark-parse'
import { markdownToHtml, mdxToJs } from 'satteri'
import { unified } from 'unified'
import { describe, expect, it } from 'vitest'
import type { MdxKitOptions } from '../src/types'
import { remarkMdxKitMermaid } from '../src/plugins/remark-mermaid'
import remarkMdxKitPlugin from '../src/remark-plugin'
import { satteriMdxKit } from '../src/satteri-plugin'

const DIAGRAM = '```mermaid\nflowchart LR\n accTitle: Test diagram\n A[Start] --> B[Done]\n```\n'
const ID_REGEX = /\sid="([^"]+)"/gv

const renderers = {
	async satteri(source: string, options: MdxKitOptions) {
		const result = await markdownToHtml(source, {
			mdastPlugins: satteriMdxKit(options),
		})
		return result.html
	},
	async unified(source: string, options: MdxKitOptions) {
		const processor = unified().use(remarkParse).use(remarkMdxKitPlugin, options)
		const tree = await processor.run(processor.parse(source), source)
		return toHtml(toHast(tree))
	},
}

for (const [name, render] of Object.entries(renderers)) {
	describe(`${name} Mermaid rendering`, () => {
		it.each([undefined, false])(
			'leaves code blocks unchanged when mermaid is %s',
			async (mermaid) => {
				const html = await render(DIAGRAM, { mermaid })
				expect(html).toContain('<pre><code class="language-mermaid">')
				expect(html).not.toContain('<svg')
			},
		)

		it('renders diagrams as themeable SVG without a script', async () => {
			const html = await render(DIAGRAM, { mermaid: true })
			expect(html).toContain('<div class="mermaid"><svg')
			expect(html).toContain('pele pele-flowchart')
			expect(html).toContain('--pele-fg')
			expect(html).toContain('Start</text>')
			expect(html).not.toContain('<pre>')
			expect(html).not.toContain('<script')
		})

		it('passes render options to Pele', async () => {
			const html = await render(DIAGRAM, { mermaid: { fontSize: 22, responsive: false } })
			expect(html).toContain('font:22px sans-serif')
			expect(html).not.toContain('max-width:100%')
		})

		it('adapts Starlight colors without rewriting CSS-like diagram labels', async () => {
			const source = '```mermaid\nflowchart LR\n A["var(--pele-fg,#123456)"] --> B\n```'
			const html = await render(source, { mermaid: true })
			expect(html).toContain('var(--pele-fg,var(--sl-color-text,#1f1f1f))')
			expect(html).toContain('var(--pele-line,var(--sl-color-gray-1,#1f1f1f))')
			expect(html).toContain('var(--pele-fg,#123456)</text>')
		})

		it('renders nested diagrams and preserves other code', async () => {
			const source = [
				'> ```mermaid title="A sequence"',
				'> sequenceDiagram',
				'> Alice->>Bob: Hello',
				'> ```',
				'',
				'```js',
				'const answer = 42',
				'```',
				'',
				'Inline `flowchart LR`.',
			].join('\n')
			const html = await render(source, { mermaid: true })
			expect(html).toContain('<blockquote>')
			expect(html).toContain('pele-sequence')
			expect(html).toContain('<pre><code class="language-js">const answer = 42')
			expect(html).toContain('<code>flowchart LR</code>')
		})

		it('assigns distinct, deterministic SVG IDs to identical diagrams', async () => {
			const source = `${DIAGRAM}\n${DIAGRAM}`
			const html = await render(source, { mermaid: true })
			const ids = Array.from(html.matchAll(ID_REGEX), (match) => match[1])
			expect(ids.length).toBeGreaterThan(0)
			expect(new Set(ids).size).toBe(ids.length)
			expect(await render(source, { mermaid: true })).toBe(html)
		})

		it('preserves diagrams in tight lists', async () => {
			const source = '- ```mermaid\n  flowchart LR\n    A-->B\n  ```\n'
			const html = await render(source, { mermaid: true })
			expect(html).toContain('<li>\n<div class="mermaid"><svg')
			expect(html).toContain('pele-flowchart')
		})

		it('fails with a source location for invalid diagrams', async () => {
			await expect(
				render('Intro\n\n```mermaid\nnot a diagram\n```', { mermaid: true }),
			).rejects.toThrow('Failed to render Mermaid diagram at document:3:')
		})

		it('enforces configured rendering limits', async () => {
			await expect(render(DIAGRAM, { mermaid: { limit: 5 } })).rejects.toThrow(
				'Failed to render Mermaid diagram',
			)
		})
	})
}

describe('Mermaid pipeline compatibility', () => {
	it('works as a standalone remark plugin', async () => {
		const processor = unified().use(remarkParse).use(remarkMdxKitMermaid)
		const tree = await processor.run(processor.parse(DIAGRAM), DIAGRAM)
		expect(toHtml(toHast(tree))).toContain('pele-flowchart')
	})

	it('compiles SVG styles and literal labels in Sätteri MDX', async () => {
		const result = await mdxToJs('```mermaid\nflowchart LR\n A["{value} & text"] --> B\n```', {
			jsxImportSource: 'astro',
			mdastPlugins: satteriMdxKit({ mermaid: true }),
		})
		expect(result.code).toContain('pele pele-flowchart')
		expect(result.code).toContain('"{value} & text"')
		expect(result.code).toContain('"--_fg": "var(--pele-fg,var(--sl-color-text,#1f1f1f))"')
		expect(result.code).not.toContain('language-mermaid')
	})

	it('scopes Sätteri state to each compilation when plugins are reused concurrently', async () => {
		const mdastPlugins = satteriMdxKit({ mermaid: true })
		const results = await Promise.all([
			markdownToHtml(DIAGRAM, { mdastPlugins }),
			markdownToHtml(DIAGRAM, { mdastPlugins }),
		])
		expect(results[0].html).toBe(results[1].html)
	})

	it('includes the file path in rendering errors', () => {
		const processor = unified().use(remarkParse).use(remarkMdxKitPlugin, { mermaid: true })
		const file = { path: '/docs/diagram.mdx', value: '```mermaid\ninvalid\n```' }
		expect(() => processor.runSync(processor.parse(file), file)).toThrow(
			'Failed to render Mermaid diagram at /docs/diagram.mdx:1:',
		)
	})
})
