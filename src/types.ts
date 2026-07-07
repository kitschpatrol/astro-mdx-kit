/**
 * HTML element names that standard Markdown syntax (CommonMark + GFM)
 * generates.
 *
 * Defined locally instead of reusing Astro's `HTMLTag` type because `astro` is
 * an optional peer dependency — the `./remark` entry point works in non-Astro
 * unified pipelines where astro types aren't available.
 *
 * MDX content can also contain arbitrary HTML elements and custom web
 * components, which are accepted via the `string` fallback in
 * {@link MdxKitOptions.elements} keys.
 */
export type MarkdownElementName =
	| 'a'
	| 'blockquote'
	| 'br'
	| 'code'
	| 'del'
	| 'em'
	| 'h1'
	| 'h2'
	| 'h3'
	| 'h4'
	| 'h5'
	| 'h6'
	| 'hr'
	| 'img'
	| 'input'
	| 'li'
	| 'ol'
	| 'p'
	| 'pre'
	| 'section'
	| 'strong'
	| 'sup'
	| 'table'
	| 'tbody'
	| 'td'
	| 'th'
	| 'thead'
	| 'tr'
	| 'ul'

/**
 * A single auto-import entry describing how a prop value should be imported as
 * an ESM module.
 *
 * - `string`: The prop name whose value should be imported (e.g., `'src'`). The
 *   imported module replaces the string value on the same prop.
 * - `{ from, to }`: Read the value from `from` prop, import it, and set the
 *   imported module on the `to` prop.
 * - `{ from, to, transform }`: Like `{ from, to }`, but the path is transformed
 *   before importing. Return `undefined` from `transform` to skip the import.
 *   Useful for deriving additional imports (e.g., dark mode variants).
 */
export type AutoImportEntry =
	| string
	| {
			/** Prop name to read the import path from (e.g., `'src'`). */
			from: string
			/** Prop name to set the imported module on (e.g., `'srcDark'`). */
			to: string
			/**
			 * Transform the import path before generating the import. Return
			 * `undefined` to skip.
			 */
			transform?: (path: string) => string | undefined
	  }

/**
 * Configuration for auto-importing prop values as ESM modules.
 *
 * A single entry or an array of entries. The first entry is the primary import;
 * subsequent entries can derive additional imports from the same source path.
 *
 * @example
 * 	// Simple: import the `src` prop value
 * 	autoImport: 'src'
 *
 * 	// With derived dark variant for .tldr files
 * 	autoImport: [
 * 		'src',
 * 		{
 * 			from: 'src',
 * 			to: 'srcDark',
 * 			transform: (p) =>
 * 				p.endsWith('.tldr') ? `${p}?dark=true&tldr` : undefined,
 * 		},
 * 	]
 */
export type AutoImportConfig = AutoImportEntry | AutoImportEntry[]

/**
 * Configuration for passing a caption as a serialized string prop.
 */
export type CaptionPropConfig = {
	/**
	 * Serialization format for the caption text.
	 *
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
 * Configuration for extracting a directive's `[label]` / `[content]` into a
 * named prop.
 *
 * - `string`: Extract as plain text and pass as that prop name. `label: 'title'`
 *   → `<Component title="Label text" />`
 * - `{ prop, format? }`: Extract with a specific serialization format.
 *
 * Works for all directive types:
 *
 * - Container (`:::Name[label]`): extracts the label paragraph, preserves body
 *   children.
 * - Leaf (`::Name[content]`) and text (`:Name[content]`): extracts the content,
 *   clears children.
 *
 * Without this option, `[label]`/`[content]` stays in the component's children
 * (the default behavior per the directives spec). If no `[label]`/`[content]`
 * is present in the markdown, this option has no effect.
 *
 * @example
 * 	directives: {
 * 	Callout: {
 * 	component: 'src/components/Callout.astro',
 * 	label: 'title',
 * 	// or: label: { prop: 'title', format: 'rendered' },
 * 	},
 * 	}
 */
export type LabelConfig = CaptionPropConfig | string

/**
 * Detailed configuration for mapping a directive to a component.
 */
export type DetailedComponentConfig = {
	/** Auto-import a prop's value as a module (e.g., for image paths). */
	autoImport?: AutoImportConfig
	/** Component name (for named exports) or file path (for default exports). */
	component: string
	/**
	 * Module to import the component from (e.g., `'astro:assets'`). When set,
	 * `component` is treated as a named export.
	 */
	componentModule?: string
	/**
	 * Extract the directive's `[label]` / `[content]` and pass it as a named
	 * prop.
	 *
	 * @see {@link LabelConfig}
	 */
	label?: LabelConfig
	/**
	 * Rename directive attributes before passing them as component props. Keys
	 * are the directive attribute names, values are the target prop names.
	 * Unmapped attributes pass through as-is. The original attribute name is
	 * dropped.
	 *
	 * @example
	 * 	// ::Block{icon="star" type="warning"}
	 * 	// → <Block iconName="star" variant="warning" />
	 * 	propMap: { icon: 'iconName', type: 'variant' }
	 */
	propMap?: Record<string, string>
}

/**
 * Detailed configuration for mapping an HTML element to a component. Extends
 * directive config with element-specific options like `caption`.
 */
export type DetailedElementConfig = DetailedComponentConfig & {
	/**
	 * Caption handling for image elements. Only applies to `img` element
	 * overrides.
	 *
	 * @see {@link CaptionConfig}
	 */
	caption?: CaptionConfig
}

/**
 * Configuration for mapping a directive to a component.
 *
 * - `string`: A file path for default import (e.g.,
 *   `'src/components/block.astro'`).
 * - `DetailedComponentConfig`: Full configuration with optional module and
 *   auto-import.
 */
export type ComponentConfig = DetailedComponentConfig | string

/**
 * Configuration for mapping an HTML element to a component.
 *
 * - `string`: A file path for default import.
 * - `DetailedElementConfig`: Full configuration with optional module,
 *   auto-import, and caption.
 */
export type ElementConfig = DetailedElementConfig | string

/**
 * Options for the astro-mdx-kit integration.
 */
export type MdxKitOptions = {
	/**
	 * Enable markdown-it / Pandoc-style attribute syntax for markdown elements.
	 *
	 * Allows attaching attributes to block and inline elements using
	 * `\{key="value"\}`, `\{.class\}`, `\{#id\}` syntax. The braces must be
	 * backslash-escaped — unescaped braces are MDX expressions. Uses
	 * `remark-attributes` under the hood (in `mdx` mode).
	 *
	 * Only supported on the unified processor (`unified()` from
	 * `@astrojs/markdown-remark`) — Sätteri's parser has no custom syntax
	 * extensions, so on the (default) Sätteri processor this option logs a
	 * warning and is ignored.
	 *
	 * Compatible with directive syntax — both can be used simultaneously.
	 *
	 * @example
	 * 	![Alt](./image.jpg)\{data-lightbox="true"\}
	 * 	A paragraph\{.highlight\}
	 *
	 * @default false
	 */
	attributes?: boolean
	/**
	 * Wrap images that have adjacent caption text in `<figure>/<figcaption>`.
	 *
	 * When an image is followed by text in the same paragraph (`![alt](src)
	 * Caption text`), the paragraph is replaced with a `<figure>` containing the
	 * original image and a `<figcaption>`.
	 *
	 * The original MDAST image node is preserved inside the figure, so Astro's
	 * built-in image optimization still applies.
	 *
	 * If an `img` element override also has its own `caption` config, the element
	 * override takes precedence (it transforms the image first).
	 *
	 * @default false
	 */
	captionImages?: boolean
	/**
	 * Map directive names to components.
	 *
	 * Directives use the standard markdown directive syntax (remark-directive):
	 *
	 * - Container: `:::Name[label]{props}...content...:::`
	 * - Leaf: `::Name[label]{props}`
	 * - Text/Inline: `:Name[label]{props}`
	 *
	 * The directive type (container/leaf/text) is determined automatically by how
	 * the user writes it in markdown. No need to specify the type.
	 */
	directives?: Record<string, ComponentConfig>
	/**
	 * Map HTML element names to components.
	 *
	 * Simple overrides use MDX's `export const components` mechanism. Overrides
	 * with `autoImport` use direct AST transformation.
	 *
	 * @example
	 * 	elements: {
	 * 	h1: 'src/components/CustomHeading.astro',
	 * 	img: {
	 * 	autoImport: 'src',
	 * 	component: 'Picture',
	 * 	componentModule: 'astro:assets',
	 * 	},
	 * 	}
	 */
	elements?: Partial<Record<MarkdownElementName | (string & {}), ElementConfig>>
	/**
	 * Inject the MDAST (Markdown Abstract Syntax Tree) into frontmatter.
	 *
	 * The tree reflects the state **after** astro-mdx-kit transforms (directives
	 * → JSX, element overrides) but **before** rehype/MDX compilation. Read-only
	 * — modifying it will not affect rendered output.
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
	 * In standard markdown, `![alt](src)` on its own line produces `<p><img
	 * ...></p>`. When enabled, the paragraph wrapper is removed so the image (or
	 * its component override) is a direct child of the document flow.
	 *
	 * Runs **after** element overrides, so it also unwraps images that have been
	 * replaced by custom components (e.g. `<Picture>`).
	 *
	 * @default false
	 */
	unwrapImages?: boolean
	/**
	 * Remove `<p>` elements nested inside HTML elements that only allow phrasing
	 * content per the HTML spec.
	 *
	 * In MDX, writing block content inside elements like `<span>`, `<button>`, or
	 * `<label>` causes Markdown to wrap the text in `<p>` tags, producing invalid
	 * HTML (e.g. `<span><p>text</p></span>`). When enabled, the `<p>` is replaced
	 * with its children so the content is valid.
	 *
	 * Only targets elements that cannot contain `<p>` per the HTML spec — no risk
	 * of altering valid HTML. Runs as a remark transform on the MDAST tree, after
	 * element overrides.
	 *
	 * @default false
	 */
	unwrapPhrasingContent?: boolean
}
