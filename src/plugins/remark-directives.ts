/* eslint-disable max-depth */
/* eslint-disable ts/triple-slash-reference */

/// <reference types="mdast-util-directive" />
/// <reference types="mdast-util-mdx-jsx" />
/// <reference types="mdast-util-mdxjs-esm" />

import type { BlockContent, DefinitionContent, PhrasingContent, Root } from 'mdast'
import type { ContainerDirective, LeafDirective, TextDirective } from 'mdast-util-directive'
import type { MdxJsxAttribute } from 'mdast-util-mdx-jsx'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'
import type { ResolvedComponentConfig } from '../utils/resolve-config.js'
import { log } from '../log.js'
import {
	createExpressionAttribute,
	createJsxFlowElement,
	createJsxTextElement,
	createStringAttribute,
} from '../utils/ast.js'
import { ImportTracker, isImportablePath } from '../utils/imports.js'

/**
 * Options for the directive-to-component remark plugin.
 */
export type RemarkDirectivesOptions = {
	/**
	 * Map of directive names to their resolved component configurations.
	 *
	 * Each key is the directive name as written in markdown (e.g. `"Note"`
	 * for `:Note{...}`) and the value describes which component to render
	 * and how to handle its imports.
	 */
	configs: Record<string, ResolvedComponentConfig>
}

type Directive = ContainerDirective | LeafDirective | TextDirective

function isDirectiveNode(node: { type: string }): node is Directive {
	return (
		node.type === 'containerDirective' ||
		node.type === 'leafDirective' ||
		node.type === 'textDirective'
	)
}

function toFlowChildren(
	node: ContainerDirective | LeafDirective,
): Array<BlockContent | DefinitionContent> {
	if (node.type === 'containerDirective') {
		return [...node.children]
	}

	if (node.children.length === 0) return []
	return [{ children: [...node.children], type: 'paragraph' }]
}

/**
 * Create a MDAST tree transformer that converts markdown directives into
 * MDX JSX component elements and injects the necessary ESM import statements.
 *
 * Each directive matching a key in `options.configs` is replaced with a
 * corresponding `<Component>` JSX node. Directive attributes become JSX
 * props, and `autoImport` attributes are resolved to ESM imports.
 *
 * Exported separately from the plugin wrapper so it can be composed into
 * larger transform pipelines or used directly in tests.
 * @param options - Directive transform configuration.
 * @returns A tree transformer function.
 */
export function createDirectiveTransform(options: RemarkDirectivesOptions): (tree: Root) => void {
	const { configs } = options

	return (tree: Root) => {
		const imports = new ImportTracker()

		visit(tree, (node, index, parent) => {
			if (!parent || index === undefined || !isDirectiveNode(node)) return

			if (!(node.name in configs)) return
			const config = configs[node.name]

			if (config === undefined) {
				throw new Error('Config is undefined')
			}

			log.debug(`Transforming :${node.name} directive → <${config.componentName}>`)
			imports.addComponentImport(config.componentName, config.importPath, config.isNamedImport)

			const attributes: MdxJsxAttribute[] = []

			// Find the primary auto-import entry (the one without a transform)
			const primaryEntry = config.autoImports?.find((entry) => !entry.transform)
			const omitProp = primaryEntry?.fromProp

			for (const [key, value] of Object.entries(node.attributes ?? {})) {
				if (!value) continue
				if (key === omitProp && config.autoImports && isImportablePath(value)) {
					for (const entry of config.autoImports) {
						if (entry.transform) {
							// Derived import
							const transformedPath = entry.transform(value)
							if (transformedPath === undefined) continue
							const importId = imports.addAssetImport(transformedPath)
							attributes.push(createExpressionAttribute(entry.toProp, importId))
						} else {
							const importId = imports.addAssetImport(value)
							attributes.push(createExpressionAttribute(entry.toProp, importId))
							// When remapping (from !== to), preserve the original prop as a string
							if (entry.fromProp !== entry.toProp) {
								attributes.push(createStringAttribute(key, value))
							}
						}
					}
				} else {
					attributes.push(createStringAttribute(key, value))
				}
			}

			if (node.type === 'textDirective') {
				const children: PhrasingContent[] = [...node.children]
				const jsxNode = createJsxTextElement(config.componentName, attributes, children)
				parent.children[index] = jsxNode as (typeof parent.children)[number]
			} else {
				const children = toFlowChildren(node)
				const jsxNode = createJsxFlowElement(config.componentName, attributes, children)
				parent.children[index] = jsxNode as (typeof parent.children)[number]
			}
		})

		imports.injectIntoTree(tree)
	}
}

/**
 * Remark plugin that transforms markdown directives into MDX JSX
 * component elements, injecting the necessary import statements.
 *
 * Supports all three directive forms: container (`:::`), leaf (`::`), and
 * text/inline (`:`). Use {@link createDirectiveTransform} for the
 * underlying tree transformer.
 */
export const remarkMdxKitDirectives: Plugin<[RemarkDirectivesOptions], Root> = (options) =>
	createDirectiveTransform(options)
