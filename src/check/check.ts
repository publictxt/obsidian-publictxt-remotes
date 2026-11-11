// One check of one source: what's new, watched, forks (docs/spec.md → Check). Pure: the remote
// host is passed in, so tests use a fake one.

import { SEEN_GONE, type Fork, type ForkMeta } from '../sources/fork-meta.ts';
import type { Source, SourceState } from '../sources/schema.ts';
import type { Change, Head, RemoteHost } from '../remote/host.ts';
import { isForkOf, type Remote } from '../fork/fork.ts';

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

/** What one check of a source found. Never changed in place. */
export interface SourceCheck {
	readonly url: string;
	readonly head: Head;
	/** Changes since `seenCommit`, within `include`. */
	readonly changes: readonly Change[];
	/** Set when `changes` lists every file in `include`. */
	readonly reason: NewReason | null;
	readonly watched: readonly WatchedChange[];
	readonly forks: readonly ForkChange[];
	/** Every upstream path the user has a fork of, changed or not: the view marks those files. */
	readonly forked: ReadonlySet<string>;
	/** Blob at head per watched path that exists there: what acknowledging stores. */
	readonly watchedBlobs: Readonly<Record<string, string>>;
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

	const byPath = copiesByPath(source, forks);
	return { url: source.url, head, changes: inScope, reason, watched, forks: forkChanges(byPath, files), forked: new Set(byPath.keys()), watchedBlobs };
}

/** This source's forks by the upstream file they came from: that file's copies. */
function copiesByPath(source: Remote, forks: readonly Fork[]): Map<string, Fork[]> {
	const byPath = new Map<string, Fork[]>();
	for (const fork of forks) {
		if (!isForkOf(fork.meta, source)) continue;
		const copies = byPath.get(fork.meta.path);
		if (copies) copies.push(fork);
		else byPath.set(fork.meta.path, [fork]);
	}
	return byPath;
}

/** The upstream files that changed under their copies, by path: listed while any copy isn't settled for what is at head. */
function forkChanges(byPath: ReadonlyMap<string, Fork[]>, files: ReadonlyMap<string, string>): ForkChange[] {
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

/**
 * Every source's state after a run that started at `at`, from the state as it is now (`state`):
 * `checkedAt` moves for each source checked (`ok`), one that failed keeps what it has, and one
 * not in `sources` (no longer followed) is dropped. From the state now, not as it was when the
 * run started: what the user acknowledged while it ran stays.
 */
export function checkedAll(state: Readonly<Record<string, SourceState>>, sources: readonly { url: string; ok: boolean }[], at: string): Record<string, SourceState> {
	const out: Record<string, SourceState> = {};
	for (const s of sources) {
		const now = state[s.url];
		if (s.ok) out[s.url] = checked(now, at);
		else if (now) out[s.url] = now;
	}
	return out;
}

/** State after acknowledging a check: `seenCommit` and `watched` move to head. */
export function acknowledged(c: SourceCheck, at: string): SourceState {
	return { seenCommit: c.head.commit, watched: { ...c.watchedBlobs }, checkedAt: at };
}

/** Whether a check found anything to show. */
export function hasNews(c: SourceCheck): boolean {
	return c.changes.length > 0 || c.watched.length > 0 || c.forks.length > 0;
}
