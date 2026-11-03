// A check of every source, from the vault (docs/spec.md → Check): the Obsidian side of check.ts.

import { App, FileSystemAdapter } from 'obsidian';
import { readForkMeta } from '../sources/fork-meta.ts';
import { scanFollows } from '../sources/follows.ts';
import type { Follow } from '../sources/follow-note.ts';
import type { PublicTxtData } from '../sources/schema.ts';
import { gitHost } from '../remote/git-process.ts';
import { RemoteError } from '../remote/host.ts';
import { checkSource, checked, type Fork, type SourceCheck } from './check.ts';

export type SourceResult = { follow: Follow; check: SourceCheck; error: null } | { follow: Follow; check: null; error: string };

export interface CheckRun {
	/** ISO datetime the run started. */
	at: string;
	results: SourceResult[];
	/** Follow notes ignored: duplicates and invalid. */
	ignored: number;
}

/** Every fork note in the vault, from the metadata cache. */
export function scanForks(app: App): Fork[] {
	const forks: Fork[] = [];
	for (const f of app.vault.getMarkdownFiles()) {
		const meta = readForkMeta(app.metadataCache.getFileCache(f)?.frontmatter);
		if (meta) forks.push({ path: f.path, meta });
	}
	return forks;
}

/**
 * Checks each source in turn (one git process at a time) and returns the results with the state
 * to save: `checkedAt` moved for each source checked, state for unfollowed sources dropped.
 */
export async function runCheck(app: App, data: PublicTxtData, progress: (done: number, total: number) => void): Promise<{ run: CheckRun; state: PublicTxtData['state'] }> {
	const adapter = app.vault.adapter;
	if (!(adapter instanceof FileSystemAdapter)) throw new Error('Checking needs the desktop app.');
	const host = gitHost(data.gitPath, adapter.getBasePath(), data.remotesFolder);
	const scan = scanFollows(app);
	const forks = scanForks(app);
	const at = new Date().toISOString();

	const results: SourceResult[] = [];
	const state: PublicTxtData['state'] = {};
	for (const [i, follow] of scan.follows.entries()) {
		progress(i, scan.follows.length);
		const before = data.state[follow.url];
		try {
			const check = await checkSource(host, follow, before, forks);
			results.push({ follow, check, error: null });
			state[follow.url] = checked(before, at);
		} catch (e) {
			results.push({ follow, check: null, error: message(e) });
			if (before) state[follow.url] = before;
		}
	}
	progress(scan.follows.length, scan.follows.length);
	return { run: { at, results, ignored: scan.duplicates.length + scan.invalid.length }, state };
}

function message(e: unknown): string {
	if (e instanceof RemoteError && e.kind === 'no-git') return `${e.message}. Set the git executable in settings.`;
	return e instanceof Error ? e.message : String(e);
}
