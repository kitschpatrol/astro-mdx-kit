/* eslint-disable ts/consistent-type-assertions -- mock Astro hook params cannot satisfy full type */
/* eslint-disable ts/no-empty-function */
/* eslint-disable ts/no-unsafe-type-assertion -- mock Astro hook params require type widening */

import { describe, expect, it } from 'vitest'
import mdxKit from '../src/integration'

const noop = () => {}

/**
 * Build a minimal mock of the `astro:config:setup` hook params.
 * Only `updateConfig` and `logger` are exercised by our integration.
 */
function createMockHookParams(onUpdate: (config: Record<string, unknown>) => void) {
	return {
		addClientDirective: noop,
		addDevToolbarApp: noop,
		addMiddleware: noop,
		addRenderer: noop,
		addWatchFile: noop,
		command: 'build' as const,
		config: {},
		createCodegenDir: () => new URL('file:///'),
		injectRoute: noop,
		injectScript: noop,
		isRestart: false,
		logger: {
			debug: noop,
			error: noop,
			fork: noop,
			info: noop,
			label: 'test',
			options: noop,
			warn: noop,
		},
		updateConfig: onUpdate,
	} as never
}

describe('mdxKit integration', () => {
	it('returns an AstroIntegration with correct name', () => {
		const integration = mdxKit({})
		expect(integration.name).toBe('astro-mdx-kit')
		expect(integration.hooks).toBeDefined()
		expect(integration.hooks['astro:config:setup']).toBeTypeOf('function')
	})

	it('accepts empty options', () => {
		const integration = mdxKit()
		expect(integration.name).toBe('astro-mdx-kit')
	})

	it('registers remark plugins via updateConfig', () => {
		const integration = mdxKit({
			directives: Object.fromEntries([['Block', 'src/components/Block.astro']]),
			elements: { h1: 'src/components/Heading.astro' },
		})

		let updatedConfig: Record<string, unknown> | undefined
		const parameters = createMockHookParams((config) => {
			updatedConfig = config
		})

		void integration.hooks['astro:config:setup']!(parameters)

		expect(updatedConfig).toBeDefined()
		expect(updatedConfig).toHaveProperty('markdown')
		const markdown = updatedConfig!.markdown as Record<string, unknown>
		expect(markdown).toHaveProperty('remarkPlugins')
		const plugins = markdown.remarkPlugins as unknown[]
		expect(plugins.length).toBe(3)
	})

	it('skips directives plugins when no directives configured', () => {
		const integration = mdxKit({
			elements: { h1: 'src/Heading.astro' },
		})

		let updatedConfig: Record<string, unknown> | undefined
		const parameters = createMockHookParams((config) => {
			updatedConfig = config
		})

		void integration.hooks['astro:config:setup']!(parameters)

		const markdown = updatedConfig!.markdown as Record<string, unknown>
		const plugins = markdown.remarkPlugins as unknown[]
		expect(plugins.length).toBe(1)
	})
})
