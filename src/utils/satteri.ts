import type { MdastNode, MdastPluginDefinition, MdastVisitorContext } from 'satteri'
import type { AssetImporter } from './imports.js'
import { buildEsmImportValue } from './ast.js'

/**
 * Per-compile state shared across all astro-mdx-kit Sätteri plugin passes.
 *
 * Stored on `ctx.data` under a symbol key so it never leaks into the
 * JSON-serialized compile result, and is naturally scoped to a single document
 * (Sätteri creates a fresh data bag per compile).
 */
type SatteriCompileState = {
	/**
	 * Set when an existing `export const components` was found and merged into,
	 * so the inject pass knows not to emit a duplicate declaration.
	 */
	componentsExportHandled: boolean
	/** Names of fire-once plugins that have already run for this document. */
	fired: Set<string>
	/** Per-plugin import trackers, keyed by plugin name. */
	trackers: Map<string, SatteriImportTracker>
}

const STATE_KEY = Symbol('astro-mdx-kit')

/**
 * Get (or lazily create) the astro-mdx-kit compile state for the current
 * document.
 */
export function getCompileState(context: MdastVisitorContext): SatteriCompileState {
	// eslint-disable-next-line ts/no-unsafe-type-assertion -- symbol keys are outside satteri's string-keyed Data type
	const data = context.data as unknown as Record<symbol, unknown>
	data[STATE_KEY] ??= {
		componentsExportHandled: false,
		fired: new Set<string>(),
		trackers: new Map<string, SatteriImportTracker>(),
	} satisfies SatteriCompileState
	// eslint-disable-next-line ts/no-unsafe-type-assertion -- written above with the correct shape
	return data[STATE_KEY] as SatteriCompileState
}

/**
 * Walk `ctx.parent` links from a node up to the document root.
 */
export function findRootNode(
	node: Readonly<MdastNode>,
	context: MdastVisitorContext,
): Readonly<MdastNode> {
	let current = node
	for (;;) {
		const parent = context.parent(current)
		if (!parent) {
			return current
		}

		current = parent
	}
}

/**
 * Tracks component and asset imports during a single Sätteri plugin pass,
 * inserting deduplicated `mdxjsEsm` import nodes at the top of the document as
 * they are registered.
 *
 * Unlike the remark {@link ImportTracker}, injection is incremental: Sätteri
 * mutations are recorded as commands and applied after the pass, so each new
 * import can be inserted immediately without an end-of-pass hook.
 */
export class SatteriImportTracker implements AssetImporter {
	private readonly assetImports = new Map<string, string>()
	private readonly ctx: MdastVisitorContext
	private readonly importKeys = new Set<string>()
	private readonly root: Readonly<MdastNode>

	constructor(root: Readonly<MdastNode>, context: MdastVisitorContext) {
		this.root = root
		this.ctx = context
	}

	/**
	 * Register an asset import (e.g. an image path like `'./photo.jpg'`) and
	 * return the local identifier that references the imported module. Repeat
	 * registrations of the same path return the existing identifier.
	 */
	addAssetImport(assetPath: string): string {
		const existing = this.assetImports.get(assetPath)
		if (existing) {
			return existing
		}

		const name = `_mdxKitAsset${Math.random().toString(36).slice(2, 14)}`
		this.assetImports.set(assetPath, name)
		this.insertImport(buildEsmImportValue(name, assetPath, false))
		return name
	}

	/**
	 * Register a component import. Duplicate registrations (same localName +
	 * importPath + kind) are silently ignored.
	 */
	addComponentImport(localName: string, importPath: string, isNamed: boolean): void {
		const key = `${isNamed ? 'named' : 'default'}|${localName}|${importPath}`
		if (this.importKeys.has(key)) {
			return
		}

		this.importKeys.add(key)
		this.insertImport(buildEsmImportValue(localName, importPath, isNamed))
	}

	private insertImport(value: string): void {
		this.ctx.insertChildAt(this.root, 0, { type: 'mdxjsEsm', value })
	}
}

/**
 * Get (or lazily create) the import tracker for a plugin pass. Trackers are
 * scoped per document and per plugin name.
 */
export function getImportTracker(
	context: MdastVisitorContext,
	pluginName: string,
	root: Readonly<MdastNode>,
): SatteriImportTracker {
	const state = getCompileState(context)
	let tracker = state.trackers.get(pluginName)
	if (!tracker) {
		tracker = new SatteriImportTracker(root, context)
		state.trackers.set(pluginName, tracker)
	}

	return tracker
}

/**
 * All node types that can appear as direct children of an MDAST root. A plugin
 * subscribing to all of these is guaranteed to fire on any non-empty document.
 */
const ROOT_FLOW_TYPES = [
	'blockquote',
	'code',
	'containerDirective',
	'definition',
	'footnoteDefinition',
	'heading',
	'html',
	'leafDirective',
	'list',
	'math',
	'mdxFlowExpression',
	'mdxJsxFlowElement',
	'mdxjsEsm',
	'paragraph',
	'table',
	'thematicBreak',
	'toml',
	'yaml',
] as const

/**
 * Build a Sätteri MDAST plugin that runs a callback exactly once per document,
 * with access to the document root.
 *
 * Sätteri plugins have no root visitor, so this subscribes to every node type
 * that can appear at the root and runs the callback on the first match.
 *
 * @param name - Unique plugin name, also used as the fire-once key.
 * @param run - Callback invoked once per document with the root node.
 */
export function createFireOncePlugin(
	name: string,
	run: (root: Readonly<MdastNode>, context: MdastVisitorContext) => void,
): MdastPluginDefinition {
	const visitor = (node: Readonly<MdastNode>, context: MdastVisitorContext): void => {
		const state = getCompileState(context)
		if (state.fired.has(name)) {
			return
		}

		state.fired.add(name)
		run(findRootNode(node, context), context)
	}

	const visitors: Partial<Record<(typeof ROOT_FLOW_TYPES)[number], typeof visitor>> = {}
	for (const type of ROOT_FLOW_TYPES) {
		visitors[type] = visitor
	}

	return { name, ...visitors }
}

/**
 * Set a key on the document frontmatter exposed at `ctx.data.astro.frontmatter`
 * (the shape Astro's Sätteri pipelines seed and read back), creating the
 * structure when running outside Astro. Existing keys are not overwritten.
 */
export function setSatteriFrontmatter(
	context: MdastVisitorContext,
	key: string,
	value: unknown,
): void {
	const data = context.data as Record<string, unknown>

	if (!data.astro || typeof data.astro !== 'object') {
		data.astro = { frontmatter: {} }
	}

	// eslint-disable-next-line ts/no-unsafe-type-assertion -- guarded above
	const astro = data.astro as Record<string, unknown>
	if (!astro.frontmatter || typeof astro.frontmatter !== 'object') {
		astro.frontmatter = {}
	}

	// eslint-disable-next-line ts/no-unsafe-type-assertion -- guarded above
	const frontmatter = astro.frontmatter as Record<string, unknown>
	frontmatter[key] ??= value
}

/**
 * Materialize a Sätteri lazy node (and its subtree) into a plain JSON-safe
 * object, stripping Sätteri-internal bookkeeping fields (underscore-prefixed).
 */
export function materializeTree(root: Readonly<MdastNode>): unknown {
	return JSON.parse(
		JSON.stringify(root, (key, value: unknown) => (key.startsWith('_') ? undefined : value)),
	)
}
