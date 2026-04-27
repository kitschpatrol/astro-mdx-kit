<!-- title -->

# astro-mdx-kit

<!-- /title -->

<!-- badges -->

[![NPM Package astro-mdx-kit](https://img.shields.io/npm/v/astro-mdx-kit.svg)](https://npmjs.com/package/astro-mdx-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/kitschpatrol/astro-mdx-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/kitschpatrol/astro-mdx-kit/actions/workflows/ci.yml)

<!-- /badges -->

<!-- short-description -->

**Astro integration for MDX directive-to-component mapping, element overrides, and auto-imports.**

<!-- /short-description -->

## Overview

MDX makes it easy to embed components in your Markdown files, but this can lead to tight coupling between your content and its presentation. The [directives](https://talk.commonmark.org/t/generic-directives-plugins-syntax/444) syntax proposal has been circling the runway in the CommonMark project since 2014. It specifies implementation-agnostic syntax for defining component-like data in your Markdown. It's yet to land, but there's decent support for it in just about every major Markdown toolchain.

So instead of:

```mdx
import Widget from '../components/Widget.astro'

<Widget greeting="hello" />
```

Let's write:

```mdx
::Widget{greeting="hello"}
```

And then, with some help from `astro-mdx-kit`, easily map `::Widget` to its Astro implementation _outside_ your Markdown:

```ts
mdxKit({
  directives: {
    Widget: 'src/components/Widget.astro',
  },
})
```

It's not necessarily pretty, but it _is_ comparatively decoupled and portable.

In addition to support for mapping directives to, `astro-mdx-kit` bundles some additional tools I end up needing most of the time:

- **Directives**\
  Map Markdown directive syntax (`:name`, `::name`, `:::name`) to Astro components.
- **Element overrides**\
  Replace HTML elements (`h1`, `img`, etc.) with custom Astro components.
- **Auto-imports**\
  Automatically import components and assets (like images) without manual `import` statements.
- **Image captions**\
  Extract caption text adjacent to images and wrap in `<figure>/<figcaption>` or pass to components.
- **Attribute lists**\
  Kramdown-style `{:key="value"}` syntax for adding attributes to any Markdown element.
- **Image unwrapping**\
  Remove `<p>` wrappers from stand-alone images.
- **Phrasing unwrapping**\
  Remove invalid `<p>` elements nested inside phrasing-only HTML elements like `<span>`, `<button>`, and `<label>`.
- **Frontmatter injection**\
  Expose raw MDX source or the parsed AST tree in frontmatter.

Available as an Astro integration, a standalone remark plugin, or as individual sub-plugins for use in any unified pipeline.

Astro's architecture (currently) means that this syntax still must live in a `.mdx` file instead of `.md`, but it still helps the long term portability your Markdown content to use platform-agnostic syntax like directives instead of importing and marking up concrete components.

## Getting started

### Prerequisites

We'll assume you have an [Astro](https://astro.build/) project set up.

You will also need [`@astrojs/mdx`](https://docs.astro.build/it/guides/integrations-guide/mdx/) (or a framework that includes it, like [Starlight](https://starlight.astro.build/)) for MDX file processing.

### Installation

```bash
pnpm add astro-mdx-kit @astrojs/mdx
```

### Basic setup

The simplest way to use `astro-mdx-kit` is as an Astro integration:

```ts
// Astro.config.ts
import mdx from '@astrojs/mdx'
import mdxKit from 'astro-mdx-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
  integrations: [
    mdxKit({
      // All options are optional — only enable what you need
      attributes: true,
      captionImages: true,
      directives: {
        // Replace `::Widget` directives
        // with `Widget.astro` component
        Widget: 'src/components/Widget.astro',
      },
      elements: {
        // Customize `# Heading` elements
        h1: 'src/components/Heading.astro',
      },
      unwrapImages: true,
    }),
    mdx(),
  ],
})
```

### Alternative: remark plugin

For direct control over the remark plugin pipeline, use `remarkMdxKit` which returns a typed `[plugin, options]` tuple with full autocomplete on the options object:

```ts
// Astro.config.ts
import mdx from '@astrojs/mdx'
import { remarkMdxKit } from 'astro-mdx-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
  integrations: [mdx()],
  markdown: {
    remarkPlugins: [
      remarkMdxKit({
        directives: {
          /* ... */
        },
        elements: {
          /* ... */
        },
      }),
    ],
  },
})
```

The raw remark plugin is also available via `astro-mdx-kit/remark` for direct use in [unified](https://unifiedjs.com/) pipelines:

```ts
import remarkMdxKitPlugin from 'astro-mdx-kit/remark'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

unified().use(remarkParse).use(remarkMdxKitPlugin, options)
```

### Individual sub-plugins

Each feature is also available as a standalone remark plugin:

```ts
import {
  remarkMdxKitAttributes, // Markdown or MDX
  remarkMdxKitCaptionImages, // Markdown or MDX
  remarkMdxKitDirectives, // MDX + Astro
  remarkMdxKitElements, // MDX + Astro
  remarkMdxKitFrontmatterInject, // Markdown or MDX + Astro
  remarkMdxKitUnwrapImages, // Markdown or MDX
  remarkMdxKitUnwrapPhrasingContent, // MDX
} from 'astro-mdx-kit'
```

## Features

### Directives

Map [remark-directive](https://github.com/remarkjs/remark-directive) syntax to Astro components. All three directive forms (container, leaf, text) are supported — the type is determined automatically by how you write it in Markdown. The directive parser extensions are registered automatically; no need to install or configure `remark-directive` separately.

```ts
mdxKit({
  directives: {
    // With auto-import: image paths are imported as modules
    Picture: {
      autoImport: 'src',
      component: 'Picture',
      componentModule: 'astro:assets',
    },
    // Simple: map directive name to a component file
    Widget: 'src/components/Widget.astro',
  },
})
```

**Markdown:**

```md
::Widget{icon="star"}

:::Widget{type="warning"}
Content inside the directive.
:::

::Picture{src="../assets/hero.png" alt="Hero image"}
```

**What happens:**

- `::Widget{icon="star"}` becomes `<Widget icon="star" />`
- The component is automatically imported — no manual `import` needed
- With `autoImport: 'src'`, the `src` prop value is converted to an ESM import so Vite can process the asset

#### Prop remapping

Use `propMap` to rename directive attributes before they become component props. The original attribute name is dropped.

```ts
mdxKit({
  directives: {
    Widget: {
      component: 'src/components/Widget.astro',
      propMap: { icon: 'iconName', type: 'variant' },
    },
  },
})
```

`::Widget{icon="star" type="warning"}` becomes `<Widget iconName="star" variant="warning" />`. Unmapped attributes pass through as-is.

#### Label extraction

Directives support a `[label]` syntax (e.g., `:::Callout[Warning Title]` or `::Tag[content]`). By default, this content is included in the component's children, which is consistent with the directives specification. In certain cases, it can make more sense for this content to end up elsewhere in the receiving component. Use the `label` option to extract it into a named prop instead:

```ts
mdxKit({
  directives: {
    Callout: {
      component: 'src/components/Callout.astro',
      label: 'title',
    },
  },
})
```

**Markdown:**

```md
:::Callout[Watch out!]
Something important.
:::
```

**Output:** `<Callout title="Watch out!">Something important.</Callout>`

The label is removed from children and serialized as plain text by default. For richer formatting, use the object form:

```text
label: { prop: 'title', format: 'rendered' }
```

| Format       | Output                                       |
| ------------ | -------------------------------------------- |
| `'plain'`    | `title="Watch out!"` (default)               |
| `'raw'`      | `title="**Watch** out!"` (raw Markdown)      |
| `'rendered'` | `title="<strong>Watch</strong> out!"` (HTML) |

Label extraction works for all directive types:

- **Container** (`:::Name[label]`): The `[label]` paragraph is extracted from children and serialized as a prop. Body content is preserved.
- **Leaf** (`::Name[content]`): The `[content]` is serialized as a prop and removed from children.
- **Text** (`:Name[content]`): Same as leaf — `[content]` becomes a prop.

Without the `label` config, all directive types preserve their default behavior (content stays in children). If no `[label]` / `[content]` is present in the markdown, the option has no effect.

### Element overrides

Replace standard HTML elements rendered by Markdown with custom Astro components.

```ts
mdxKit({
  elements: {
    // Simple: override heading rendering
    h1: 'src/components/Heading.astro',
    // With auto-import: override images with Astro's Picture component
    img: {
      autoImport: 'src',
      component: 'Picture',
      componentModule: 'astro:assets',
    },
  },
})
```

- **Simple overrides** (like `h1`) use MDX's `export const components` mechanism, covering both Markdown syntax and raw HTML/JSX
- **Auto-import overrides** (like `img`) use direct AST transformation so that asset paths are converted to ESM imports for Vite processing

Element keys aren't limited to standard HTML element names — you can use any JSX tag name, including PascalCase custom components. This lets you auto-import components that use MDX-style markup without an explicit `import` statement in each file:

```ts
mdxKit({
  elements: {
    Excerpt: 'src/components/Excerpt.astro',
  },
})
```

Now `<Excerpt />` works in any MDX file without importing it. Note that the [directives syntax](#directives) (e.g. `::Excerpt`) is generally preferred for portability, since directives degrade gracefully in non-MDX Markdown renderers while JSX tags do not.

#### Auto-import prop remapping

When the source attribute name differs from the target prop name, use the `{ from, to }` form:

```ts
mdxKit({
  elements: {
    img: {
      autoImport: { from: 'src', to: 'srcImported' },
      component: 'src/components/CustomImage.astro',
    },
  },
})
```

This produces `<CustomImage srcImported={importedModule} src="../original/path.jpg" />` — the imported module on the `to` prop, with the original string preserved on the `from` prop.

#### Derived imports

`autoImport` accepts an array of entries to generate multiple imports from a single source path. Each entry can include a `transform` function that modifies the path before importing. If `transform` returns `undefined`, the derived import is skipped.

This is a bit of an edge case, but useful in cases where you want to pass multiple imported values to your component, such as generating both light and dark mode assets from the [unplugin-tldraw](https://github.com/kitschpatrol/unplugin-tldraw) package as illustrated below:

```ts
mdxKit({
  elements: {
    img: {
      autoImport: [
        // Primary import: import the src path as-is
        'src',
        // Derived import: generate a dark variant for .tldr files
        // Expects a srcDark prop on the receiving component...
        {
          from: 'src',
          to: 'srcDark',
          transform: (path) => (path.endsWith('.tldr') ? `${path}?dark=true&tldr` : undefined),
        },
      ],
      component: 'Picture',
      componentModule: 'astro-media-kit/components',
    },
  },
})
```

When `![Alt](./sketch.tldr)` is processed, this generates:

```jsx
import _img0 from './sketch.tldr'
import _img1 from './sketch.tldr?dark=true&tldr'
;<Picture alt="Alt" src={_img0} srcDark={_img1} />
```

For non-`.tldr` images, the `transform` returns `undefined` and the `srcDark` prop is omitted.

This also works on directives:

```ts
mdxKit({
  directives: {
    Picture: {
      autoImport: ['src', { from: 'src', to: 'srcDark', transform: myTransform }],
      component: 'Picture',
      componentModule: 'astro-media-kit/components',
    },
  },
})
```

##### tldraw preset

A ready-to-use derived import entry for `.tldr` dark mode is available as a preset:

```ts
import mdxKit, { tldrawDarkImport } from 'astro-mdx-kit'

mdxKit({
  elements: {
    img: {
      autoImport: ['src', tldrawDarkImport],
      component: 'Picture',
      componentModule: 'astro-media-kit/components',
    },
  },
})
```

This requires [`@kitschpatrol/unplugin-tldraw`](https://github.com/kitschpatrol/unplugin-tldraw) to be configured in your build pipeline (e.g. via `astro-media-kit`'s `tldraw: true` integration option).

##### Astro image presets

Pre-configured element overrides for Astro's built-in `<Image>` and `<Picture>` components are available as presets:

```ts
import mdxKit, { astroImage } from 'astro-mdx-kit'

mdxKit({
  elements: { img: astroImage },
})
```

```ts
import mdxKit, { astroPicture } from 'astro-mdx-kit'

mdxKit({
  elements: { img: astroPicture },
})
```

Both presets configure `autoImport: 'src'` with the corresponding component from `astro:assets`.

### Image captions

Extract text that follows an image in the same paragraph and handle it as a caption.

#### Global captions

Wrap all captioned images in `<figure>/<figcaption>`:

```ts
mdxKit({
  captionImages: true,
})
```

**Markdown:**

```md
![Alt text](./photo.jpg)
A beautiful place out in the country.
```

**Output:**

```html
<figure>
  <img src="..." alt="Alt text" />
  <figcaption>A beautiful place out in the country.</figcaption>
</figure>
```

The original image node is preserved, so Astro's built-in image optimization still applies.

_Note that the `<p>` wrapper is always removed when adding a caption, regardless of whether the `unwrapImages` option is set._

#### Per-element captions

When using an `img` element override (for example), configure caption handling on the element config:

```ts
mdxKit({
  elements: {
    img: {
      autoImport: 'src',
      // Wrap in <figure>/<figcaption>
      caption: 'figure',
      component: 'src/components/FancyImage.astro',
      // Or pass caption as children of the component:
      // caption: 'children',
      // Or serialize and pass as a string prop:
      // caption: { prop: 'caption' },
      // caption: { prop: 'caption', format: 'raw' },
      // caption: { prop: 'caption', format: 'rendered' },
    },
  },
})
```

**Caption modes:**

| Mode                                      | Output                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `'figure'`                                | `<figure><Picture .../><figcaption>Caption</figcaption></figure>`       |
| `'children'`                              | `<Picture ...>Caption</Picture>`                                        |
| `{ prop: 'caption' }`                     | `<Picture ... caption="Caption text" />` (plain text)                   |
| `{ prop: 'caption', format: 'raw' }`      | `<Picture ... caption="**Bold** caption" />` (raw Markdown)             |
| `{ prop: 'caption', format: 'rendered' }` | `<Picture ... caption="<p><strong>Bold</strong> caption</p>" />` (HTML) |

If both `captionImages` (global) and per-element `caption` are set, the element override takes precedence for overridden images.

This might seem a bit fussy, but it can be useful for handling the caption content differently in your custom component.

### Attribute lists

Enable [Kramdown-style attribute list syntax](https://github.com/utelecon/remark-attribute-list) for adding attributes to Markdown elements:

```ts
mdxKit({
  attributes: true,
})
```

**Markdown:**

```md
A paragraph with a class.
{:.highlight}

[A link](https://example.com){:target="\_blank" rel="noopener"}

![Image](./photo.jpg){:data-lightbox="true"}
```

**Syntax rules:**

- **Block elements** (headings, paragraphs, blockquotes): attributes go on the **next line** after the element
- **Inline elements** (links, emphasis, images): attributes go **directly after** on the same line
- ID: `{:#my-id}`, class: `{:.my-class}`, arbitrary: `{:key="value"}`

Attribute lists work with element overrides — when a Markdown element is replaced by a custom component via the `elements` option, any attributes set via `{:key="value"}` are forwarded as props to the component. For simple overrides, attributes flow through MDX's component mechanism automatically. For auto-import overrides (like `img`), attributes are forwarded to the final component during AST transformation.

Compatible with directive syntax — both can be used simultaneously in the same file, but using both directive and attribute list syntax on the same element is redundant and not supported.

### Unwrap images

Remove the `<p>` wrapper that Markdown adds around stand-alone images:

```ts
mdxKit({
  unwrapImages: true,
})
```

By default, `![alt](src)` on its own line produces `<p><img ...></p>`. With `unwrapImages: true`, the paragraph is removed so the image is a direct child of the document flow. Works with both native images and component overrides (`img`, `Image`, and `Picture` are recognized by default). When using `remarkMdxKitUnwrapImages` as a standalone plugin, pass `imageComponentNames` to customize which JSX element names are treated as images.

### Unwrap phrasing

Remove `<p>` elements that Markdown incorrectly nests inside HTML elements that only allow phrasing content:

```ts
mdxKit({
  unwrapPhrasingContent: true,
})
```

In MDX, writing block content inside elements like `<span>` or `<button>` causes Markdown to wrap the text in `<p>` tags, producing invalid HTML:

```mdx
<span>Some text</span>

<!-- Produces: <span><p>Some text</p></span> — invalid! -->
```

With `unwrapPhrasingContent: true`, the `<p>` is replaced with its children, producing valid `<span>Some text</span>`.

This targets all elements that cannot contain `<p>` per the HTML spec: `span`, `em`, `strong`, `small`, `s`, `cite`, `q`, `dfn`, `abbr`, `code`, `var`, `samp`, `kbd`, `sub`, `sup`, `i`, `b`, `u`, `mark`, `bdi`, `bdo`, `data`, `time`, `ruby`, `button`, `label`, and `output`. Elements with flow content models like `<div>` and `<a>` (transparent) are not affected.

### Frontmatter injection

Expose the raw MDX source or the parsed AST tree in frontmatter. Useful for debugging or in layouts and components:

```ts
mdxKit({
  // Inject the MDAST tree as frontmatter.mdast
  mdast: true,
  // Or use a custom key:
  // rawMdx: 'source',
  // Inject raw source as frontmatter.rawMdx
  rawMdx: true,
  // Or use a custom key:
  // mdast: 'tree',
})
```

- **`rawMdx`** captures the original file content **before** any transforms
- **`mdast`** captures the AST **after** astro-mdx-kit transforms but before rehype/MDX compilation
- Both use `??=` so they won't overwrite existing frontmatter values

### Logging

`astro-mdx-kit` uses [lognow](https://github.com/kitschpatrol/lognow) for logging. You can inject your own logger:

```ts
import { setLogger } from 'astro-mdx-kit'

setLogger(console)
```

## Processing order

The plugin processes content in two phases:

**Parse phase** (before transforms):

1. **Directive parser** — registers `:::`/`::`/`:` syntax extensions
2. **Attribute lists** — applies `{:...}` attributes to nodes

**Transform phase** (in order):

1. **Raw MDX injection** — captures original source
2. **Directive transforms** — converts directives to JSX components
3. **Element overrides** — replaces HTML elements with components (per-element captions handled here)
4. **Global image captions** — wraps remaining captioned images in `<figure>`
5. **Unwrap phrasing** — removes `<p>` from inside phrasing-only elements
6. **Unwrap images** — removes `<p>` from stand-alone images
7. **MDAST injection** — captures the transformed tree

## Full configuration example

```ts
// Astro.config.ts
import mdx from '@astrojs/mdx'
import mdxKit, { tldrawDarkImport } from 'astro-mdx-kit'
import { defineConfig } from 'astro/config'

export default defineConfig({
  integrations: [
    mdxKit({
      attributes: true,
      captionImages: true,
      directives: {
        Callout: {
          component: 'src/components/Callout.astro',
          label: 'title',
          propMap: { type: 'variant' },
        },
        Picture: {
          autoImport: 'src',
          component: 'Picture',
          componentModule: 'astro:assets',
        },
      },
      elements: {
        h1: 'src/components/Heading.astro',
        img: {
          autoImport: ['src', tldrawDarkImport],
          caption: 'figure',
          component: 'Picture',
          componentModule: 'astro-media-kit/components',
        },
      },
      mdast: true,
      rawMdx: true,
      unwrapImages: true,
      unwrapPhrasingContent: true,
    }),
    mdx(),
  ],
})
```

## MDX VS Code Plugin Integration

If you are working in VS Code with MDX files, you'll need to handle some additional configuration to help the [VS Code MDX extension](https://marketplace.visualstudio.com/items?itemName=unifiedjs.vscode-mdx) understand the non-standard attribute and directive syntax.

_Note: If you're using [@kitschpatrol/shared-config](https://www.npmjs.com/package/@kitschpatrol/shared-config) or are building from a [@kitschpatrol/create-project](https://www.npmjs.com/package/@kitschpatrol/create-project) template, skip to step 3._

1. Install remark plugin dependencies:

   ```sh
   pnpm install -D remark-attribute-list remark-directive
   ```

   These dependencies must be hoisted to be discoverable by the VS Code plugin.

2. Create or update a `.remarkrc.js` in your project root:

   ```js
   // .remarkrc.js
   import remarkAttributeList from 'remark-attribute-list'
   import remarkDirective from 'remark-directive'

   export default {
     plugins: [remarkAttributeList, remarkDirective],
   }
   ```

3. Add the remark plugins to a `mdx` field in your `tsconfig.json`:

   ```jsonc
   // tsconfig.json
   {
     "compilerOptions": {
       // ...
     },
     "mdx": {
       "plugins": ["remark-directive", "remark-attribute-list"],
     },
   }
   ```

## Maintainers

[kitschpatrol](https://github.com/kitschpatrol)

## Acknowledgments

This project was heavily inspired by [Christian Fuss'](https://github.com/christian-hackyourshack) [m2dx](https://astro-m2dx.netlify.app/) project and [tomixy's](https://tomixyz-biography.net/) [astro-mdx-directive](https://github.com/tetracalibers/astro-mdx-directive).

Though I didn't find it until after developing `astro-mdx-kit`, [Florian's](https://flo-bit.dev/) [astro-custom-embeds](https://github.com/flo-bit/astro-custom-embeds) looks great and it looks like we both arrived at similar approaches to configuration API.

Gratitude is always due to the [unified](https://unifiedjs.com) [team](https://github.com/unifiedjs/collective/?tab=readme-ov-file#unified-team) for [remark](https://remark.js.org) and their entire ecosystem of AST-wrangling libraries and tools.

<!-- contributing -->

## Contributing

[Issues](https://github.com/kitschpatrol/astro-mdx-kit/issues) are welcome and appreciated.

Please open an issue to discuss changes before submitting a pull request. Unsolicited PRs (especially AI-generated ones) are unlikely to be merged.

This repository uses [@kitschpatrol/shared-config](https://github.com/kitschpatrol/shared-config) (via its `ksc` CLI) for linting and formatting, plus [MDAT](https://github.com/kitschpatrol/mdat) for readme placeholder expansion.

<!-- /contributing -->

<!-- license -->

## License

[MIT](license.txt) © [Eric Mika](https://ericmika.com)

<!-- /license -->
