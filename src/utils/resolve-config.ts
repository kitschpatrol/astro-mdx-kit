import type { AutoImportConfig, CaptionConfig, ComponentConfig, ElementConfig } from '../types.js'

export type ResolvedAutoImport = {
	fromProp: string
	toProp: string
}

export type ResolvedComponentConfig = {
	autoImport?: ResolvedAutoImport
	caption?: CaptionConfig
	componentName: string
	importPath: string
	isNamedImport: boolean
}

function toPascalCase(string_: string): string {
	return string_
		.replace(/\.\w+$/, '') // Strip file extension
		.replaceAll(/[-_./\\]+(.)/g, (_, c: string) => c.toUpperCase())
		.replace(/^(.)/, (_, c: string) => c.toUpperCase())
		.replaceAll(/[^\dA-Z]/gi, '')
}

/**
 * Normalize a component path for use in an ESM import statement.
 *
 * - Virtual modules and aliases are passed through as-is.
 * - Bare paths like `src/components/Foo.astro` get a leading `/` so
 *   Vite resolves them from the project root.
 */
function resolveImportPath(path: string): string {
	if (
		path.includes(':') ||
		path.startsWith('/') ||
		path.startsWith('.') ||
		path.startsWith('@') ||
		path.startsWith('~')
	) {
		return path
	}

	return `/${path}`
}

function resolveAutoImport(config: AutoImportConfig): ResolvedAutoImport {
	if (typeof config === 'string') {
		return { fromProp: config, toProp: config }
	}

	return { fromProp: config.from, toProp: config.to }
}

function resolveDetailed(
	name: string,
	config: { autoImport?: AutoImportConfig; component: string; componentModule?: string },
	caption?: CaptionConfig,
): ResolvedComponentConfig {
	const autoImport = config.autoImport ? resolveAutoImport(config.autoImport) : undefined

	if (config.componentModule) {
		// @ts-expect-error - TODO fix type
		return {
			autoImport,
			caption,
			componentName: config.component,
			importPath: config.componentModule,
			isNamedImport: true,
		}
	}

	// @ts-expect-error - TODO Fix type
	return {
		autoImport,
		caption,
		componentName: `_MdxKit_${toPascalCase(name)}`,
		importPath: resolveImportPath(config.component),
		isNamedImport: false,
	}
}

/**
 * Resolve a directive `ComponentConfig` into a `ResolvedComponentConfig`.
 * Directives do not support the `caption` option.
 */
export function resolveComponentConfig(
	name: string,
	config: ComponentConfig,
): ResolvedComponentConfig {
	if (typeof config === 'string') {
		return {
			componentName: `_MdxKit_${toPascalCase(name)}`,
			importPath: resolveImportPath(config),
			isNamedImport: false,
		}
	}

	return resolveDetailed(name, config)
}

/**
 * Resolve an element `ElementConfig` into a `ResolvedComponentConfig`.
 * Elements support the `caption` option (for `img` overrides).
 */
export function resolveElementConfig(name: string, config: ElementConfig): ResolvedComponentConfig {
	if (typeof config === 'string') {
		return {
			componentName: `_MdxKit_${toPascalCase(name)}`,
			importPath: resolveImportPath(config),
			isNamedImport: false,
		}
	}

	return resolveDetailed(name, config, config.caption)
}
