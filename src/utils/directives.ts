/* eslint-disable ts/triple-slash-reference */

/// <reference types="mdast-util-directive" />
/// <reference types="mdast-util-mdx-jsx" />

import type { BlockContent, DefinitionContent, PhrasingContent } from 'mdast'
import type { ContainerDirective, LeafDirective, TextDirective } from 'mdast-util-directive'
import type { MdxJsxAttribute } from 'mdast-util-mdx-jsx'
import type { AssetImporter } from './imports.js'
import type { ResolvedComponentConfig } from './resolve-config.js'
import { createStringAttribute, lazyChildren } from './ast.js'
import { serializePhrasingContent } from './caption.js'
import { resolveAutoImportAttributes } from './imports.js'

/**
 * Union of the three markdown directive node types (container, leaf, text).
 */
export type Directive = ContainerDirective | LeafDirective | TextDirective

/**
 * Check whether an AST node is one of the three directive node types.
 */
export function isDirectiveNode(node: { type: string }): node is Directive {
	return ['containerDirective', 'leafDirective', 'textDirective'].includes(node.type)
}

/**
 * Normalize a container or leaf directive's children into flow content.
 *
 * Container directive children are already flow content; leaf directive
 * children are phrasing content and get wrapped in a paragraph.
 */
export function toFlowChildren(
	node: ContainerDirective | LeafDirective,
): Array<BlockContent | DefinitionContent> {
	if (node.type === 'containerDirective') {
		return [...lazyChildren(node.children)]
	}

	const children = lazyChildren(node.children)
	if (children.length === 0) {
		return []
	}

	return [{ children: [...children], type: 'paragraph' }]
}

/**
 * Extract the `[label]` from container directive children (marked with
 * `data.directiveLabel`), remove it from the children array, and return a
 * serialized string attribute. Returns `undefined` if no label paragraph is
 * found.
 */
export function extractContainerLabel(
	children: Array<BlockContent | DefinitionContent>,
	config: ResolvedComponentConfig,
): MdxJsxAttribute | undefined {
	if (!config.label) {
		return undefined
	}

	const labelIndex = children.findIndex(
		(child) => child.type === 'paragraph' && child.data?.directiveLabel === true,
	)
	if (labelIndex === -1) {
		return undefined
	}

	const labelParagraph = children[labelIndex]
	children.splice(labelIndex, 1)

	if (!labelParagraph || !('children' in labelParagraph)) {
		return undefined
	}

	const serialized = serializePhrasingContent(
		labelParagraph.children as PhrasingContent[],
		config.label.format,
	)
	return createStringAttribute(config.label.prop, serialized)
}

/**
 * Extract the `[content]` from a text or leaf directive's children, serialize
 * it as a label prop, and clear the children array. Returns `undefined` if the
 * directive has no children.
 */
export function extractPhrasingLabel(
	children: PhrasingContent[],
	config: ResolvedComponentConfig,
): MdxJsxAttribute | undefined {
	if (!config.label || children.length === 0) {
		return undefined
	}

	const serialized = serializePhrasingContent(children, config.label.format)
	children.length = 0
	return createStringAttribute(config.label.prop, serialized)
}

/**
 * Build JSX attributes from a directive's attributes record, applying `propMap`
 * renaming and `autoImport` resolution.
 */
export function buildDirectiveAttributes(
	directiveAttributes: NonNullable<Directive['attributes']>,
	config: ResolvedComponentConfig,
	imports: AssetImporter,
): MdxJsxAttribute[] {
	const attributes: MdxJsxAttribute[] = []

	if (config.autoImports) {
		// Build propValues from all non-empty directive attributes
		const propValues: Record<string, string> = {}
		for (const [key, value] of Object.entries(directiveAttributes)) {
			if (typeof value === 'string' && value !== '') {
				propValues[key] = value
			}
		}

		const { attributes: importAttributes, handledProps } = resolveAutoImportAttributes(
			propValues,
			config.autoImports,
			imports,
		)
		attributes.push(...importAttributes)

		// Forward remaining attributes not consumed by auto-import, with
		// propMap renaming applied.
		for (const [key, value] of Object.entries(directiveAttributes)) {
			if (typeof value !== 'string' || value === '' || handledProps.has(key)) {
				continue
			}

			const propName = config.propMap?.[key] ?? key
			attributes.push(createStringAttribute(propName, value))
		}
	} else {
		// No autoImport — forward all attributes with propMap renaming
		for (const [key, value] of Object.entries(directiveAttributes)) {
			if (typeof value !== 'string' || value === '') {
				continue
			}

			const propName = config.propMap?.[key] ?? key
			attributes.push(createStringAttribute(propName, value))
		}
	}

	return attributes
}
