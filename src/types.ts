/**
 * Configuration for auto-importing a prop value as a module.
 *
 * - `string`: The prop name whose value should be imported (e.g., `'src'`).
 *   The imported module replaces the string value on the same prop.
 * - `{ from, to }`: Read the value from `from` prop, import it, and set the
 *   imported module on the `to` prop.
 */
export type AutoImportConfig = string | { from: string; to: string }

/**
 * Detailed configuration for a component mapping.
 */
export interface DetailedComponentConfig {
	/** Component name (for named exports) or file path (for default exports). */
	component: string
	/** Module to import the component from (e.g., `'astro:assets'`). When set, `component` is treated as a named export. */
	componentModule?: string
	/** Auto-import a prop's value as a module (e.g., for image paths). */
	autoImport?: AutoImportConfig
}

/**
 * Configuration for mapping a directive or element to a component.
 *
 * - `string`: A file path for default import (e.g., `'src/components/block.astro'`).
 * - `DetailedComponentConfig`: Full configuration with optional module and auto-import.
 */
export type ComponentConfig = string | DetailedComponentConfig

/**
 * Options for the astro-mdx-kit integration.
 */
export interface MdxKitOptions {
	/**
	 * Map directive names to components.
	 *
	 * Directives use the standard markdown directive syntax (remark-directive):
	 * - Container: `:::Name[label]{props}...content...:::`
	 * - Leaf: `::Name[label]{props}`
	 * - Text/Inline: `:Name[label]{props}`
	 *
	 * The directive type (container/leaf/text) is determined automatically
	 * by how the user writes it in markdown. No need to specify the type.
	 */
	directives?: Record<string, ComponentConfig>

	/**
	 * Map HTML element names to components.
	 *
	 * Simple overrides use MDX's `export const components` mechanism.
	 * Overrides with `autoImport` use direct AST transformation.
	 *
	 * @example
	 * ```ts
	 * elements: {
	 *   h1: 'src/components/CustomHeading.astro',
	 *   img: {
	 *     autoImport: 'src',
	 *     component: 'Picture',
	 *     componentModule: 'astro:assets',
	 *   },
	 * }
	 * ```
	 */
	elements?: Record<string, ComponentConfig>
}

