/* eslint-disable ts/triple-slash-reference */

/// <reference types="mdast-util-directive" />
/// <reference types="mdast-util-mdx-jsx" />

import type { PhrasingContent } from 'mdast'
import type { ContainerDirective, LeafDirective, TextDirective } from 'mdast-util-directive'
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx'
import type { MdastPluginDefinition, MdastVisitorContext } from 'satteri'
import type { ResolvedComponentConfig } from '../utils/resolve-config.js'
import { log } from '../log.js'
import { createJsxFlowElement, createJsxTextElement, lazyChildren } from '../utils/ast.js'
import {
	buildDirectiveAttributes,
	extractContainerLabel,
	extractPhrasingLabel,
	toFlowChildren,
} from '../utils/directives.js'
import { findRootNode, getImportTracker } from '../utils/satteri.js'

const PLUGIN_NAME = 'astro-mdx-kit:directives'

/**
 * Create a Sätteri MDAST plugin that converts markdown directives into MDX JSX
 * component elements and injects the necessary ESM import statements.
 *
 * Mirrors the remark {@link createDirectiveTransform} for Sätteri pipelines.
 * Requires the `directive` parser feature to be enabled (the Astro integration
 * does this automatically).
 *
 * @param configs - Map of directive names to resolved component configurations.
 */
export function createSatteriDirectivesPlugin(
	configs: Record<string, ResolvedComponentConfig>,
): MdastPluginDefinition {
	function visitFlowDirective(
		node: Readonly<ContainerDirective | LeafDirective>,
		context: MdastVisitorContext,
	): MdxJsxFlowElement | undefined {
		const config = configs[node.name]
		if (!config) {
			log.debug(`Skipping unknown directive ":${node.name}" — no matching config`)
			return undefined
		}

		log.debug(`Transforming :${node.name} directive → <${config.componentName}>`)
		const root = findRootNode(node, context)
		const imports = getImportTracker(context, PLUGIN_NAME, root)
		imports.addComponentImport(config.componentName, config.importPath, config.isNamedImport)

		const attributes = buildDirectiveAttributes(node.attributes ?? {}, config, imports)
		const children = toFlowChildren(node)

		if (node.type === 'containerDirective') {
			const labelAttribute = extractContainerLabel(children, config)
			if (labelAttribute) {
				attributes.push(labelAttribute)
			}
		} else {
			// Leaf directive: [content] is wrapped in a paragraph by toFlowChildren
			// Extract the phrasing content from inside it
			const firstChild = children[0]
			if (config.label && firstChild?.type === 'paragraph') {
				const phrasingChildren = [...firstChild.children] as PhrasingContent[]
				const labelAttribute = extractPhrasingLabel(phrasingChildren, config)
				if (labelAttribute) {
					children.length = 0
					attributes.push(labelAttribute)
				}
			}
		}

		return createJsxFlowElement(config.componentName, attributes, children)
	}

	function visitTextDirective(
		node: Readonly<TextDirective>,
		context: MdastVisitorContext,
	): MdxJsxTextElement | undefined {
		const config = configs[node.name]
		if (!config) {
			log.debug(`Skipping unknown directive ":${node.name}" — no matching config`)
			return undefined
		}

		log.debug(`Transforming :${node.name} directive → <${config.componentName}>`)
		const root = findRootNode(node, context)
		const imports = getImportTracker(context, PLUGIN_NAME, root)
		imports.addComponentImport(config.componentName, config.importPath, config.isNamedImport)

		const attributes = buildDirectiveAttributes(node.attributes ?? {}, config, imports)
		const children: PhrasingContent[] = [...lazyChildren(node.children)]
		const labelAttribute = extractPhrasingLabel(children, config)
		if (labelAttribute) {
			attributes.push(labelAttribute)
		}

		return createJsxTextElement(config.componentName, attributes, children)
	}

	return {
		containerDirective: visitFlowDirective,
		leafDirective: visitFlowDirective,
		name: PLUGIN_NAME,
		textDirective: visitTextDirective,
	}
}
