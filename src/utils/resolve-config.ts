import type { AutoImportConfig, ComponentConfig } from '../types.js'

export type ResolvedAutoImport = {
	fromProp: string
	toProp: string
}

export type ResolvedComponentConfig = {
	autoImport?: ResolvedAutoImport
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

/**
 * Resolve a user-facing `ComponentConfig` into an internal
 * `ResolvedComponentConfig` with a stable component name and import path.
 * @param name - The directive name or element name from the config key.
 * @param config - The user-provided component configuration.
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

	const autoImport = config.autoImport ? resolveAutoImport(config.autoImport) : undefined

	if (config.componentModule) {
		return {
			autoImport,
			componentName: config.component,
			importPath: config.componentModule,
			isNamedImport: true,
		}
	}

	return {
		autoImport,
		componentName: `_MdxKit_${toPascalCase(name)}`,
		importPath: resolveImportPath(config.component),
		isNamedImport: false,
	}
}
