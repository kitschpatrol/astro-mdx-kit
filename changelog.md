# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.1] - 2026-11-02

### Documentation

- Correct Mermaid theming guidance to explain that Pele applies `themeVariables` colors as series palettes.

### Maintenance

- Refresh runtime requirements for Astro's Markdown processors, Pele, lognow, Markdown/HTML utilities, and tree traversal.
- Refresh development dependencies, shared-config, pnpm, and release and dependency-update actions.
- Simplify npm package file selection and installation scripts, replacing the skills CLI with pnpm's native skills synchronization.

## [0.7.0] - 2026-10-24

### Added

- Add optional build-time Mermaid-to-SVG rendering with Pele for Markdown and MDX on both processors, with render options, deterministic SVG IDs, and source-location errors.
- Export `remarkMdxKitMermaid`, `createMermaidTransform`, `MermaidOptions`, and `MermaidNode` for standalone pipelines.
- Make Mermaid diagrams follow Starlight's active light or dark theme while allowing explicit Pele CSS variables to override automatic colors.

### Documentation

- Document Mermaid configuration, rendering limits, compatibility, standalone use, and theme customization.

### Maintenance

- Refresh development dependencies and pnpm, and build the package and synchronize Astro workspace types during `prepare`.
- Switch dependency-update automation to monthly runs and make link checks ignore loopback URLs and tolerate empty results.

## [0.6.0] - 2026-10-07

### Changed

- **Breaking:** Raise the Astro integration requirement to Astro ^7.2.10.
- **Breaking:** Restrict Node.js support to `^24.16.0 || >=26.3.0`, dropping Node.js 25 and Node.js 26 releases before 26.3.0.

### Documentation

- Update Astro prerequisites and explain that MDX configurations with a separate processor or `extendMarkdownConfig: false` bypass integration transforms.

### Maintenance

- Refresh runtime requirements for Astro's Markdown processors, lognow, directive parsing, and Markdown serialization.
- Upgrade contributor tooling to pnpm 12, Vitest 5, and tsdown 0.23, refresh shared configuration, and simplify internal transforms.
- Add scheduled dependency-update automation, pin release and metadata actions, and correct link-check error capture.

## [0.5.1] - 2026-08-25

### Maintenance

- Update Astro's Markdown processor requirements and move the Sätteri requirement to ^0.10.5.
- Refresh development dependencies, adjust tests for updated processor types, and publish using an npm one-time password.
- Improve website link checks by loading Lychee configuration, discovering sitemap links from the homepage, and pinning sitemap discovery tooling.

## [0.5.0] - 2026-08-05

### Added

- Add `sectionize` on both processors to wrap heading content in nested sections, including headings inside containers, and export `remarkMdxKitSectionize` for standalone use.

### Changed

- **Breaking:** Raise the minimum supported Node.js version to 24.16.0.

### Documentation

- Document sectionizing, its interaction with element overrides, and processing order; correct package and license links.

### Maintenance

- Refresh runtime requirements for Astro's Markdown processors, Sätteri, and lognow.
- Refresh development dependencies, pnpm, editor tasks, and lint configuration, and adopt the shared Astro TypeScript configuration.
- Add scheduled repository and website link checks, refresh CI actions, and simplify release tag validation against the default branch.

## [0.4.1] - 2026-07-07

### Removed

- **Breaking:** Remove Sätteri Kramdown attribute-list processing; `attributes: true` now logs a warning and is ignored on Sätteri.
- **Breaking:** Remove `escapeMdxAttributeLists` from the package root and `astro-mdx-kit/satteri` exports.

### Documentation

- Clarify that attribute lists require the unified processor and update configuration examples accordingly.

### Maintenance

- Reorganize workspace configuration and development commands for separate Sätteri and unified playgrounds.

## [0.4.0] - 2026-07-07

### Added

- Support Astro 7's default Sätteri processor with native directive, element, asset, caption, unwrapping, and frontmatter transforms, exposed through `satteriMdxKit` and `astro-mdx-kit/satteri`.
- Add Sätteri attribute-list preprocessing and the public `escapeMdxAttributeLists` helper.

### Changed

- **Breaking:** Raise the Astro integration requirement to Astro ^7.0.6.

### Fixed

- Correct stacked and chained Sätteri attribute lists, class merging, and preprocessing around frontmatter fences with CRLF or trailing whitespace.
- Handle Sätteri `components` exports with multiple declarations or export specifiers without generating duplicate exports.

### Documentation

- Document Astro 7 and MDX 7 setup, standalone Sätteri configuration, and Sätteri attribute-list limitations.

### Maintenance

- Upgrade contributor tooling to shared-config 8 and TypeScript 6, require Node.js 24.16+ for development, and add Sätteri pipeline tests.

## [0.3.0] - 2026-06-11

### Changed

- **Breaking:** Require Astro ^6.4.0 for the integration and register transforms on `markdown.processor`, preserving existing remark plugins and warning about unsupported processors.
- **Breaking:** Raise the minimum supported Node.js version to 22.12.0.

### Documentation

- Update setup examples for Astro 6.4, `@astrojs/mdx` 6, and the unified processor API.

### Maintenance

- Refresh development dependencies and pnpm, and update integration tests for processor registration.

## [0.2.1] - 2026-05-16

### Documentation

- Correct JSDoc examples, README wording, and the license link.

### Maintenance

- Update the `lognow` runtime requirement to ^0.6.2.
- Migrate contributor and CI tooling to pnpm 11, refresh development dependencies and actions, and correct npm authentication in the release script.

## [0.2.0] - 2026-04-28

### Maintenance

- Update Astro and `@astrojs/check` development dependencies across the package and playgrounds.
- Disable Astro telemetry during CI builds to prevent Windows cleanup crashes.

## [0.1.0] - 2026-04-28

### Added

- Ship an Astro integration for Astro ^6.1.0 and a typed ESM library for Node.js 20.19+, exposing `remarkMdxKit`, `astro-mdx-kit/remark`, and standalone plugins and transforms.
- Map text, leaf, and container directives to automatically imported components, with attribute renaming and label extraction as plain text, Markdown, or HTML props.
- Override Markdown elements and arbitrary JSX component names, merging component mappings with document exports while preserving local overrides.
- Automatically import asset props from directives, images, and JSX attributes, with prop remapping, derived imports, and explicit values taking precedence over derived paths.
- Provide `astroImage`, `astroPicture`, and `tldrawDarkImport` presets for Astro image components and derived dark `.tldr` assets.
- Extract adjacent image captions into `<figure>/<figcaption>`, component children, or string props serialized as plain text, Markdown, or HTML.
- Support optional Kramdown attribute lists for IDs, classes, and other attributes, forwarding them to overridden components.
- Optionally remove paragraph wrappers around standalone images, including custom image components and images nested in blockquotes or lists.
- Add `unwrapPhrasingContent` to remove invalid paragraph wrappers inside phrasing-only JSX elements such as `<span>`, `<button>`, and `<label>`.
- Expose original MDX source and transformed MDAST through configurable frontmatter keys without overwriting existing values.
- Support custom logger injection through `setLogger`, with transform diagnostics and configuration warnings.

### Documentation

- Document installation, peer dependencies, feature configuration, and processing order, with Astro and Starlight examples and a pre-1.0 development warning.
- Document VS Code MDX extension setup for directive and attribute syntax.

### Maintenance

- Set up builds, linting, release automation, cross-platform CI, and tests covering imports, configuration, transforms, presets, and logging.

[0.1.0]: https://github.com/kitschpatrol/astro-mdx-kit/releases/tag/v0.1.0
[0.2.0]: https://github.com/kitschpatrol/astro-mdx-kit/compare/v0.1.0...v0.2.0
[0.2.1]: https://github.com/kitschpatrol/astro-mdx-kit/compare/v0.2.0...v0.2.1
[0.3.0]: https://github.com/kitschpatrol/astro-mdx-kit/compare/v0.2.1...v0.3.0
[0.4.0]: https://github.com/kitschpatrol/astro-mdx-kit/compare/v0.3.0...v0.4.0
[0.4.1]: https://github.com/kitschpatrol/astro-mdx-kit/compare/v0.4.0...v0.4.1
[0.5.0]: https://github.com/kitschpatrol/astro-mdx-kit/compare/v0.4.1...v0.5.0
[0.5.1]: https://github.com/kitschpatrol/astro-mdx-kit/compare/v0.5.0...v0.5.1
[0.6.0]: https://github.com/kitschpatrol/astro-mdx-kit/compare/v0.5.1...v0.6.0
[0.7.0]: https://github.com/kitschpatrol/astro-mdx-kit/compare/v0.6.0...v0.7.0
[0.7.1]: https://github.com/kitschpatrol/astro-mdx-kit/compare/v0.7.0...v0.7.1
