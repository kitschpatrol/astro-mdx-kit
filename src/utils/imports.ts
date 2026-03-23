import type { Root } from 'mdast'
import { createEsmImportNode } from './ast.js'

type TrackedImport = {
	importPath: string
	isNamed: boolean
	localName: string
}

/**
 * Tracks component and asset imports accumulated during a single MDX file's
 * transform pass, deduplicating identical imports.
 *
 * Use {@link addComponentImport} and {@link addAssetImport} to register
 * imports during tree traversal, then call {@link injectIntoTree} once
 * at the end to prepend all collected import statements to the AST.
 */
export class ImportTracker {
	private assetCounter = 0
	private readonly assetImports = new Map<string, string>()
	private readonly importKeys = new Set<string>()
	private readonly imports: TrackedImport[] = []

	/**
	 * Register an asset import (e.g. an image path like `'./photo.jpg'`).
	 *
	 * Returns the local identifier name that will reference the imported
	 * module. If the same `assetPath` was already registered, the
	 * existing identifier is returned (deduplication).
	 * @param assetPath - The path to import (e.g. `'./hero.png'`).
	 * @returns The generated local identifier (e.g. `'_mdxKitAsset0'`).
	 */
	addAssetImport(assetPath: string): string {
		const existing = this.assetImports.get(assetPath)
		if (existing) return existing

		const name = `_mdxKitAsset${this.assetCounter++}`
		this.assetImports.set(assetPath, name)
		this.imports.push({ importPath: assetPath, isNamed: false, localName: name })
		return name
	}

	/**
	 * Register a component import. Duplicate registrations (same
	 * localName + importPath + kind) are silently ignored.
	 * @param localName - The local identifier for the component (e.g. `'Picture'`).
	 * @param importPath - The module specifier (e.g. `'astro:assets'` or `'/src/components/Foo.astro'`).
	 * @param isNamed - `true` for named imports, `false` for default imports.
	 */
	addComponentImport(localName: string, importPath: string, isNamed: boolean): void {
		const key = `${isNamed ? 'named' : 'default'}|${localName}|${importPath}`
		if (this.importKeys.has(key)) return
		this.importKeys.add(key)
		this.imports.push({ importPath, isNamed, localName })
	}

	/**
	 * Prepend all tracked import statements to the MDAST tree's children
	 * as `mdxjsEsm` nodes. Call this once after all imports have been registered.
	 * @param tree - The root MDAST node to prepend imports into.
	 */
	injectIntoTree(tree: Root): void {
		if (this.imports.length === 0) return

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
 * Returns `false` for values containing `://` (URLs), starting with
 * `data:` (data URIs), or starting with `#` (fragment references).
 * @param value - The string to check.
 * @returns `true` if the value should be treated as an importable path.
 */
export function isImportablePath(value: string): boolean {
	if (value.includes('://')) return false
	if (value.startsWith('data:')) return false
	if (value.startsWith('#')) return false
	return true
}
