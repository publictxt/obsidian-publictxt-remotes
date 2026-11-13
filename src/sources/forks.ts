// Fork and mirror notes in the vault (docs/spec.md → Fork provenance, Mirror): the Obsidian side of fork-meta.ts.

import type { App } from 'obsidian';
import { readForkMeta, readMirrorMeta, type Fork, type Mirror } from './fork-meta.ts';

/** Every fork note in the vault, from the metadata cache. */
export function scanForks(app: App): Fork[] {
	const forks: Fork[] = [];
	for (const f of app.vault.getMarkdownFiles()) {
		const meta = readForkMeta(app.metadataCache.getFileCache(f)?.frontmatter);
		if (meta) forks.push({ path: f.path, meta });
	}
	return forks;
}

/** Every mirror note in the vault, from the metadata cache. */
export function scanMirrors(app: App): Mirror[] {
	const mirrors: Mirror[] = [];
	for (const f of app.vault.getMarkdownFiles()) {
		const meta = readMirrorMeta(app.metadataCache.getFileCache(f)?.frontmatter);
		if (meta) mirrors.push({ path: f.path, meta });
	}
	return mirrors;
}
