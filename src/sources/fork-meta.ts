// A fork's provenance in front matter (docs/spec.md → Fork provenance). Pure.

import { canonicalRepoUrl, remoteNameProblem } from './repo-url.ts';
import { isSha, repoPath, str } from '../util/validate.ts';

export interface ForkMeta {
	/** The follow note's remote name (`fork_remote`); `null` in forks made before names. */
	remote: string | null;
	/** Canonical repo URL (`fork_repo`); `null` for a local source, which has no public URL. */
	repo: string | null;
	path: string;
	blob: string;
	branch: string | null;
	commit: string | null;
	/** ISO datetime as written. */
	date: string | null;
	/**
	 * The upstream blob the user last dealt with without taking it (`fork_seen`), or `gone` for a
	 * file removed upstream. `fork_blob` stays what the note's text came from.
	 */
	seen: string | null;
}

/** A fork note and its provenance. */
export interface Fork {
	path: string;
	meta: ForkMeta;
}

/** `fork_seen` for a file that is gone upstream. */
export const SEEN_GONE = 'gone';

/** Front matter keys, in the order they're written. */
export const FORK_KEYS = [
	'fork_remote',
	'fork_repo',
	'fork_path',
	'fork_branch',
	'fork_commit',
	'fork_blob',
	'fork_date',
	'fork_seen',
] as const;

export type ForkKey = (typeof FORK_KEYS)[number];

/** A note's provenance, or `null` if it isn't a valid fork: a remote or a repo, a path and a blob. */
export function readForkMeta(fm: Record<string, unknown> | null | undefined): ForkMeta | null {
	if (!fm) return null;
	const remote = typeof fm.fork_remote === 'string' && !remoteNameProblem(fm.fork_remote) ? fm.fork_remote : null;
	const repo = typeof fm.fork_repo === 'string' ? canonicalRepoUrl(fm.fork_repo) : null;
	const path = repoPath(fm.fork_path);
	if ((!remote && !repo) || !path || !isSha(fm.fork_blob)) return null;
	return {
		remote,
		repo,
		path,
		blob: fm.fork_blob,
		branch: str(fm.fork_branch),
		commit: isSha(fm.fork_commit) ? fm.fork_commit : null,
		// YAML 1.1 parsers may hand back a Date; spec says use the value as written.
		date: str(fm.fork_date),
		seen: isSha(fm.fork_seen) || fm.fork_seen === SEEN_GONE ? fm.fork_seen : null,
	};
}

/**
 * The keys to write into a note's front matter, in `FORK_KEYS` order. `null` fields are omitted;
 * write them with `writeForkMeta`, which also removes them.
 */
export function forkMetaProps(m: ForkMeta): Record<string, string> {
	const values: Record<ForkKey, string | null> = {
		fork_remote: m.remote,
		fork_repo: m.repo,
		fork_path: m.path,
		fork_branch: m.branch,
		fork_commit: m.commit,
		fork_blob: m.blob,
		fork_date: m.date,
		fork_seen: m.seen,
	};
	const out: Record<string, string> = {};
	for (const key of FORK_KEYS) {
		const v = values[key];
		if (v) out[key] = v;
	}
	return out;
}

/**
 * Writes `m` into `front` in place: its keys set, every other `fork_*` key removed, so a fork of a
 * fork never keeps the upstream's provenance (a local fork has no `fork_repo`).
 */
export function writeForkMeta(front: Record<string, unknown>, m: ForkMeta): void {
	clearForkMeta(front);
	Object.assign(front, forkMetaProps(m));
}

/** Sets `fork_seen` in `front` in place: the note is settled for that upstream version, its text untouched. */
export function setForkSeen(front: Record<string, unknown>, seen: string): void {
	front.fork_seen = seen;
}

/** Removes every `fork_*` key from `front` in place: the note is no longer a fork. */
export function clearForkMeta(front: Record<string, unknown>): void {
	for (const key of FORK_KEYS) delete front[key];
}
