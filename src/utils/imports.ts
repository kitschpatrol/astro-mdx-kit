import type { Root } from 'mdast'
import { createEsmImportNode } from './ast.js'

interface TrackedImport {
	localName: string
	importPath: string
	isNamed: boolean
}

/**
 * Tracks component and asset imports for a single MDX file,
 * deduplicating identical imports.
 */
export class ImportTracker {
	private readonly importKeys = new Set<string>()
	private readonly imports: TrackedImport[] = []
	private readonly assetImports = new Map<string, string>()
	private assetCounter = 0

	/**
	 * Register a component import.  Duplicate registrations (same
	 * localName + importPath + kind) are silently ignored.
	 */
	addComponentImport(localName: string, importPath: string, isNamed: boolean): void {
		const key = `${isNamed ? 'named' : 'default'}|${localName}|${importPath}`
		if (this.importKeys.has(key)) return
		this.importKeys.add(key)
		this.imports.push({ localName, importPath, isNamed })
	}

	/**
	 * Register an asset import (e.g. an image path).
	 *
	 * Returns the local identifier name that will reference the imported
	 * module.  If the same `assetPath` was already registered, the
	 * existing identifier is returned (deduplication).
	 */
	addAssetImport(assetPath: string): string {
		const existing = this.assetImports.get(assetPath)
		if (existing) return existing

		const name = `_mdxKitAsset${this.assetCounter++}`
		this.assetImports.set(assetPath, name)
		this.imports.push({ localName: name, importPath: assetPath, isNamed: false })
		return name
	}

	/**
	 * Prepend all tracked import statements to the tree's children.
	 */
	injectIntoTree(tree: Root): void {
		if (this.imports.length === 0) return

		const nodes = this.imports.map(({ localName, importPath, isNamed }) =>
			createEsmImportNode(localName, importPath, isNamed),
		)

		// Unshift so imports appear before any content
		// Cast needed because MdxjsEsm is part of the MDX AST extension
		tree.children.unshift(...(nodes as unknown as Root['children']))
	}
}

/**
 * Check whether a string value looks like a path that should be
 * turned into an ESM import (as opposed to a plain string value
 * like a URL or keyword).
 */
export function isImportablePath(value: string): boolean {
	if (value.includes('://')) return false
	if (value.startsWith('data:')) return false
	if (value.startsWith('#')) return false
	return true
}
