// Astro integration (default export only)
export { default } from './integration.js'

// Logger
export { setLogger } from './log.js'
export {
	captionImagesTransform,
	remarkMdxKitCaptionImages,
} from './plugins/remark-caption-images.js'
export { createDirectiveTransform, remarkMdxKitDirectives } from './plugins/remark-directives.js'
export type { RemarkDirectivesOptions } from './plugins/remark-directives.js'

export { createElementTransform, remarkMdxKitElements } from './plugins/remark-elements.js'
export type { RemarkElementsOptions } from './plugins/remark-elements.js'
export {
	createFrontmatterInjectTransform,
	remarkMdxKitFrontmatterInject,
} from './plugins/remark-frontmatter-inject.js'
export type { RemarkFrontmatterInjectOptions } from './plugins/remark-frontmatter-inject.js'
export { remarkMdxKitUnwrapImages, unwrapImagesTransform } from './plugins/remark-unwrap-images.js'
export type { RemarkUnwrapImagesOptions } from './plugins/remark-unwrap-images.js'
export {
	remarkMdxKitUnwrapPhrasingContent,
	unwrapPhrasingContentTransform,
} from './plugins/remark-unwrap-phrasing.js'
// Presets
export { astroImage, astroPicture, tldrawDarkImport } from './presets.js'
// Remark plugin factory (typed tuple helper)
export { remarkMdxKit } from './remark-plugin.js'
// Sätteri plugin factory (for Astro 7's default Sätteri processor)
export { escapeMdxAttributeLists, satteriMdxKit } from './satteri-plugin.js'

// Types
export type {
	AutoImportConfig,
	AutoImportEntry,
	CaptionConfig,
	CaptionPropConfig,
	ComponentConfig,
	DetailedComponentConfig,
	DetailedElementConfig,
	ElementConfig,
	LabelConfig,
	MarkdownElementName,
	MdxKitOptions,
} from './types.js'

// Individual sub-plugins for standalone use in any remark pipeline
export { default as remarkMdxKitAttributes } from 'remark-attribute-list'
