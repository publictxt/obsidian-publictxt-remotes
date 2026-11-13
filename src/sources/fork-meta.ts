// A fork's or a mirror's provenance in front matter (docs/spec.md → Fork provenance, Mirror). Pure.

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

/**
 * A mirror's provenance (`mirror_*`): where upstream's copy came from. Nothing to see: an update
 * overwrites it.
 */
export type MirrorMeta = Omit<ForkMeta, 'seen'>;

/** A mirror note and its provenance. */
export interface Mirror {
	path: string;
	meta: MirrorMeta;
}

/** A mirror's front matter keys, in the order they're written. */
export const MIRROR_KEYS = [
	'mirror_remote',
	'mirror_repo',
	'mirror_path',
	'mirror_branch',
	'mirror_commit',
	'mirror_blob',
	'mirror_date',
] as const;

/** Every key the plugin writes into a fork or a mirror: none of them is the note's own text. */
export const PROVENANCE_KEYS: readonly string[] = [...FORK_KEYS, ...MIRROR_KEYS];

/** The provenance under `fork_*` or `mirror_*`, or `null` if it isn't valid: a remote or a repo, a path and a blob. */
function readProvenance(fm: Record<string, unknown>, kind: 'fork' | 'mirror'): MirrorMeta | null {
	const [fmRemote, fmRepo, blob, commit] = [fm[`${kind}_remote`], fm[`${kind}_repo`], fm[`${kind}_blob`], fm[`${kind}_commit`]];
	const remote = typeof fmRemote === 'string' && !remoteNameProblem(fmRemote) ? fmRemote : null;
	const repo = typeof fmRepo === 'string' ? canonicalRepoUrl(fmRepo) : null;
	const path = repoPath(fm[`${kind}_path`]);
	if ((!remote && !repo) || !path || !isSha(blob)) return null;
	return {
		remote,
		repo,
		path,
		blob,
		branch: str(fm[`${kind}_branch`]),
		commit: isSha(commit) ? commit : null,
		// YAML 1.1 parsers may hand back a Date; spec says use the value as written.
		date: str(fm[`${kind}_date`]),
	};
}

/** A note's provenance, or `null` if it isn't a valid fork: a remote or a repo, a path and a blob. */
export function readForkMeta(fm: Record<string, unknown> | null | undefined): ForkMeta | null {
	const meta = fm ? readProvenance(fm, 'fork') : null;
	if (!fm || !meta) return null;
	return { ...meta, seen: isSha(fm.fork_seen) || fm.fork_seen === SEEN_GONE ? fm.fork_seen : null };
}

/** A note's provenance as a mirror, or `null` if it isn't one. A note with valid `fork_*` keys is a fork, whatever else it has. */
export function readMirrorMeta(fm: Record<string, unknown> | null | undefined): MirrorMeta | null {
	if (!fm || readProvenance(fm, 'fork')) return null;
	return readProvenance(fm, 'mirror');
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

/** The keys to write into a mirror's front matter, in `MIRROR_KEYS` order; `null` fields are omitted. */
export function mirrorMetaProps(m: MirrorMeta): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, v] of Object.entries(forkMetaProps({ ...m, seen: null }))) out[key.replace(/^fork_/, 'mirror_')] = v;
	return out;
}

/**
 * Writes `m` into `front` in place: its keys set, every other `fork_*` and `mirror_*` key removed.
 * So a fork of a fork never keeps the upstream's provenance (a local fork has no `fork_repo`),
 * and a mirror that is forked stops being a mirror.
 */
export function writeForkMeta(front: Record<string, unknown>, m: ForkMeta): void {
	clearProvenance(front);
	Object.assign(front, forkMetaProps(m));
}

/** Writes `m` into `front` in place as a mirror's provenance; every other `mirror_*` and `fork_*` key is removed. */
export function writeMirrorMeta(front: Record<string, unknown>, m: MirrorMeta): void {
	clearProvenance(front);
	Object.assign(front, mirrorMetaProps(m));
}

/** Removes every `fork_*` and `mirror_*` key from `front` in place. */
export function clearProvenance(front: Record<string, unknown>): void {
	for (const key of PROVENANCE_KEYS) delete front[key];
}

/** Sets `fork_seen` in `front` in place: the note is settled for that upstream version, its text untouched. */
export function setForkSeen(front: Record<string, unknown>, seen: string): void {
	front.fork_seen = seen;
}

/** Removes every `fork_*` key from `front` in place: the note is no longer a fork. */
export function clearForkMeta(front: Record<string, unknown>): void {
	for (const key of FORK_KEYS) delete front[key];
}
