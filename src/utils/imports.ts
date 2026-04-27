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

/**
 * Tracks component and asset imports accumulated during a single MDX file's
 * transform pass, deduplicating identical imports.
 *
 * Use {@link addComponentImport} and {@link addAssetImport} to register imports
 * during tree traversal, then call {@link injectIntoTree} once at the end to
 * prepend all collected import statements to the AST.
 */
export class ImportTracker {
	private readonly assetImports = new Map<string, string>()
	private readonly importKeys = new Set<string>()
	private readonly imports: TrackedImport[] = []

	/**
	 * Register an asset import (e.g. an image path like `'./photo.jpg'`).
	 *
	 * Returns the local identifier name that will reference the imported module.
	 * If the same `assetPath` was already registered, the existing identifier is
	 * returned (deduplication).
	 *
	 * @param assetPath - The path to import (e.g. `'./hero.png'`).
	 *
	 * @returns The generated local identifier (e.g.
	 *   `'_mdxKitAssetV1StGXR8aZ5j'`).
	 */
	addAssetImport(assetPath: string): string {
		const existing = this.assetImports.get(assetPath)
		if (existing) {
			return existing
		}

		const name = `_mdxKitAsset${Math.random().toString(36).slice(2, 14)}`
		this.assetImports.set(assetPath, name)
		this.imports.push({ importPath: assetPath, isNamed: false, localName: name })
		return name
	}

	/**
	 * Register a component import. Duplicate registrations (same localName +
	 * importPath + kind) are silently ignored.
	 *
	 * @param localName - The local identifier for the component (e.g.
	 *   `'Picture'`).
	 * @param importPath - The module specifier (e.g. `'astro:assets'` or
	 *   `'/src/components/Foo.astro'`).
	 * @param isNamed - `true` for named imports, `false` for default imports.
	 */
	addComponentImport(localName: string, importPath: string, isNamed: boolean): void {
		const key = `${isNamed ? 'named' : 'default'}|${localName}|${importPath}`
		if (this.importKeys.has(key)) {
			return
		}

		this.importKeys.add(key)
		this.imports.push({ importPath, isNamed, localName })
	}

	/**
	 * Prepend all tracked import statements to the MDAST tree's children as
	 * `mdxjsEsm` nodes. Call this once after all imports have been registered.
	 *
	 * @param tree - The root MDAST node to prepend imports into.
	 */
	injectIntoTree(tree: Root): void {
		if (this.imports.length === 0) {
			return
		}

		// MdxjsEsm nodes are valid RootContent via type augmentation from
		// mdast-util-mdxjs-esm, but the inference doesn't always pick it up.
		// We push into the untyped children array directly.
		const { children } = tree
		for (const { importPath, isNamed, localName } of this.imports.toReversed()) {
			children.unshift(createEsmImportNode(localName, importPath, isNamed))
		}
	}
}

/**
 * Check whether a string value looks like a local file path that should be
 * turned into an ESM import, as opposed to a URL, data URI, or fragment.
 *
 * Returns `false` for values containing `://` (URLs), starting with `data:`
 * (data URIs), or starting with `#` (fragment references).
 *
 * @param value - The string to check.
 *
 * @returns `true` if the value should be treated as an importable path.
 */
export function isImportablePath(value: string): boolean {
	if (value.includes('://')) {
		return false
	}

	if (value.startsWith('data:')) {
		return false
	}

	if (value.startsWith('#')) {
		return false
	}

	return true
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
	imports: ImportTracker,
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
