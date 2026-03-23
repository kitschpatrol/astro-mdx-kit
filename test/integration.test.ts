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
			updateConfig(config: Record<string, unknown>) {
				updatedConfig = config
			},
			logger: {
				info: () => {},
				warn: () => {},
				error: () => {},
				debug: () => {},
				fork: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
				label: 'test',
				options: () => ({}),
			},
			config: {},
			command: 'build' as const,
			isRestart: false,
			addRenderer: () => {},
			addWatchFile: () => {},
			injectScript: () => {},
			injectRoute: () => {},
			addMiddleware: () => {},
			addClientDirective: () => {},
			createCodegenDir: () => new URL('file:///'),
			addDevToolbarApp: () => {},
		}

		integration.hooks['astro:config:setup']!(mockHookParams as never)

		expect(updatedConfig).toBeDefined()
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
			updateConfig(config: Record<string, unknown>) {
				updatedConfig = config
			},
			logger: {
				info: () => {},
				warn: () => {},
				error: () => {},
				debug: () => {},
				fork: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
				label: 'test',
				options: () => ({}),
			},
			config: {},
			command: 'build' as const,
			isRestart: false,
			addRenderer: () => {},
			addWatchFile: () => {},
			injectScript: () => {},
			injectRoute: () => {},
			addMiddleware: () => {},
			addClientDirective: () => {},
			createCodegenDir: () => new URL('file:///'),
			addDevToolbarApp: () => {},
		}

		integration.hooks['astro:config:setup']!(mockHookParams as never)

		const markdown = updatedConfig!.markdown as { remarkPlugins: unknown[] }
		// Only the elements plugin, no remarkDirective or directive transform
		expect(markdown.remarkPlugins.length).toBe(1)
	})
})
