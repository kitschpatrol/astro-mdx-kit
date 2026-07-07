import { defineConfig } from 'vitest/config'

// Resolve production builds of the unified/micromark packages instead of the
// `development` export condition Vitest would otherwise pass to its workers:
// remark-attributes trips micromark's dev-only asserts
// (https://github.com/manuelmeister/remark-attributes/issues/10), and
// production resolution matches what Astro loads in both dev and build.
// Unconditional because Vite has already defaulted NODE_ENV to 'test' by the
// time this config executes.
process.env.NODE_ENV = 'production'

export default defineConfig({
	test: {
		include: ['test/**/*.test.ts'],
	},
})
