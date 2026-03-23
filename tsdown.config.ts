import { defineConfig } from 'tsdown'

export default defineConfig({
	attw: {
		profile: 'esm-only',
	},
	deps: {
		neverBundle: ['astro'],
	},
	dts: true,
	fixedExtension: false,
	platform: 'neutral',
	publint: true,
	tsconfig: 'tsconfig.build.json',
})
