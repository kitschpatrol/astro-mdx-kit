import type { Root } from 'mdast'
import { describe, expect, it } from 'vitest'
import { ImportTracker, isImportablePath } from '../src/utils/imports'

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

describe('isImportablePath', () => {
	it('rejects URLs with protocol', () => {
		expect(isImportablePath('https://example.com/img.png')).toBe(false)
		expect(isImportablePath('http://cdn.example.com/img.png')).toBe(false)
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
