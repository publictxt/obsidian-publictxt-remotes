// Fork notes in the vault (docs/spec.md → Fork provenance): the Obsidian side of fork-meta.ts.

import type { App } from 'obsidian';
import { readForkMeta, type Fork } from './fork-meta.ts';

/** Every fork note in the vault, from the metadata cache. */
export function scanForks(app: App): Fork[] {
	const forks: Fork[] = [];
	for (const f of app.vault.getMarkdownFiles()) {
		const meta = readForkMeta(app.metadataCache.getFileCache(f)?.frontmatter);
		if (meta) forks.push({ path: f.path, meta });
	}
	return forks;
}
