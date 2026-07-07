/* eslint-disable ts/consistent-type-assertions -- mock Astro hook params cannot satisfy full type */
/* eslint-disable ts/no-empty-function */

import { unified } from '@astrojs/markdown-remark'
import { satteri } from '@astrojs/markdown-satteri'
import { afterEach, describe, expect, it, vi } from 'vitest'
import mdxKit from '../src/integration'
import { setLogger } from '../src/log'

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
	afterEach(() => {
		// Reset the injected logger so cross-test state doesn't leak
		setLogger()
	})

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

	it('registers mdast plugins on the satteri processor', () => {
		const integration = mdxKit({
			directives: Object.fromEntries([['Block', 'src/components/Block.astro']]),
			elements: { h1: 'src/components/Heading.astro' },
		})

		const processor = satteri()
		void integration.hooks['astro:config:setup']!(createMockHookParams(processor))

		// Directives plugin + components-export merge and inject passes
		expect(processor.options.mdastPlugins.length).toBe(3)
		expect(processor.options.features.directive).toBe(true)
	})

	it('does not enable the directive feature when no directives are configured', () => {
		const integration = mdxKit({
			elements: { h1: 'src/components/Heading.astro' },
		})

		const processor = satteri()
		void integration.hooks['astro:config:setup']!(createMockHookParams(processor))

		expect(processor.options.mdastPlugins.length).toBe(2)
		expect(processor.options.features.directive).toBeUndefined()
	})

	it('appends to mdast plugins already configured on the satteri processor', () => {
		const existingSatteriPlugin = { name: 'existing' }
		const processor = satteri({ mdastPlugins: [existingSatteriPlugin] })

		const integration = mdxKit({
			elements: { h1: 'src/Heading.astro' },
		})
		void integration.hooks['astro:config:setup']!(createMockHookParams(processor))

		expect(processor.options.mdastPlugins.length).toBe(3)
		expect(processor.options.mdastPlugins[0]).toBe(existingSatteriPlugin)
	})

	it('warns and ignores the attributes option on satteri', () => {
		const sink = {
			debug: vi.fn(),
			error: vi.fn(),
			info: vi.fn(),
			trace: vi.fn(),
			warn: vi.fn(),
		}
		setLogger(sink)

		const integration = mdxKit({
			attributes: true,
			elements: { h1: 'src/Heading.astro' },
		})

		const processor = satteri()
		void integration.hooks['astro:config:setup']!(createMockHookParams(processor))

		expect(sink.warn).toHaveBeenCalledOnce()
		expect(sink.warn.mock.calls[0]?.[0]).toContain('`attributes`')

		// Only the components-export merge and inject passes — no attributes plugin
		expect(processor.options.mdastPlugins.length).toBe(2)
		expect(
			processor.options.mdastPlugins.some((plugin) => plugin.name.includes('attributes')),
		).toBe(false)
	})

	it('warns and registers nothing on an unknown processor', () => {
		const integration = mdxKit({
			elements: { h1: 'src/Heading.astro' },
		})

		const processor = {
			name: 'mystery',
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
		expect(warnings[0]).toContain('mystery')
		expect(processor.options).toEqual({})
	})
})
