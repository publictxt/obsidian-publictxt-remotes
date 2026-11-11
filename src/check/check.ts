// One check of one source: what's new, watched, forks (docs/spec.md → Check). Pure: the remote
// host is passed in, so tests use a fake one.

import { SEEN_GONE, type ForkMeta } from '../sources/fork-meta.ts';
import type { Source, SourceState } from '../sources/schema.ts';
import type { Change, Head, RemoteHost } from '../remote/host.ts';
import { isForkOf, type Remote } from '../fork/fork.ts';

/** A fork note and its provenance. */
export interface Fork {
	path: string;
	meta: ForkMeta;
}

/** Why "what's new" lists every file instead of the changes. */
export type NewReason = 'first-check' | 'history-rewritten';

export interface WatchedChange {
	path: string;
	/** `new`: never acknowledged. `removed`: not at head. */
	status: 'new' | 'modified' | 'removed';
	/** Blob at head; `null` when removed. */
	blob: string | null;
}

/** An upstream file that changed under the notes forked from it. */
export interface ForkChange {
	/** The upstream file (`fork_path`). */
	path: string;
	status: 'modified' | 'removed';
	/** Blob of `path` at head; `null` when removed. */
	blob: string | null;
	/** The notes forked from it, latest first. */
	copies: Fork[];
}

export interface SourceCheck {
	url: string;
	head: Head;
	/** Changes since `seenCommit`, within `include`. */
	changes: Change[];
	/** Set when `changes` lists every file in `include`. */
	reason: NewReason | null;
	watched: WatchedChange[];
	forks: ForkChange[];
	/** Blob at head per watched path that exists there: what acknowledging stores. */
	watchedBlobs: Record<string, string>;
}

/** A path within `include` prefixes; empty `include`: the whole repo. */
export function inInclude(path: string, include: readonly string[]): boolean {
	return include.length === 0 || include.some((p) => path.startsWith(p));
}

export async function checkSource(host: RemoteHost, source: Source & Remote, state: SourceState | undefined, forks: readonly Fork[]): Promise<SourceCheck> {
	const head = await host.head(source.url, source.branch);
	const { files } = await host.tree(source.url, head.tree);
	const seen = state?.seenCommit ?? null;

	let changes: Change[] | null = [];
	let reason: NewReason | null = null;
	if (seen === null) reason = 'first-check';
	else if (seen !== head.commit) {
		changes = await host.changes(source.url, seen, head.commit);
		if (changes === null) reason = 'history-rewritten';
	}
	if (reason) changes = [...files.keys()].sort().map((path) => ({ path, status: 'added' as const, from: null }));
	const inScope = (changes ?? []).filter((c) => inInclude(c.path, source.include) || (c.from !== null && inInclude(c.from, source.include)));

	const watched: WatchedChange[] = [];
	const watchedBlobs: Record<string, string> = {};
	for (const path of source.watch) {
		const blob = files.get(path) ?? null;
		const before = state?.watched[path];
		if (blob) watchedBlobs[path] = blob;
		if (!blob) watched.push({ path, status: 'removed', blob });
		else if (before === undefined) watched.push({ path, status: 'new', blob });
		else if (before !== blob) watched.push({ path, status: 'modified', blob });
	}

	return { url: source.url, head, changes: inScope, reason, watched, forks: forkChanges(source, files, forks), watchedBlobs };
}

/**
 * The upstream files that changed under this source's forks, by path. The notes forked from one
 * file are its copies; the file is listed while any of them isn't settled for what is at head.
 */
function forkChanges(source: Remote, files: ReadonlyMap<string, string>, forks: readonly Fork[]): ForkChange[] {
	const byPath = new Map<string, Fork[]>();
	for (const fork of forks) {
		if (!isForkOf(fork.meta, source)) continue;
		const copies = byPath.get(fork.meta.path);
		if (copies) copies.push(fork);
		else byPath.set(fork.meta.path, [fork]);
	}
	const out: ForkChange[] = [];
	for (const path of [...byPath.keys()].sort()) {
		const copies = byPath.get(path) ?? [];
		const blob = files.get(path) ?? null;
		if (copies.every((f) => isSettled(f.meta, blob))) continue;
		out.push({ path, status: blob ? 'modified' : 'removed', blob, copies: latestFirst(copies) });
	}
	return out;
}

/**
 * Whether a fork needs nothing done about the upstream `blob` (`null`: the file is gone): its
 * text came from it, or the user has dealt with it (`fork_seen`).
 */
export function isSettled(meta: ForkMeta, blob: string | null): boolean {
	if (blob === null) return meta.seen === SEEN_GONE;
	return meta.blob === blob || meta.seen === blob;
}

/** Forks by `fork_date`, newest first; one without a date is older than any with; ties by path, in byte order. */
export function latestFirst(forks: readonly Fork[]): Fork[] {
	const time = (f: Fork) => {
		const t = f.meta.date === null ? NaN : Date.parse(f.meta.date);
		return Number.isNaN(t) ? -Infinity : t;
	};
	return [...forks].sort((a, b) => {
		const [ta, tb] = [time(a), time(b)];
		if (ta !== tb) return ta > tb ? -1 : 1;
		return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
	});
}

/** State after a check, before it is acknowledged: only `checkedAt` moves. */
export function checked(state: SourceState | undefined, at: string): SourceState {
	return { seenCommit: state?.seenCommit ?? null, watched: { ...(state?.watched ?? {}) }, checkedAt: at };
}

/** State after acknowledging a check: `seenCommit` and `watched` move to head. */
export function acknowledged(c: SourceCheck, at: string): SourceState {
	return { seenCommit: c.head.commit, watched: { ...c.watchedBlobs }, checkedAt: at };
}

/** Whether a check found anything to show. */
export function hasNews(c: SourceCheck): boolean {
	return c.changes.length > 0 || c.watched.length > 0 || c.forks.length > 0;
}
