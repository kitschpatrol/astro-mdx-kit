/* eslint-disable ts/no-empty-function */
/* eslint-disable ts/naming-convention */

import { describe, expect, it } from 'vitest'
import { mdxKit } from '../src/integration'

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
			directives: {
				Block: 'src/components/Block.astro',
			},
			elements: {
				h1: 'src/components/Heading.astro',
			},
		})

		let updatedConfig: Record<string, unknown> | undefined
		const mockHookParams = {
			addClientDirective() {},
			addDevToolbarApp() {},
			addMiddleware() {},
			addRenderer() {},
			addWatchFile() {},
			command: 'build' as const,
			config: {},
			createCodegenDir: () => new URL('file:///'),
			injectRoute() {},
			injectScript() {},
			isRestart: false,
			logger: {
				debug() {},
				error() {},
				fork: () => ({ debug() {}, error() {}, info() {}, warn() {} }),
				info() {},
				label: 'test',
				options: () => ({}),
				warn() {},
			},
			updateConfig(config: Record<string, unknown>) {
				updatedConfig = config
			},
		}

		// eslint-disable-next-line ts/no-unsafe-type-assertion
		void integration.hooks['astro:config:setup']!(mockHookParams as never)

		expect(updatedConfig).toBeDefined()
		// eslint-disable-next-line ts/no-unsafe-type-assertion
		const markdown = updatedConfig!.markdown as { remarkPlugins: unknown[] }
		expect(markdown.remarkPlugins).toBeDefined()
		// Should have: remarkDirective, [remarkMdxKitDirectives, opts], [remarkMdxKitElements, opts]
		expect(markdown.remarkPlugins.length).toBe(3)
	})

	it('skips directives plugins when no directives configured', () => {
		const integration = mdxKit({
			elements: { h1: 'src/Heading.astro' },
		})

		let updatedConfig: Record<string, unknown> | undefined
		const mockHookParams = {
			addClientDirective() {},
			addDevToolbarApp() {},
			addMiddleware() {},
			addRenderer() {},
			addWatchFile() {},
			command: 'build' as const,
			config: {},
			createCodegenDir: () => new URL('file:///'),
			injectRoute() {},
			injectScript() {},
			isRestart: false,
			logger: {
				debug() {},
				error() {},
				fork: () => ({ debug() {}, error() {}, info() {}, warn() {} }),
				info() {},
				label: 'test',
				options: () => ({}),
				warn() {},
			},
			updateConfig(config: Record<string, unknown>) {
				updatedConfig = config
			},
		}

		// eslint-disable-next-line ts/no-unsafe-type-assertion
		void integration.hooks['astro:config:setup']!(mockHookParams as never)

		// eslint-disable-next-line ts/no-unsafe-type-assertion
		const markdown = updatedConfig!.markdown as { remarkPlugins: unknown[] }
		// Only the elements plugin, no remarkDirective or directive transform
		expect(markdown.remarkPlugins.length).toBe(1)
	})
})
