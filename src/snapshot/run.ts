// Snapshot local sources (docs/spec.md → Snapshot): the Obsidian side of remote/snapshot.ts.

import { App, Notice } from 'obsidian';
import { localIso } from '../fork/fork.ts';
import { gitRunner } from '../remote/git-process.ts';
import { snapshot, type SnapshotResult } from '../remote/snapshot.ts';
import { errorText } from '../remote/vault-host.ts';
import type { Follow } from '../sources/follow-note.ts';
import { scanFollows } from '../sources/follows.ts';
import { isLocalRepo, localRepoPath } from '../sources/repo-url.ts';
import type { PublicTxtData } from '../sources/schema.ts';

/** Folders being snapshotted: git locks the index, so one at a time per folder. */
const busy = new Set<string>();

/** One line for the user about a snapshot of `follow`. */
export function snapshotText(follow: Follow, r: SnapshotResult): string {
	const name = localRepoPath(follow.url);
	if (!r.committed) return `${name}: nothing to snapshot.`;
	const files = r.files === 1 ? '1 file' : `${r.files} files`;
	return `${name}: committed ${files} to ${r.branch} (${r.commit.slice(0, 7)}).`;
}

/** Commits everything changed in a local source's folder, if anything; `null` if a snapshot of it is running. */
export async function snapshotFollow(data: PublicTxtData, follow: Follow): Promise<SnapshotResult | null> {
	if (!isLocalRepo(follow.url)) throw new Error(`Not a local repo: ${follow.url}.`);
	const dir = localRepoPath(follow.url);
	if (busy.has(dir)) return null;
	busy.add(dir);
	try {
		return await snapshot(gitRunner(data.gitPath), dir, follow.branch, `Snapshot ${localIso(new Date())}`);
	} finally {
		busy.delete(dir);
	}
}

/** Every local source among the follow notes. */
export function localFollows(app: App): Follow[] {
	return scanFollows(app).follows.filter((f) => isLocalRepo(f.url));
}

/** Snapshots `follows` in turn and says how each went. Returns whether anything was committed. */
export async function snapshotAndTell(data: PublicTxtData, follows: Follow[]): Promise<boolean> {
	if (follows.length === 0) {
		new Notice('No local sources to snapshot.');
		return false;
	}
	const lines: string[] = [];
	let committed = false;
	for (const follow of follows) {
		try {
			const r = await snapshotFollow(data, follow);
			if (!r) lines.push(`${localRepoPath(follow.url)}: a snapshot is already running.`);
			else {
				committed ||= r.committed;
				lines.push(snapshotText(follow, r));
			}
		} catch (e) {
			lines.push(`${localRepoPath(follow.url)}: ${errorText(e)}`);
		}
	}
	new Notice(lines.join('\n'), 10_000);
	return committed;
}
