/* eslint-disable ts/triple-slash-reference */

/// <reference types="mdast-util-directive" />
/// <reference types="mdast-util-mdx-jsx" />
/// <reference types="mdast-util-mdxjs-esm" />

import type { PhrasingContent, Root } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'
import type { ResolvedComponentConfig } from '../utils/resolve-config.js'
import { log } from '../log.js'
import { createJsxFlowElement, createJsxTextElement } from '../utils/ast.js'
import {
	buildDirectiveAttributes,
	extractContainerLabel,
	extractPhrasingLabel,
	isDirectiveNode,
	toFlowChildren,
} from '../utils/directives.js'
import { ImportTracker } from '../utils/imports.js'

/**
 * Options for the directive-to-component remark plugin.
 */
export type RemarkDirectivesOptions = {
	/**
	 * Map of directive names to their resolved component configurations.
	 *
	 * Each key is the directive name as written in markdown (e.g. `"Note"` for
	 * `:Note{...}`) and the value describes which component to render and how to
	 * handle its imports.
	 */
	configs: Record<string, ResolvedComponentConfig>
}

/**
 * Create a MDAST tree transformer that converts markdown directives into MDX
 * JSX component elements and injects the necessary ESM import statements.
 *
 * Each directive matching a key in `options.configs` is replaced with a
 * corresponding `<Component>` JSX node. Directive attributes become JSX props,
 * and `autoImport` attributes are resolved to ESM imports.
 *
 * Exported separately from the plugin wrapper so it can be composed into larger
 * transform pipelines or used directly in tests.
 *
 * @param options - Directive transform configuration.
 *
 * @returns A tree transformer function.
 */
export function createDirectiveTransform(options: RemarkDirectivesOptions): (tree: Root) => void {
	const { configs } = options

	return (tree: Root) => {
		const imports = new ImportTracker()

		visit(tree, (node, index, parent) => {
			if (!parent || index === undefined || !isDirectiveNode(node)) {
				return
			}

			if (!(node.name in configs)) {
				log.debug(`Skipping unknown directive ":${node.name}" — no matching config`)
				return
			}

			// Safe: the `in` check above guarantees the key exists
			const config = configs[node.name]!

			log.debug(`Transforming :${node.name} directive → <${config.componentName}>`)
			imports.addComponentImport(config.componentName, config.importPath, config.isNamedImport)

			const attributes = buildDirectiveAttributes(node.attributes ?? {}, config, imports)

			if (node.type === 'textDirective') {
				const children: PhrasingContent[] = [...node.children]
				const labelAttribute = extractPhrasingLabel(children, config)
				if (labelAttribute) {
					attributes.push(labelAttribute)
				}

				const jsxNode = createJsxTextElement(config.componentName, attributes, children)
				parent.children[index] = jsxNode
			} else {
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

				const jsxNode = createJsxFlowElement(config.componentName, attributes, children)
				parent.children[index] = jsxNode
			}
		})

		imports.injectIntoTree(tree)
	}
}

/**
 * Remark plugin that transforms markdown directives into MDX JSX component
 * elements, injecting the necessary import statements.
 *
 * Supports all three directive forms: container (`:::`), leaf (`::`), and
 * text/inline (`:`). Use {@link createDirectiveTransform} for the underlying
 * tree transformer.
 */
export const remarkMdxKitDirectives: Plugin<[RemarkDirectivesOptions], Root> = (options) =>
	createDirectiveTransform(options)
