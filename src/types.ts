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
export type DetailedComponentConfig = {
	/** Auto-import a prop's value as a module (e.g., for image paths). */
	autoImport?: AutoImportConfig
	/** Component name (for named exports) or file path (for default exports). */
	component: string
	/** Module to import the component from (e.g., `'astro:assets'`). When set, `component` is treated as a named export. */
	componentModule?: string
}

/**
 * Configuration for mapping a directive or element to a component.
 *
 * - `string`: A file path for default import (e.g., `'src/components/block.astro'`).
 * - `DetailedComponentConfig`: Full configuration with optional module and auto-import.
 */
export type ComponentConfig = DetailedComponentConfig | string

/**
 * Options for the astro-mdx-kit integration.
 */
export type MdxKitOptions = {
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
	/**
	 * Inject the MDAST (Markdown Abstract Syntax Tree) into frontmatter.
	 *
	 * The tree reflects the state **after** astro-mdx-kit transforms
	 * (directives → JSX, element overrides) but **before** rehype/MDX
	 * compilation. Read-only — modifying it will not affect rendered output.
	 *
	 * - `false` / `undefined` — disabled (default)
	 * - `true` — inject as `frontmatter.mdast`
	 * - `string` — inject using the given property name
	 */
	mdast?: boolean | string
	/**
	 * Inject the raw MDX source string into frontmatter.
	 *
	 * Captures the original file content **before** any transforms.
	 *
	 * - `false` / `undefined` — disabled (default)
	 * - `true` — inject as `frontmatter.rawMdx`
	 * - `string` — inject using the given property name
	 */
	rawMdx?: boolean | string
}
