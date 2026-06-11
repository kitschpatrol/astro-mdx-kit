/* eslint-disable ts/consistent-type-assertions -- mock Astro hook params cannot satisfy full type */
/* eslint-disable ts/no-empty-function */
/* eslint-disable ts/no-unsafe-type-assertion -- mock Astro hook params require type widening */

import { unified } from '@astrojs/markdown-remark'
import { describe, expect, it } from 'vitest'
import mdxKit from '../src/integration'

const noop = () => {}

const existingPlugin = () => {}

/**
 * Build a minimal mock of the `astro:config:setup` hook params. Only
 * `config.markdown.processor` and `logger` are exercised by our integration.
 */
function createMockHookParams(processor: unknown, onWarn: (message: string) => void = noop) {
	return {
		addClientDirective: noop,
		addDevToolbarApp: noop,
		addMiddleware: noop,
		addRenderer: noop,
		addWatchFile: noop,
		command: 'build' as const,
		config: { markdown: { processor } },
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
			warn: onWarn,
		},
		updateConfig: noop,
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

	it('registers remark plugins on the unified processor', () => {
		const integration = mdxKit({
			directives: Object.fromEntries([['Block', 'src/components/Block.astro']]),
			elements: { h1: 'src/components/Heading.astro' },
		})

		const processor = unified()
		void integration.hooks['astro:config:setup']!(createMockHookParams(processor))

		// RemarkDirective + [remarkMdxKitPlugin, options]
		expect(processor.options.remarkPlugins.length).toBe(2)
	})

	it('appends to plugins already configured on the processor', () => {
		const processor = unified({ remarkPlugins: [existingPlugin] })

		const integration = mdxKit({
			elements: { h1: 'src/Heading.astro' },
		})
		void integration.hooks['astro:config:setup']!(createMockHookParams(processor))

		expect(processor.options.remarkPlugins.length).toBe(2)
		expect(processor.options.remarkPlugins[0]).toBe(existingPlugin)
	})

	it('skips directives plugins when no directives configured', () => {
		const integration = mdxKit({
			elements: { h1: 'src/Heading.astro' },
		})

		const processor = unified()
		void integration.hooks['astro:config:setup']!(createMockHookParams(processor))

		expect(processor.options.remarkPlugins.length).toBe(1)
	})

	it('warns and registers nothing on a non-unified processor', () => {
		const integration = mdxKit({
			elements: { h1: 'src/Heading.astro' },
		})

		const processor = {
			name: 'satteri',
			options: {},
		}
		const warnings: string[] = []
		const parameters = createMockHookParams(processor, (message) => {
			warnings.push(message)
		})

		expect(() => {
			void integration.hooks['astro:config:setup']!(parameters)
		}).not.toThrow()
		expect(warnings.length).toBe(1)
		expect(warnings[0]).toContain('satteri')
		expect(processor.options).toEqual({})
	})
})
