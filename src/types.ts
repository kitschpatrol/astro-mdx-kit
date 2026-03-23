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
 * Configuration for passing a caption as a serialized string prop.
 */
export type CaptionPropConfig = {
	/**
	 * Serialization format for the caption text.
	 * - `'plain'` (default) — plain text, formatting stripped
	 * - `'raw'` — raw markdown string
	 * - `'rendered'` — rendered HTML string
	 */
	format?: 'plain' | 'raw' | 'rendered'
	/** The prop name to receive the caption string. */
	prop: string
}

/**
 * Caption handling mode for image elements.
 *
 * Controls what happens to text that follows an image in the same paragraph
 * (e.g. `![alt](src) Caption text`).
 *
 * - `'figure'` — wrap image + caption in `<figure>/<figcaption>`
 * - `'children'` — pass caption AST nodes as children of the image component
 * - `{ prop, format? }` — serialize caption and pass as a named string prop
 */
export type CaptionConfig = 'children' | 'figure' | CaptionPropConfig

/**
 * Detailed configuration for mapping a directive to a component.
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
 * Detailed configuration for mapping an HTML element to a component.
 * Extends directive config with element-specific options like `caption`.
 */
export type DetailedElementConfig = DetailedComponentConfig & {
	/**
	 * Caption handling for image elements. Only applies to `img` element overrides.
	 * @see {@link CaptionConfig}
	 */
	caption?: CaptionConfig
}

/**
 * Configuration for mapping a directive to a component.
 *
 * - `string`: A file path for default import (e.g., `'src/components/block.astro'`).
 * - `DetailedComponentConfig`: Full configuration with optional module and auto-import.
 */
export type ComponentConfig = DetailedComponentConfig | string

/**
 * Configuration for mapping an HTML element to a component.
 *
 * - `string`: A file path for default import.
 * - `DetailedElementConfig`: Full configuration with optional module, auto-import, and caption.
 */
export type ElementConfig = DetailedElementConfig | string

/**
 * Options for the astro-mdx-kit integration.
 */
export type MdxKitOptions = {
	/**
	 * Wrap images that have adjacent caption text in `<figure>/<figcaption>`.
	 *
	 * When an image is followed by text in the same paragraph
	 * (`![alt](src) Caption text`), the paragraph is replaced with a
	 * `<figure>` containing the original image and a `<figcaption>`.
	 *
	 * The original MDAST image node is preserved inside the figure, so
	 * Astro's built-in image optimization still applies.
	 *
	 * If an `img` element override also has its own `caption` config, the
	 * element override takes precedence (it transforms the image first).
	 * @default false
	 */
	captionImages?: boolean
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
	elements?: Record<string, ElementConfig>
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
	/**
	 * Remove the wrapping `<p>` element from stand-alone images.
	 *
	 * In standard markdown, `![alt](src)` on its own line produces
	 * `<p><img ...></p>`. When enabled, the paragraph wrapper is removed
	 * so the image (or its component override) is a direct child of the
	 * document flow.
	 *
	 * Runs **after** element overrides, so it also unwraps images that
	 * have been replaced by custom components (e.g. `<Picture>`).
	 * @default false
	 */
	unwrapImages?: boolean
}
