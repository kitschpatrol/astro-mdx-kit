import { describe, expect, it } from 'vitest'
import { astroImage, astroPicture, tldrawDarkImport } from '../src/presets'

describe('astroImage preset', () => {
	it('configures the Image component from astro:assets with src auto-import', () => {
		expect(astroImage).toEqual({
			autoImport: 'src',
			component: 'Image',
			componentModule: 'astro:assets',
		})
	})
})

describe('astroPicture preset', () => {
	it('configures the Picture component from astro:assets with src auto-import', () => {
		expect(astroPicture).toEqual({
			autoImport: 'src',
			component: 'Picture',
			componentModule: 'astro:assets',
		})
	})
})

describe('tldrawDarkImport preset', () => {
	it('reads from src and writes to srcDark', () => {
		expect(tldrawDarkImport).toMatchObject({ from: 'src', to: 'srcDark' })
		expect(tldrawDarkImport).toHaveProperty('transform')
	})

	it('appends ?dark=true&tldr to a bare .tldr path', () => {
		expect(typeof tldrawDarkImport === 'object' && tldrawDarkImport.transform).toBeTypeOf(
			'function',
		)
		if (typeof tldrawDarkImport === 'object' && tldrawDarkImport.transform) {
			expect(tldrawDarkImport.transform('./sketch.tldr')).toBe('./sketch.tldr?dark=true&tldr')
		}
	})

	it('appends with & when the path already has a query string', () => {
		if (typeof tldrawDarkImport === 'object' && tldrawDarkImport.transform) {
			expect(tldrawDarkImport.transform('./sketch.tldr?foo=1')).toBe(
				'./sketch.tldr?foo=1&dark=true&tldr',
			)
		}
	})

	it('returns undefined for non-.tldr paths', () => {
		if (typeof tldrawDarkImport === 'object' && tldrawDarkImport.transform) {
			expect(tldrawDarkImport.transform('./photo.png')).toBeUndefined()
			expect(tldrawDarkImport.transform('./photo.jpg?width=400')).toBeUndefined()
			expect(tldrawDarkImport.transform('')).toBeUndefined()
		}
	})

	it('only matches the .tldr extension exactly (not substrings)', () => {
		if (typeof tldrawDarkImport === 'object' && tldrawDarkImport.transform) {
			// .tldraw should not match
			expect(tldrawDarkImport.transform('./sketch.tldraw')).toBeUndefined()
			// Uppercase variants are not matched (extension regex is case-sensitive)
			expect(tldrawDarkImport.transform('./sketch.TLDR')).toBeUndefined()
		}
	})
})
