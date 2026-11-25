// Updating a fork from upstream (docs/features/fork-update.md): what a compare is of, and the names,
// provenance and sentences the actions need. Pure.

import type { DiffStat, Head } from '../remote/host.ts';
import type { ForkMeta } from '../sources/fork-meta.ts';
import { isRecord, isSha, repoPath, str } from '../util/validate.ts';
import { localIso } from '../util/time.ts';

/** What a compare shows: an upstream file as it is at a head, beside one note forked from it. */
export interface Compare {
	/** The source's key (`Source.url`). */
	source: string;
	/** The upstream file (`fork_path`). */
	path: string;
	/** Its blob at the head. */
	blob: string;
	/** The head it was read at: what an overwrite or an alongside note records. */
	branch: string;
	commit: string;
	/** The vault path of the copy it is compared with. */
	note: string;
}

/** A compare from a saved view state, or `null` if it isn't one. */
export function readCompare(state: unknown): Compare | null {
	if (!isRecord(state)) return null;
	const [source, path, branch, note] = [str(state.source), repoPath(state.path), str(state.branch), str(state.note)];
	const { blob, commit } = state;
	if (!source || !path || !branch || !note || !isSha(blob) || !isSha(commit)) return null;
	return { source, path, blob, branch, commit, note };
}

/**
 * Where upstream is written beside the note at `notePath`: its name with any ` (up-nn)` ending
 * dropped, then ` (up-01)`, ` (up-02)`, … the first that is free. So `a (up-01).md` gives
 * `a (up-02).md`, not `a (up-01) (up-01).md`.
 */
export function alongsidePath(notePath: string, taken: (p: string) => boolean): string {
	const stem = notePath.replace(/\.md$/i, '').replace(/ \(up-\d+\)$/, '');
	for (let n = 1; ; n++) {
		const p = `${stem} (up-${String(n).padStart(2, '0')}).md`;
		if (!taken(p)) return p;
	}
}

/** A fork's provenance after its text is replaced by `blob` at `head`: where it came from stays, nothing is left to see. */
export function updatedMeta(old: ForkMeta, head: Pick<Head, 'branch' | 'commit'>, blob: string, now: Date): ForkMeta {
	return { remote: old.remote, repo: old.repo, path: old.path, branch: head.branch, commit: head.commit, blob, date: localIso(now), seen: null };
}

/** How far upstream has moved since the fork, as a sentence. `null`: the forked version can't be read. */
export function changedText(stat: DiffStat | null): string {
	if (!stat) return 'Can\'t tell what changed: the version you forked is gone upstream.';
	if (stat.added === 0 && stat.removed === 0) return 'No lines changed since you forked.';
	const lines = (n: number) => `${n} ${n === 1 ? 'line' : 'lines'}`;
	return `${lines(stat.added)} added, ${stat.removed} removed since you forked.`;
}

/** Whether the copy was edited, as a sentence. `null`: can't tell. */
export function editedText(edited: boolean | null): string {
	if (edited === null) return 'Can\'t tell whether your copy is edited.';
	return edited ? 'Your copy is edited.' : 'Your copy is as you forked it.';
}
