import { describe, expect, it } from 'vitest'
import { resolveComponentConfig } from '../src/utils/resolve-config'

describe('resolveComponentConfig', () => {
	it('resolves a simple string path', () => {
		const result = resolveComponentConfig('Block', 'src/components/block.astro')
		expect(result).toEqual({
			componentName: '_MdxKit_Block',
			importPath: '/src/components/block.astro',
			isNamedImport: false,
		})
	})

	it('converts kebab-case path to PascalCase component name', () => {
		const result = resolveComponentConfig(
			'block-with-children',
			'src/components/block-with-children.astro',
		)
		expect(result.componentName).toBe('_MdxKit_BlockWithChildren')
	})

	it('preserves leading / in paths', () => {
		const result = resolveComponentConfig('Foo', '/src/components/Foo.astro')
		expect(result.importPath).toBe('/src/components/Foo.astro')
	})

	it('preserves relative paths', () => {
		const result = resolveComponentConfig('Foo', './components/Foo.astro')
		expect(result.importPath).toBe('./components/Foo.astro')
	})

	it('preserves @ alias paths', () => {
		const result = resolveComponentConfig('Foo', '@/components/Foo.astro')
		expect(result.importPath).toBe('@/components/Foo.astro')
	})

	it('preserves ~ alias paths', () => {
		const result = resolveComponentConfig('Foo', '~/components/Foo.astro')
		expect(result.importPath).toBe('~/components/Foo.astro')
	})

	it('resolves detailed config with componentModule (named import)', () => {
		const result = resolveComponentConfig('Picture', {
			autoImport: 'src',
			component: 'Picture',
			componentModule: 'astro:assets',
		})
		expect(result).toEqual({
			autoImport: { fromProp: 'src', toProp: 'src' },
			componentName: 'Picture',
			importPath: 'astro:assets',
			isNamedImport: true,
		})
	})

	it('resolves detailed config without componentModule (default import)', () => {
		const result = resolveComponentConfig('Image', {
			autoImport: 'source',
			component: 'src/components/custom-image',
		})
		expect(result).toEqual({
			autoImport: { fromProp: 'source', toProp: 'source' },
			componentName: '_MdxKit_Image',
			importPath: '/src/components/custom-image',
			isNamedImport: false,
		})
	})

	it('resolves autoImport with from/to mapping', () => {
		const result = resolveComponentConfig('Image', {
			autoImport: { from: 'source', to: 'sourceImported' },
			component: 'src/components/image',
		})
		expect(result.autoImport).toEqual({
			fromProp: 'source',
			toProp: 'sourceImported',
		})
	})

	it('resolves detailed config without autoImport', () => {
		const result = resolveComponentConfig('Heading', {
			component: 'src/components/heading.astro',
		})
		expect(result).toEqual({
			componentName: '_MdxKit_Heading',
			importPath: '/src/components/heading.astro',
			isNamedImport: false,
		})
	})
})
