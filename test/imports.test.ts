import type { Root } from 'mdast'
import type { MdxJsxAttribute } from 'mdast-util-mdx-jsx'
import { describe, expect, it } from 'vitest'
import type { ResolvedAutoImportEntry } from '../src/utils/resolve-config'
import { ImportTracker, isImportablePath, resolveAutoImportAttributes } from '../src/utils/imports'

function makeTree(): Root {
	return { children: [], type: 'root' }
}

describe('ImportTracker', () => {
	it('deduplicates component imports', () => {
		const tracker = new ImportTracker()
		tracker.addComponentImport('Foo', '/src/Foo.astro', false)
		tracker.addComponentImport('Foo', '/src/Foo.astro', false) // Duplicate

		const tree = makeTree()
		tracker.injectIntoTree(tree)
		expect(tree.children).toHaveLength(1)
	})

	it('deduplicates asset imports and returns same identifier', () => {
		const tracker = new ImportTracker()
		const id1 = tracker.addAssetImport('./image.png')
		const id2 = tracker.addAssetImport('./image.png')
		expect(id1).toBe(id2)

		const tree = makeTree()
		tracker.injectIntoTree(tree)
		expect(tree.children).toHaveLength(1)
	})

	it('generates unique identifiers for different assets', () => {
		const tracker = new ImportTracker()
		const id1 = tracker.addAssetImport('./a.png')
		const id2 = tracker.addAssetImport('./b.png')
		expect(id1).not.toBe(id2)
	})

	it('does not inject if no imports were added', () => {
		const tracker = new ImportTracker()
		const tree = makeTree()
		tracker.injectIntoTree(tree)
		expect(tree.children).toHaveLength(0)
	})

	it('injects both component and asset imports', () => {
		const tracker = new ImportTracker()
		tracker.addComponentImport('Picture', 'astro:assets', true)
		tracker.addAssetImport('./hero.png')
		tracker.addAssetImport('./logo.png')

		const tree = makeTree()
		tracker.injectIntoTree(tree)
		expect(tree.children).toHaveLength(3)
	})
})

function findAttribute(attributes: MdxJsxAttribute[], name: string): MdxJsxAttribute | undefined {
	return attributes.find((a) => a.name === name)
}

function isExpressionAttribute(attribute: MdxJsxAttribute): boolean {
	return (
		typeof attribute.value === 'object' &&
		attribute.value?.type === 'mdxJsxAttributeValueExpression'
	)
}

describe('resolveAutoImportAttributes', () => {
	it('imports a single direct entry from propValues', () => {
		const imports = new ImportTracker()
		const entries: ResolvedAutoImportEntry[] = [{ fromProp: 'src', toProp: 'src' }]
		const { attributes, handledProps } = resolveAutoImportAttributes(
			{ src: './photo.png' },
			entries,
			imports,
		)

		expect(attributes).toHaveLength(1)
		expect(findAttribute(attributes, 'src')).toBeDefined()
		expect(isExpressionAttribute(findAttribute(attributes, 'src')!)).toBe(true)
		expect(handledProps.has('src')).toBe(true)
	})

	it('falls back to string for non-importable paths', () => {
		const imports = new ImportTracker()
		const entries: ResolvedAutoImportEntry[] = [{ fromProp: 'src', toProp: 'src' }]
		const { attributes } = resolveAutoImportAttributes(
			{ src: 'https://example.com/img.png' },
			entries,
			imports,
		)

		expect(attributes).toHaveLength(1)
		expect(findAttribute(attributes, 'src')!.value).toBe('https://example.com/img.png')
	})

	it('skips entries whose fromProp is not in propValues', () => {
		const imports = new ImportTracker()
		const entries: ResolvedAutoImportEntry[] = [{ fromProp: 'srcDark', toProp: 'srcDark' }]
		const { attributes, handledProps } = resolveAutoImportAttributes(
			{ src: './photo.png' },
			entries,
			imports,
		)

		expect(attributes).toHaveLength(0)
		expect(handledProps.size).toBe(0)
	})

	it('resolves multiple direct entries from different propValues keys', () => {
		const imports = new ImportTracker()
		const entries: ResolvedAutoImportEntry[] = [
			{ fromProp: 'src', toProp: 'src' },
			{ fromProp: 'srcDark', toProp: 'srcDark' },
		]
		const { attributes, handledProps } = resolveAutoImportAttributes(
			{ src: './light.png', srcDark: './dark.png' },
			entries,
			imports,
		)

		expect(attributes).toHaveLength(2)
		expect(isExpressionAttribute(findAttribute(attributes, 'src')!)).toBe(true)
		expect(isExpressionAttribute(findAttribute(attributes, 'srcDark')!)).toBe(true)
		expect(handledProps).toEqual(new Set(['src', 'srcDark']))

		// Verify they reference different imports
		const tree = makeTree()
		imports.injectIntoTree(tree)
		expect(tree.children).toHaveLength(2)
	})

	it('preserves original string when fromProp !== toProp and value is importable', () => {
		const imports = new ImportTracker()
		const entries: ResolvedAutoImportEntry[] = [{ fromProp: 'src', toProp: 'imageSrc' }]
		const { attributes, handledProps } = resolveAutoImportAttributes(
			{ src: './photo.png' },
			entries,
			imports,
		)

		// Should have: imageSrc={imported} and src="./photo.png"
		expect(attributes).toHaveLength(2)
		expect(isExpressionAttribute(findAttribute(attributes, 'imageSrc')!)).toBe(true)
		expect(findAttribute(attributes, 'src')!.value).toBe('./photo.png')
		expect(handledProps).toEqual(new Set(['imageSrc', 'src']))
	})

	it('processes derived entries via transform', () => {
		const imports = new ImportTracker()
		const entries: ResolvedAutoImportEntry[] = [
			{ fromProp: 'src', toProp: 'src' },
			{
				fromProp: 'src',
				toProp: 'srcDark',
				transform: (path) => `${path}?dark=true`,
			},
		]
		const { attributes } = resolveAutoImportAttributes({ src: './diagram.tldr' }, entries, imports)

		expect(attributes).toHaveLength(2)
		expect(isExpressionAttribute(findAttribute(attributes, 'src')!)).toBe(true)
		expect(isExpressionAttribute(findAttribute(attributes, 'srcDark')!)).toBe(true)
	})

	it('skips derived entries when transform returns undefined', () => {
		const imports = new ImportTracker()
		const entries: ResolvedAutoImportEntry[] = [
			{ fromProp: 'src', toProp: 'src' },
			{
				fromProp: 'src',
				toProp: 'srcDark',
				// eslint-disable-next-line unicorn/no-useless-undefined -- testing explicit undefined return from transform
				transform: () => undefined,
			},
		]
		const { attributes } = resolveAutoImportAttributes({ src: './photo.png' }, entries, imports)

		expect(attributes).toHaveLength(1)
		expect(findAttribute(attributes, 'srcDark')).toBeUndefined()
	})

	it('direct entry takes priority over derived entry for same toProp', () => {
		const imports = new ImportTracker()
		const entries: ResolvedAutoImportEntry[] = [
			{ fromProp: 'srcDark', toProp: 'srcDark' },
			{
				fromProp: 'src',
				toProp: 'srcDark',
				transform: (path) => `${path}?dark=true`,
			},
		]
		const { attributes } = resolveAutoImportAttributes(
			{ src: './photo.png', srcDark: './explicit-dark.png' },
			entries,
			imports,
		)

		// Direct entry should win — srcDark imports ./explicit-dark.png, not ./photo.png?dark=true
		const srcDark = findAttribute(attributes, 'srcDark')
		expect(srcDark).toBeDefined()
		expect(isExpressionAttribute(srcDark!)).toBe(true)

		const tree = makeTree()
		imports.injectIntoTree(tree)
		// Should import ./explicit-dark.png, NOT ./photo.png?dark=true
		const importValues = tree.children.map((c) => ('value' in c ? c.value : ''))
		expect(importValues.some((v) => v.includes('explicit-dark.png'))).toBe(true)
		expect(importValues.some((v) => v.includes('dark=true'))).toBe(false)
	})

	it('explicit propValues override derived transform when no direct entry exists', () => {
		const imports = new ImportTracker()
		const entries: ResolvedAutoImportEntry[] = [
			{ fromProp: 'src', toProp: 'src' },
			{
				fromProp: 'src',
				toProp: 'srcDark',
				transform: (path) => `${path}?dark=true`,
			},
		]
		// PropValues has an explicit srcDark (e.g. from hProperties), even though
		// there's no direct 'srcDark' entry — it should override the transform.
		const { attributes } = resolveAutoImportAttributes(
			{ src: './diagram.tldr', srcDark: './explicit-dark.png' },
			entries,
			imports,
		)

		const srcDark = findAttribute(attributes, 'srcDark')
		expect(srcDark).toBeDefined()
		expect(isExpressionAttribute(srcDark!)).toBe(true)

		const tree = makeTree()
		imports.injectIntoTree(tree)
		const importValues = tree.children.map((c) => ('value' in c ? c.value : ''))
		expect(importValues.some((v) => v.includes('explicit-dark.png'))).toBe(true)
		expect(importValues.some((v) => v.includes('dark=true'))).toBe(false)
	})

	it('returns empty result for empty propValues', () => {
		const imports = new ImportTracker()
		const entries: ResolvedAutoImportEntry[] = [{ fromProp: 'src', toProp: 'src' }]
		const { attributes, handledProps } = resolveAutoImportAttributes({}, entries, imports)

		expect(attributes).toHaveLength(0)
		expect(handledProps.size).toBe(0)
	})

	it('returns empty result for empty entries', () => {
		const imports = new ImportTracker()
		const { attributes, handledProps } = resolveAutoImportAttributes(
			{ src: './photo.png' },
			[],
			imports,
		)

		expect(attributes).toHaveLength(0)
		expect(handledProps.size).toBe(0)
	})
})

describe('isImportablePath', () => {
	it('rejects URLs with protocol', () => {
		expect(isImportablePath('https://example.com/img.png')).toBe(false)
		expect(isImportablePath('https://cdn.example.com/img.png')).toBe(false)
	})

	it('rejects data URIs', () => {
		expect(isImportablePath('data:image/png;base64,abc')).toBe(false)
	})

	it('rejects fragment-only values', () => {
		expect(isImportablePath('#section')).toBe(false)
	})

	it('accepts relative paths', () => {
		expect(isImportablePath('./image.png')).toBe(true)
		expect(isImportablePath('../assets/hero.jpg')).toBe(true)
	})

	it('accepts root-relative paths', () => {
		expect(isImportablePath('/src/assets/image.png')).toBe(true)
	})

	it('accepts alias paths', () => {
		expect(isImportablePath('@/assets/image.png')).toBe(true)
		expect(isImportablePath('~/assets/image.png')).toBe(true)
	})

	it('accepts bare file names', () => {
		expect(isImportablePath('image.png')).toBe(true)
	})
})
