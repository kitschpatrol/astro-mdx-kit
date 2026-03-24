import type {
	AutoImportConfig,
	AutoImportEntry,
	CaptionConfig,
	ComponentConfig,
	ElementConfig,
} from '../types.js'

/**
 * Normalized auto-import entry after resolving shorthand forms.
 */
export type ResolvedAutoImportEntry = {
	/** The prop name to read the import path from (e.g. `'src'`). */
	fromProp: string
	/** The prop name to set the imported module on. Same as `fromProp` when using the shorthand string form. */
	toProp: string
	/** Transform the import path before generating the import. Return `undefined` to skip. */
	transform?: (path: string) => string | undefined
}

/**
 * Fully resolved component configuration used internally by transform functions.
 *
 * Produced by {@link resolveComponentConfig} or {@link resolveElementConfig}
 * from the user-facing {@link ComponentConfig} / {@link ElementConfig} types.
 */
export type ResolvedComponentConfig = {
	/** Auto-import entries for resolving prop values as ESM imports. */
	autoImports?: ResolvedAutoImportEntry[]
	/** Caption handling mode for image element overrides. Only set for `img` elements. */
	caption?: CaptionConfig
	/** The local identifier name used in the generated JSX (e.g. `'Picture'` or `'_MdxKit_Img'`). */
	componentName: string
	/** The resolved ESM import path for the component (e.g. `'/src/components/Foo.astro'` or `'astro:assets'`). */
	importPath: string
	/** Whether the component is a named export (`import { X }`) or a default export (`import X`). */
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

function resolveAutoImportEntry(entry: AutoImportEntry): ResolvedAutoImportEntry {
	if (typeof entry === 'string') {
		return { fromProp: entry, toProp: entry }
	}

	return {
		fromProp: entry.from,
		toProp: entry.to,
		...(entry.transform ? { transform: entry.transform } : {}),
	}
}

function resolveAutoImports(config: AutoImportConfig): ResolvedAutoImportEntry[] {
	const entries = Array.isArray(config) ? config : [config]
	return entries.map((entry) => resolveAutoImportEntry(entry))
}

function resolveDetailed(
	name: string,
	config: {
		autoImport?: AutoImportConfig
		component: string
		componentModule?: string
	},
	caption?: CaptionConfig,
): ResolvedComponentConfig {
	const autoImports = config.autoImport ? resolveAutoImports(config.autoImport) : undefined

	if (config.componentModule) {
		return {
			...(autoImports ? { autoImports } : {}),
			...(caption ? { caption } : {}),
			componentName: config.component,
			importPath: config.componentModule,
			isNamedImport: true,
		}
	}

	return {
		...(autoImports ? { autoImports } : {}),
		...(caption ? { caption } : {}),
		componentName: `_MdxKit_${toPascalCase(name)}`,
		importPath: resolveImportPath(config.component),
		isNamedImport: false,
	}
}

/**
 * Resolve a user-facing {@link ComponentConfig} (string shorthand or
 * detailed object) into a fully normalized {@link ResolvedComponentConfig}.
 *
 * Used for directive mappings. Directives do not support the `caption` option.
 * @param name - The directive name (used to derive a PascalCase component identifier for default imports).
 * @param config - The user-provided component configuration.
 * @returns A resolved config ready for use by the directive transform.
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
 * Resolve a user-facing {@link ElementConfig} (string shorthand or
 * detailed object) into a fully normalized {@link ResolvedComponentConfig}.
 *
 * Used for element override mappings. Unlike directive configs, element
 * configs support the `caption` option (relevant for `img` overrides).
 * @param name - The HTML element name (e.g. `'img'`, `'h1'`).
 * @param config - The user-provided element configuration.
 * @returns A resolved config ready for use by the element transform.
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
