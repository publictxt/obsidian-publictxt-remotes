// A check of every source, from the vault (docs/features/check.md): the Obsidian side of check.ts.

import type { App } from 'obsidian';
import { scanForks, scanMirrors } from '../sources/forks.ts';
import { scanFollows } from '../sources/follows.ts';
import type { Follow } from '../sources/follow-note.ts';
import type { PublicTxtData } from '../sources/schema.ts';
import { errorText, vaultHost } from '../remote/vault-host.ts';
import type { RemoteHost } from '../remote/host.ts';
import type { SourceTags } from '../tags/run.ts';
import { checkSource, type SourceCheck } from './check.ts';

/** One source's part of a run. Never changed in place: the plugin puts a new one in a new run. */
export type SourceResult = Readonly<{ follow: Follow; check: SourceCheck; error: null } | { follow: Follow; check: null; error: string }>;

export interface CheckRun {
	/** ISO datetime the run started. */
	at: string;
	results: readonly SourceResult[];
	/** Follow notes ignored: duplicates and invalid. */
	ignored: number;
}

/**
 * Checks each source in turn (one git process at a time). The state to save comes after, from
 * the state as it is then (`checkedAll` in check.ts).
 */
export async function runCheck(app: App, data: PublicTxtData, tags: SourceTags, progress: (done: number, total: number) => void): Promise<CheckRun> {
	const host = vaultHost(app, data);
	const scan = scanFollows(app);
	const forks = scanForks(app);
	const mirrors = scanMirrors(app);
	const at = new Date().toISOString();

	const results: SourceResult[] = [];
	for (const [i, follow] of scan.follows.entries()) {
		progress(i, scan.follows.length);
		results.push(await checkFollow(host, data, tags, follow, forks, mirrors));
	}
	progress(scan.follows.length, scan.follows.length);
	return { at, results, ignored: scan.duplicates.length + scan.invalid.length };
}

/** One source's check, an error as its result. With followed tags, it reads the changed pages' tags. */
async function checkFollow(host: RemoteHost, data: PublicTxtData, tags: SourceTags, follow: Follow, forks: ReturnType<typeof scanForks>, mirrors: ReturnType<typeof scanMirrors>): Promise<SourceResult> {
	try {
		const state = data.state[follow.url];
		const check = await checkSource(host, follow, state, forks, mirrors);
		if (!follow.followTags.length) return { follow, check, error: null };
		return { follow, check: { ...check, followed: await tags.followed(check, follow.followTags, state?.seenCommit ?? null) }, error: null };
	} catch (e) {
		return { follow, check: null, error: errorText(e) };
	}
}

/** Checks the one source `follow` again, as `runCheck` does each: for a run's result to be replaced with. */
export function checkOne(app: App, data: PublicTxtData, tags: SourceTags, follow: Follow): Promise<SourceResult> {
	return checkFollow(vaultHost(app, data), data, tags, follow, scanForks(app), scanMirrors(app));
}
