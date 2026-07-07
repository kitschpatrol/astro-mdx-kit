/* eslint-disable ts/triple-slash-reference */

/// <reference types="mdast-util-mdx-jsx" />

import type { Image, Parent } from 'mdast'
import type { MdxJsxAttribute, MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import type { AssetImporter } from './imports.js'
import type { ResolvedComponentConfig } from './resolve-config.js'
import { createJsxFlowElement, createStringAttribute, isWhitespaceText } from './ast.js'
import { resolveAutoImportAttributes } from './imports.js'

/**
 * JSX element names treated as images by default when deciding whether a
 * paragraph contains a stand-alone image.
 */
export const DEFAULT_IMAGE_NAMES: ReadonlySet<string> = new Set(['Image', 'img', 'Picture'])

/**
 * Check whether a node is an image or an image-like JSX element (by name).
 */
export function isImageLike(
	node: { name?: unknown; type: string },
	names: ReadonlySet<string>,
): boolean {
	if (node.type === 'image') {
		return true
	}

	if (node.type !== 'mdxJsxFlowElement' && node.type !== 'mdxJsxTextElement') {
		return false
	}

	return typeof node.name === 'string' && names.has(node.name)
}

/**
 * Check whether a paragraph consists of a single image-like node, ignoring
 * whitespace-only text nodes.
 */
export function isStandaloneImage(paragraph: Parent, names: ReadonlySet<string>): boolean {
	const meaningful = paragraph.children.filter(
		(child) => !isWhitespaceText(child as { type: string; value?: string }),
	)

	if (meaningful.length !== 1) {
		return false
	}

	return isImageLike(meaningful[0] as { name?: string; type: string }, names)
}

/**
 * Build a JSX flow element replacing an MDAST `image` node, applying the
 * element override config's `autoImport` resolution and forwarding
 * `hProperties` attributes (e.g. from attribute syntax).
 *
 * @param node - The MDAST image node to convert.
 * @param config - The resolved `img` element override configuration.
 * @param imports - Importer used to register auto-imported asset paths.
 */
export function buildImageJsxElement(
	node: Image,
	config: ResolvedComponentConfig,
	imports: AssetImporter,
): MdxJsxFlowElement {
	const attributes: MdxJsxAttribute[] = []
	const hProperties = (node.data?.hProperties ?? {}) as Record<string, unknown>

	if (config.autoImports) {
		// Build propValues: 'src' from node.url, plus string-valued hProperties.
		// This lets each auto-import entry look up its own fromProp in the map
		// (e.g. 'src' reads node.url, 'srcDark' reads \{srcDark="..."\}).
		const propValues: Record<string, string> = { src: node.url }
		for (const [key, value] of Object.entries(hProperties)) {
			if (typeof value === 'string') {
				propValues[key] = value
			}
		}

		const { attributes: importAttributes, handledProps } = resolveAutoImportAttributes(
			propValues,
			config.autoImports,
			imports,
		)
		attributes.push(...importAttributes)

		// Forward remaining hProperties not consumed by auto-import
		for (const [key, value] of Object.entries(hProperties)) {
			if (typeof value === 'string' && !handledProps.has(key)) {
				attributes.push(createStringAttribute(key, value))
			}
		}
	} else {
		// No autoImport — forward all hProperties as strings
		for (const [key, value] of Object.entries(hProperties)) {
			if (typeof value === 'string') {
				attributes.push(createStringAttribute(key, value))
			}
		}
	}

	// Add alt and title from the mdast node, but only when hProperties
	// didn't already provide them (avoids duplicate attributes while
	// letting explicit attribute syntax like \{alt="..."\} take precedence).
	if (typeof node.alt === 'string' && node.alt !== '' && !('alt' in hProperties)) {
		attributes.push(createStringAttribute('alt', node.alt))
	}

	if (typeof node.title === 'string' && node.title !== '' && !('title' in hProperties)) {
		attributes.push(createStringAttribute('title', node.title))
	}

	return createJsxFlowElement(config.componentName, attributes, [])
}
