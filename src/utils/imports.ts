import type { Root } from 'mdast'
import type { MdxJsxAttribute } from 'mdast-util-mdx-jsx'
import type { ResolvedAutoImportEntry } from './resolve-config.js'
import { log } from '../log.js'
import { createEsmImportNode, createExpressionAttribute, createStringAttribute } from './ast.js'

type TrackedImport = {
	importPath: string
	isNamed: boolean
	localName: string
}

type ComponentImport = {
	importPath: string
	isNamed: boolean
}

/**
 * Deduplication state shared by the remark and Sätteri import trackers for one
 * document: asset imports are keyed by path and get sequential identifiers,
 * component imports are keyed by local name.
 */
export class ImportRegistry {
	private readonly assets = new Map<string, string>()
	private readonly components = new Map<string, ComponentImport>()

	/**
	 * Resolve the local identifier for an asset path, creating a new sequential
	 * one (`_mdxKitAsset0`, `_mdxKitAsset1`, ...) the first time a path is seen.
	 *
	 * @returns The identifier and whether it was newly created.
	 */
	registerAsset(assetPath: string): { isNew: boolean; name: string } {
		const existing = this.assets.get(assetPath)
		if (existing !== undefined) {
			return { isNew: false, name: existing }
		}

		const name = `_mdxKitAsset${this.assets.size}`
		this.assets.set(assetPath, name)
		return { isNew: true, name }
	}

	/**
	 * Record a component import under its local name.
	 *
	 * A second registration of the same name and module is a no-op. A second
	 * registration of the same name from a different module is skipped with a
	 * warning, since both cannot be declared in one file.
	 *
	 * @returns `true` if the import is new and should be emitted.
	 */
	registerComponent(localName: string, importPath: string, isNamed: boolean): boolean {
		const existing = this.components.get(localName)
		if (existing === undefined) {
			this.components.set(localName, { importPath, isNamed })
			return true
		}

		if (existing.importPath !== importPath || existing.isNamed !== isNamed) {
			log.warn(
				`Component "${localName}" is already imported from "${existing.importPath}", so the import from "${importPath}" is skipped. Give directive and element configs that use different modules distinct component names.`,
			)
		}

		return false
	}
}

const trackers = new WeakMap<Root, ImportTracker>()

/**
 * Get (or lazily create) the import tracker for a document. Directive and
 * element transforms that run on the same tree share one tracker, so imports
 * are deduplicated across them and asset identifiers form a single sequence.
 *
 * @param tree - The root MDAST node being transformed.
 */
export function getImportTracker(tree: Root): ImportTracker {
	let tracker = trackers.get(tree)
	if (!tracker) {
		tracker = new ImportTracker()
		trackers.set(tree, tracker)
	}

	return tracker
}

/**
 * Tracks component and asset imports accumulated while transforming a single
 * MDX document, deduplicating identical imports.
 *
 * Use {@link addComponentImport} and {@link addAssetImport} to register imports
 * during tree traversal, then call {@link injectIntoTree} to prepend the import
 * statements registered since the last injection to the AST.
 */
export class ImportTracker {
	private readonly pending: TrackedImport[] = []
	private readonly registry = new ImportRegistry()

	/**
	 * Register an asset import (e.g. an image path like `'./photo.jpg'`).
	 *
	 * Returns the local identifier name that will reference the imported module.
	 * If the same `assetPath` was already registered, the existing identifier is
	 * returned (deduplication). Identifiers are numbered in registration order,
	 * so output is deterministic.
	 *
	 * @param assetPath - The path to import (e.g. `'./hero.png'`).
	 *
	 * @returns The local identifier (e.g. `'_mdxKitAsset0'`).
	 */
	addAssetImport(assetPath: string): string {
		const { isNew, name } = this.registry.registerAsset(assetPath)
		if (isNew) {
			this.pending.push({ importPath: assetPath, isNamed: false, localName: name })
		}

		return name
	}

	/**
	 * Register a component import. Duplicate registrations of the same local name
	 * are ignored; see {@link ImportRegistry.registerComponent}.
	 *
	 * @param localName - The local identifier for the component (e.g.
	 *   `'Picture'`).
	 * @param importPath - The module specifier (e.g. `'astro:assets'` or
	 *   `'/src/components/Foo.astro'`).
	 * @param isNamed - `true` for named imports, `false` for default imports.
	 */
	addComponentImport(localName: string, importPath: string, isNamed: boolean): void {
		if (this.registry.registerComponent(localName, importPath, isNamed)) {
			this.pending.push({ importPath, isNamed, localName })
		}
	}

	/**
	 * Prepend the import statements registered since the last call to the MDAST
	 * tree's children as `mdxjsEsm` nodes.
	 *
	 * @param tree - The root MDAST node to prepend imports into.
	 */
	injectIntoTree(tree: Root): void {
		// MdxjsEsm nodes are valid RootContent via type augmentation from
		// mdast-util-mdxjs-esm, but the inference doesn't always pick it up.
		// We push into the untyped children array directly.
		const { children } = tree
		for (const { importPath, isNamed, localName } of this.pending.toReversed()) {
			children.unshift(createEsmImportNode(localName, importPath, isNamed))
		}

		this.pending.length = 0
	}
}

/**
 * Check whether a string value looks like a local file path that should be
 * turned into an ESM import, as opposed to a URL, data URI, fragment, or
 * root-absolute path.
 *
 * Returns `false` for values containing `://` (URLs), starting with `data:`
 * (data URIs), starting with `#` (fragment references), or starting with `/`.
 * Astro serves root-absolute paths from `public/`, which Vite refuses to
 * import, so they pass through unchanged just as Astro's own Markdown image
 * handling leaves them alone. This also covers protocol-relative URLs.
 *
 * @param value - The string to check.
 *
 * @returns `true` if the value should be treated as an importable path.
 */
export function isImportablePath(value: string): boolean {
	return (
		!value.includes('://') &&
		!value.startsWith('data:') &&
		!value.startsWith('#') &&
		!value.startsWith('/')
	)
}

/**
 * Minimal importer interface consumed by {@link resolveAutoImportAttributes}.
 *
 * Implemented by {@link ImportTracker} for the remark pipeline and by the
 * Sätteri import tracker for the Sätteri pipeline, so the auto-import
 * resolution logic can be shared between both.
 */
export type AssetImporter = {
	/**
	 * Register an asset import and return the local identifier that references
	 * the imported module.
	 */
	addAssetImport(assetPath: string): string
}

/**
 * Result of resolving auto-import entries against a set of prop values.
 */
type AutoImportResult = {
	/** Generated JSX attributes (expression imports or string fallbacks). */
	attributes: MdxJsxAttribute[]
	/**
	 * Prop names that were consumed from `propValues` or produced as output
	 * attributes. Callers should use this to avoid duplicating these attributes
	 * when forwarding remaining props (e.g. hProperties or directive
	 * attributes).
	 */
	handledProps: ReadonlySet<string>
}

/**
 * Process auto-import entries against a map of prop values, generating JSX
 * attributes and registering ESM imports via the tracker.
 *
 * Each entry reads its source value from `propValues[entry.fromProp]`, making
 * `fromProp` semantically meaningful as "the prop to read the value FROM."
 *
 * Processing uses two passes to establish a clear priority model:
 *
 * 1. **Direct entries** (no `transform`) are processed first. Each reads
 *    `propValues[entry.fromProp]`. When importable, creates an expression
 *    attribute on `toProp` and preserves the original string on `fromProp` if
 *    `fromProp !== toProp`. When not importable, falls back to a string
 *    attribute on `toProp`.
 * 2. **Derived entries** (with `transform`) run second, skipping any whose
 *    `toProp` was already resolved by a direct entry. Before applying the
 *    transform, checks whether `propValues` has an explicit value for `toProp`
 *    (e.g. from `{:srcDark="./explicit.png"}`), which takes priority over the
 *    derived value.
 *
 * Priority: **direct entry > explicit propValues override > derived
 * transform**.
 *
 * @param propValues - Map of prop names to their string values (e.g. `{ src:
 *   './photo.png', srcDark: './dark.png' }`).
 * @param entries - Resolved auto-import entries to process.
 * @param imports - Import tracker for deduplication and injection.
 *
 * @returns Resolved attributes and the set of handled prop names.
 */
export function resolveAutoImportAttributes(
	propValues: Record<string, string>,
	entries: ResolvedAutoImportEntry[],
	imports: AssetImporter,
): AutoImportResult {
	const attributes: MdxJsxAttribute[] = []
	const handledProps = new Set<string>()

	// Pass 1: Direct entries (no transform) — explicit values take priority
	// over derived ones targeting the same toProp.
	for (const entry of entries) {
		if (entry.transform) {
			continue
		}

		const value = propValues[entry.fromProp]
		if (value === undefined) {
			log.debug(
				`Skipping autoImport for "${entry.toProp}" — no value found for "${entry.fromProp}"`,
			)
			continue
		}

		handledProps.add(entry.fromProp)
		handledProps.add(entry.toProp)

		if (isImportablePath(value)) {
			const importId = imports.addAssetImport(value)
			attributes.push(createExpressionAttribute(entry.toProp, importId))
			if (entry.fromProp !== entry.toProp) {
				attributes.push(createStringAttribute(entry.fromProp, value))
			}
		} else {
			log.debug(`Passing "${value}" as string to "${entry.toProp}" — not an importable path`)
			attributes.push(createStringAttribute(entry.toProp, value))
		}
	}

	// Pass 2: Derived entries (with transform) — skip if toProp was already
	// resolved by a direct entry above.
	for (const entry of entries) {
		if (!entry.transform) {
			continue
		}

		if (handledProps.has(entry.toProp)) {
			log.debug(
				`Skipping derived autoImport for "${entry.toProp}" — already resolved by direct entry`,
			)
			continue
		}

		// If propValues has an explicit value for the target prop (even though
		// no direct entry claimed it), prefer it over the derived value. This
		// lets e.g. {:srcDark="./explicit.png"} override a transform that
		// would derive srcDark from src.
		if (entry.fromProp !== entry.toProp) {
			const explicitValue = propValues[entry.toProp]
			if (explicitValue !== undefined) {
				handledProps.add(entry.toProp)
				if (isImportablePath(explicitValue)) {
					const importId = imports.addAssetImport(explicitValue)
					attributes.push(createExpressionAttribute(entry.toProp, importId))
				} else {
					log.debug(
						`Passing explicit "${explicitValue}" as string to "${entry.toProp}" — not an importable path`,
					)
					attributes.push(createStringAttribute(entry.toProp, explicitValue))
				}

				continue
			}
		}

		const sourceValue = propValues[entry.fromProp]
		if (sourceValue === undefined) {
			log.debug(
				`Skipping derived autoImport for "${entry.toProp}" — no value found for "${entry.fromProp}"`,
			)
			continue
		}

		const transformedPath = entry.transform(sourceValue)
		if (transformedPath === undefined) {
			log.debug(
				`Skipping derived autoImport for "${entry.toProp}" — transform returned undefined for "${sourceValue}"`,
			)
			continue
		}

		handledProps.add(entry.toProp)
		const importId = imports.addAssetImport(transformedPath)
		attributes.push(createExpressionAttribute(entry.toProp, importId))
	}

	return { attributes, handledProps }
}
