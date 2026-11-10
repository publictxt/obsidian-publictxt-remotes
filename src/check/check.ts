// One check of one source: what's new, watched, forks (docs/spec.md → Check). Pure: the remote
// host is passed in, so tests use a fake one.

import type { ForkMeta } from '../sources/fork-meta.ts';
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

export interface ForkChange {
	fork: Fork;
	status: 'modified' | 'removed';
	/** Blob of `fork_path` at head; `null` when removed. */
	blob: string | null;
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

	const forkChanges: ForkChange[] = [];
	for (const fork of forks) {
		if (!isForkOf(fork.meta, source)) continue;
		const blob = files.get(fork.meta.path) ?? null;
		if (!blob) forkChanges.push({ fork, status: 'removed', blob });
		else if (blob !== fork.meta.blob) forkChanges.push({ fork, status: 'modified', blob });
	}

	return { url: source.url, head, changes: inScope, reason, watched, forks: forkChanges, watchedBlobs };
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
