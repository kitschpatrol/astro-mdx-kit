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
import { serializePhrasingContent } from '../utils/caption.js'
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
 * Extract the `[label]` from container directive children (marked with
 * `data.directiveLabel`), remove it from the children array, and return
 * a serialized string attribute. Returns `undefined` if no label paragraph
 * is found.
 */
function extractContainerLabel(
	children: Array<BlockContent | DefinitionContent>,
	config: ResolvedComponentConfig,
): MdxJsxAttribute | undefined {
	if (!config.label) return undefined

	const labelIndex = children.findIndex(
		(child) => child.type === 'paragraph' && child.data?.directiveLabel === true,
	)
	if (labelIndex === -1) return undefined

	const labelParagraph = children[labelIndex]
	children.splice(labelIndex, 1)

	if (!labelParagraph || !('children' in labelParagraph)) return undefined

	const serialized = serializePhrasingContent(
		// eslint-disable-next-line ts/no-unsafe-type-assertion -- directiveLabel paragraphs contain PhrasingContent
		labelParagraph.children as PhrasingContent[],
		config.label.format,
	)
	return createStringAttribute(config.label.prop, serialized)
}

/**
 * Extract the `[content]` from a text or leaf directive's children,
 * serialize it as a label prop, and clear the children array.
 * Returns `undefined` if the directive has no children.
 */
function extractPhrasingLabel(
	children: PhrasingContent[],
	config: ResolvedComponentConfig,
): MdxJsxAttribute | undefined {
	if (!config.label || children.length === 0) return undefined

	const serialized = serializePhrasingContent(children, config.label.format)
	children.length = 0
	return createStringAttribute(config.label.prop, serialized)
}

/**
 * Build JSX attributes from a directive's attributes record, applying
 * `propMap` renaming and `autoImport` resolution.
 */
function buildDirectiveAttributes(
	directiveAttributes: NonNullable<Directive['attributes']>,
	config: ResolvedComponentConfig,
	imports: ImportTracker,
): MdxJsxAttribute[] {
	const attributes: MdxJsxAttribute[] = []

	const primaryEntry = config.autoImports?.find((entry) => !entry.transform)
	const omitProp = primaryEntry?.fromProp

	for (const [key, value] of Object.entries(directiveAttributes)) {
		if (!value) continue
		const propName = config.propMap?.[key] ?? key

		if (key === omitProp && config.autoImports && isImportablePath(value)) {
			for (const entry of config.autoImports) {
				if (entry.transform) {
					const transformedPath = entry.transform(value)
					if (transformedPath === undefined) {
						log.debug(
							`Skipping derived autoImport for "${entry.toProp}" — transform returned undefined for "${value}"`,
						)
						continue
					}

					const importId = imports.addAssetImport(transformedPath)
					attributes.push(createExpressionAttribute(entry.toProp, importId))
				} else {
					const importId = imports.addAssetImport(value)
					attributes.push(createExpressionAttribute(entry.toProp, importId))
					if (entry.fromProp !== entry.toProp) {
						attributes.push(createStringAttribute(propName, value))
					}
				}
			}
		} else {
			attributes.push(createStringAttribute(propName, value))
		}
	}

	return attributes
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
				parent.children[index] = jsxNode as (typeof parent.children)[number]
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
