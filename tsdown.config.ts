import { defineConfig } from 'tsdown'

export default defineConfig({
	attw: {
		profile: 'esm-only',
	},
	dts: true,
	fixedExtension: false,
	platform: 'neutral',
	publint: true,
	tsconfig: 'tsconfig.build.json',
})
