import { defineConfig } from 'tsdown'

export default defineConfig({
	attw: {
		profile: 'esm-only',
	},
	deps: {
		neverBundle: ['astro'],
	},
	dts: true,
	entry: ['src/index.ts', 'src/remark-plugin.ts', 'src/satteri-plugin.ts'],
	fixedExtension: false,
	platform: 'neutral',
	publint: true,
	tsconfig: 'tsconfig.build.json',
})
