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

export type RemarkDirectivesOptions = {
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
 * Create the tree transformer for directive-to-component conversion.
 * Exported separately from the Plugin wrapper for direct use in tests.
 */
export function createDirectiveTransform(options: RemarkDirectivesOptions): (tree: Root) => void {
	const { configs } = options

	return (tree: Root) => {
		const imports = new ImportTracker()

		visit(tree, (node, index, parent) => {
			if (!parent || index === undefined || !isDirectiveNode(node)) return

			if (!(node.name in configs)) return
			const config = configs[node.name]

			log.debug(`Transforming :${node.name} directive → <${config.componentName}>`)
			imports.addComponentImport(config.componentName, config.importPath, config.isNamedImport)

			const attributes: MdxJsxAttribute[] = []
			const omitProp = config.autoImport?.fromProp

			for (const [key, value] of Object.entries(node.attributes ?? {})) {
				if (!value) continue
				if (key === omitProp && isImportablePath(value)) {
					const { fromProp, toProp } = config.autoImport!
					const importId = imports.addAssetImport(value)
					attributes.push(createExpressionAttribute(toProp, importId))
					// When remapping (from !== to), preserve the original prop as a string
					if (fromProp !== toProp) {
						attributes.push(createStringAttribute(key, value))
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
 */
export const remarkMdxKitDirectives: Plugin<[RemarkDirectivesOptions], Root> = (options) =>
	createDirectiveTransform(options)
