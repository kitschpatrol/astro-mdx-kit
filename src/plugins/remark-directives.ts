/// <reference types="mdast-util-directive" />
/// <reference types="mdast-util-mdx-jsx" />
/// <reference types="mdast-util-mdxjs-esm" />

import type { Root } from 'mdast'
import type { MdxJsxAttribute } from 'mdast-util-mdx-jsx'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'
import { log } from '../log.js'
import type { ResolvedComponentConfig } from '../utils/resolve-config.js'
import {
	createExpressionAttribute,
	createJsxFlowElement,
	createJsxTextElement,
	createStringAttribute,
} from '../utils/ast.js'
import { ImportTracker, isImportablePath } from '../utils/imports.js'

export interface RemarkDirectivesOptions {
	configs: Record<string, ResolvedComponentConfig>
}

function isDirectiveNode(
	node: unknown,
): node is import('mdast-util-directive').ContainerDirective | import('mdast-util-directive').LeafDirective | import('mdast-util-directive').TextDirective {
	if (!node || typeof node !== 'object' || !('type' in node)) return false
	const type = (node as { type: string }).type
	return (
		type === 'containerDirective' || type === 'leafDirective' || type === 'textDirective'
	)
}

/**
 * Remark plugin that transforms markdown directives into MDX JSX
 * component elements, injecting the necessary import statements.
 *
 * Handles all three directive forms (container / leaf / text)
 * uniformly — the user doesn't need to classify which form they use.
 */
export const remarkMdxKitDirectives: Plugin<[RemarkDirectivesOptions], Root> = (options) => {
	const { configs } = options

	return (tree: Root) => {
		const imports = new ImportTracker()

		visit(tree, (node, index, parent) => {
			if (!parent || index === undefined || !isDirectiveNode(node)) return

			const config = configs[node.name]
			if (!config) return

			log.debug(`Transforming :${node.name} directive → <${config.componentName}>`)

			// Register the component import
			imports.addComponentImport(config.componentName, config.importPath, config.isNamedImport)

			// Build attributes from directive attributes
			const attributes: MdxJsxAttribute[] = []
			const directiveAttrs = { ...(node.attributes ?? {}) }

			// Handle autoImport: replace the prop value with an imported identifier
			if (config.autoImport) {
				const { fromProp, toProp } = config.autoImport
				const rawValue = directiveAttrs[fromProp]

				if (rawValue && isImportablePath(rawValue)) {
					const importId = imports.addAssetImport(rawValue)
					attributes.push(createExpressionAttribute(toProp, importId))

					// Remove the original prop so it's not duplicated
					// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
					delete directiveAttrs[fromProp]

					// If fromProp !== toProp, the original prop name is gone;
					// the new prop name carries the imported value.
				}
			}

			// Add remaining directive attributes as string props
			for (const [key, value] of Object.entries(directiveAttrs)) {
				if (value !== undefined) {
					attributes.push(createStringAttribute(key, value))
				}
			}

			// Create JSX element — text directives become inline, others block
			const children = [...(node.children ?? [])]

			const jsxNode =
				node.type === 'textDirective'
					? createJsxTextElement(
							config.componentName,
							attributes,
							children as Root['children'],
						)
					: createJsxFlowElement(
							config.componentName,
							attributes,
							children as Root['children'],
						)

			// Replace the directive node in the parent
			parent.children[index] = jsxNode as (typeof parent.children)[number]
		})

		// Inject imports at top of the file
		imports.injectIntoTree(tree)
	}
}
