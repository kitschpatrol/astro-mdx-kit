import type { Root } from 'mdast'
import { VFile } from 'vfile'
import { describe, expect, it } from 'vitest'
import { createFrontmatterInjectTransform } from '../src/plugins/remark-frontmatter-inject'

function makeTree(): Root {
	return {
		children: [
			{ children: [{ type: 'text', value: 'Hello' }], depth: 1, type: 'heading' },
			{ children: [{ type: 'text', value: 'World' }], type: 'paragraph' },
		],
		type: 'root',
	}
}

function makeFile(content: string): VFile {
	return new VFile({ path: 'test.mdx', value: content })
}

/* eslint-disable ts/no-unsafe-type-assertion -- accessing untyped Astro frontmatter */
function getFrontmatter(file: VFile): Record<string, unknown> {
	const astro = file.data.astro as Record<string, unknown> | undefined
	const frontmatter = astro?.frontmatter as Record<string, unknown> | undefined
	return frontmatter ?? {}
}
/* eslint-enable ts/no-unsafe-type-assertion */

describe('createFrontmatterInjectTransform', () => {
	it('does nothing when both options are falsy', () => {
		const transform = createFrontmatterInjectTransform({})
		const tree = makeTree()
		const file = makeFile('# Hello\n\nWorld')

		transform(tree, file)

		expect(getFrontmatter(file)).toEqual({})
	})

	it('injects raw MDX with default key when rawMdx is true', () => {
		const transform = createFrontmatterInjectTransform({ rawMdx: true })
		const tree = makeTree()
		const source = '# Hello\n\nWorld'
		const file = makeFile(source)

		transform(tree, file)

		expect(getFrontmatter(file).rawMdx).toBe(source)
	})

	it('injects raw MDX with custom key', () => {
		const transform = createFrontmatterInjectTransform({ rawMdx: 'source' })
		const tree = makeTree()
		const source = '# Test'
		const file = makeFile(source)

		transform(tree, file)

		const frontmatter = getFrontmatter(file)
		expect(frontmatter.source).toBe(source)
		expect(frontmatter.rawMdx).toBeUndefined()
	})

	it('injects MDAST with default key when mdast is true', () => {
		const transform = createFrontmatterInjectTransform({ mdast: true })
		const tree = makeTree()
		const file = makeFile('')

		transform(tree, file)

		const frontmatter = getFrontmatter(file)
		expect(frontmatter.mdast).toBe(tree)
	})

	it('injects MDAST with custom key', () => {
		const transform = createFrontmatterInjectTransform({ mdast: 'tree' })
		const tree = makeTree()
		const file = makeFile('')

		transform(tree, file)

		const frontmatter = getFrontmatter(file)
		expect(frontmatter.tree).toBe(tree)
		expect(frontmatter.mdast).toBeUndefined()
	})

	it('injects both rawMdx and mdast together', () => {
		const transform = createFrontmatterInjectTransform({ mdast: true, rawMdx: true })
		const tree = makeTree()
		const source = '# Both'
		const file = makeFile(source)

		transform(tree, file)

		const frontmatter = getFrontmatter(file)
		expect(frontmatter.rawMdx).toBe(source)
		expect(frontmatter.mdast).toBe(tree)
	})

	it('does not overwrite existing frontmatter values', () => {
		const transform = createFrontmatterInjectTransform({ mdast: true, rawMdx: true })
		const tree = makeTree()
		const file = makeFile('# Test')

		// Pre-populate frontmatter
		file.data.astro = {
			frontmatter: {
				mdast: 'existing-mdast',
				rawMdx: 'existing-rawMdx',
			},
		}

		transform(tree, file)

		const frontmatter = getFrontmatter(file)
		expect(frontmatter.rawMdx).toBe('existing-rawMdx')
		expect(frontmatter.mdast).toBe('existing-mdast')
	})
})
