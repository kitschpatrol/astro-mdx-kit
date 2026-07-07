import { describe, expect, it, vi } from 'vitest'
import { log } from '../src/log'
import { resolveComponentConfig, resolveElementConfig } from '../src/utils/resolve-config'

const CAPTION_IMG_ONLY_REGEX = /caption.*only apply to.*img/v
const EMPTY_AUTO_IMPORT_REGEX = /empty.*autoImport/v
const LABEL_DIRECTIVES_ONLY_REGEX = /label.*only apply to.*directives/v

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
			autoImports: [{ fromProp: 'src', toProp: 'src' }],
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
			autoImports: [{ fromProp: 'source', toProp: 'source' }],
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
		expect(result.autoImports).toEqual([
			{
				fromProp: 'source',
				toProp: 'sourceImported',
			},
		])
	})

	it('resolves autoImport array with transform entry', () => {
		// eslint-disable-next-line unicorn/consistent-function-scoping
		const transform = (path: string) => (path.endsWith('.tldr') ? `${path}?dark=true` : undefined)
		const result = resolveComponentConfig('Picture', {
			autoImport: ['src', { from: 'src', to: 'srcDark', transform }],
			component: 'Picture',
			componentModule: 'astro:assets',
		})
		expect(result.autoImports).toHaveLength(2)
		expect(result.autoImports![0]).toEqual({ fromProp: 'src', toProp: 'src' })
		expect(result.autoImports![1]).toMatchObject({ fromProp: 'src', toProp: 'srcDark' })
		expect(result.autoImports![1]!.transform).toBe(transform)
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

	it('does not include caption on directive configs', () => {
		const result = resolveComponentConfig('MyDirective', {
			autoImport: 'src',
			component: 'Picture',
			componentModule: 'astro:assets',
		})
		expect(result.caption).toBeUndefined()
	})
})

describe('resolveElementConfig', () => {
	it('resolves caption config', () => {
		const result = resolveElementConfig('img', {
			autoImport: 'src',
			caption: 'figure',
			component: 'Picture',
			componentModule: 'astro:assets',
		})
		expect(result.caption).toBe('figure')
	})

	it('resolves caption prop config with format', () => {
		const result = resolveElementConfig('img', {
			autoImport: 'src',
			caption: { format: 'rendered', prop: 'caption' },
			component: 'src/components/Image.astro',
		})
		expect(result.caption).toEqual({ format: 'rendered', prop: 'caption' })
	})

	it('resolves element config without caption', () => {
		const result = resolveElementConfig('h1', 'src/components/Heading.astro')
		expect(result.caption).toBeUndefined()
		expect(result.componentName).toBe('_MdxKit_H1')
	})

	it('warns when caption is set on a non-img element', () => {
		const spy = vi.spyOn(log, 'warn')
		resolveElementConfig('h1', {
			caption: 'figure',
			component: 'src/components/Heading.astro',
		})
		expect(spy).toHaveBeenCalledOnce()
		expect(spy.mock.calls[0]![0]).toMatch(CAPTION_IMG_ONLY_REGEX)
		spy.mockRestore()
	})

	it('does not warn when caption is set on img', () => {
		const spy = vi.spyOn(log, 'warn')
		resolveElementConfig('img', {
			autoImport: 'src',
			caption: 'figure',
			component: 'Picture',
			componentModule: 'astro:assets',
		})
		expect(spy).not.toHaveBeenCalled()
		spy.mockRestore()
	})
})

describe('config validation warnings', () => {
	it('warns on empty autoImport array', () => {
		const spy = vi.spyOn(log, 'warn')
		resolveComponentConfig('Picture', {
			autoImport: [],
			component: 'Picture',
			componentModule: 'astro:assets',
		})
		expect(spy).toHaveBeenCalledOnce()
		expect(spy.mock.calls[0]![0]).toMatch(EMPTY_AUTO_IMPORT_REGEX)
		spy.mockRestore()
	})

	it('warns when label is set on an element override', () => {
		const spy = vi.spyOn(log, 'warn')
		resolveElementConfig('h1', {
			component: 'src/components/Heading.astro',
			label: 'title',
		})
		expect(spy).toHaveBeenCalledOnce()
		expect(spy.mock.calls[0]![0]).toMatch(LABEL_DIRECTIVES_ONLY_REGEX)
		spy.mockRestore()
	})
})

describe('label config resolution', () => {
	it('resolves string shorthand to plain format', () => {
		const result = resolveComponentConfig('Note', {
			component: 'src/components/Note.astro',
			label: 'title',
		})
		expect(result.label).toEqual({ format: 'plain', prop: 'title' })
	})

	it('resolves object with explicit format', () => {
		const result = resolveComponentConfig('Note', {
			component: 'src/components/Note.astro',
			label: { format: 'rendered', prop: 'heading' },
		})
		expect(result.label).toEqual({ format: 'rendered', prop: 'heading' })
	})

	it('defaults format to plain when not specified', () => {
		const result = resolveComponentConfig('Note', {
			component: 'src/components/Note.astro',
			label: { prop: 'heading' },
		})
		expect(result.label).toEqual({ format: 'plain', prop: 'heading' })
	})

	it('passes through propMap as-is', () => {
		const result = resolveComponentConfig('Block', {
			component: 'src/components/Block.astro',
			propMap: { icon: 'iconName', type: 'variant' },
		})
		expect(result.propMap).toEqual({ icon: 'iconName', type: 'variant' })
	})
})
