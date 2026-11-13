// One check of one source: what's new, mirrors, forks (docs/spec.md → Check). Pure: the remote
// host is passed in, so tests use a fake one.

import { SEEN_GONE, type Fork, type ForkMeta, type Mirror } from '../sources/fork-meta.ts';
import type { Source, SourceState } from '../sources/schema.ts';
import type { Change, Head, RemoteHost } from '../remote/host.ts';
import { isForkOf, type Remote } from '../fork/fork.ts';

/** Why "what's new" lists every file instead of the changes. */
export type NewReason = 'first-check' | 'history-rewritten';

/** An upstream file that changed under its mirrors: they hold an older version, or it is gone. */
export interface MirrorChange {
	/** The upstream file (`mirror_path`). */
	path: string;
	status: 'modified' | 'removed';
	/** Blob of `path` at head; `null` when removed. */
	blob: string | null;
	/** Its mirrors that aren't that version, by vault path. One, unless a mirror was copied by hand. */
	notes: Mirror[];
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
	readonly mirrors: readonly MirrorChange[];
	/** Every upstream path the user mirrors, changed or not → its mirror note (the first by path). */
	readonly mirrored: ReadonlyMap<string, string>;
	readonly forks: readonly ForkChange[];
	/** Every upstream path the user has a fork of, changed or not: the view marks those files. */
	readonly forked: ReadonlySet<string>;
	/** Every file at head within `include`, sorted: what "all files" lists, whatever was seen. */
	readonly files: readonly string[];
}

/** A path within `include` prefixes; empty `include`: the whole repo. */
export function inInclude(path: string, include: readonly string[]): boolean {
	return include.length === 0 || include.some((p) => path.startsWith(p));
}

export async function checkSource(host: RemoteHost, source: Source & Remote, state: SourceState | undefined, forks: readonly Fork[], mirrors: readonly Mirror[] = []): Promise<SourceCheck> {
	const head = await host.head(source.url, source.branch);
	const { files } = await host.tree(source.url, head.tree);
	const all = [...files.keys()].filter((p) => inInclude(p, source.include)).sort();
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

	const byPath = copiesByPath(source, forks);
	const mine = mirrorsByPath(source, mirrors);
	const mirrored = new Map([...mine].map(([path, notes]) => [path, notes[0]?.path ?? '']));
	return { url: source.url, head, changes: inScope, reason, mirrors: mirrorChanges(mine, files), mirrored, forks: forkChanges(byPath, files), forked: new Set(byPath.keys()), files: all };
}

/** This source's mirrors by the upstream file they are of, each list by vault path. */
function mirrorsByPath(source: Remote, mirrors: readonly Mirror[]): Map<string, Mirror[]> {
	const byPath = new Map<string, Mirror[]>();
	const sorted = mirrors.filter((m) => isForkOf(m.meta, source)).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	for (const m of sorted) {
		const notes = byPath.get(m.meta.path);
		if (notes) notes.push(m);
		else byPath.set(m.meta.path, [m]);
	}
	return byPath;
}

/** The upstream files whose mirrors aren't what is at head, by path. */
function mirrorChanges(byPath: ReadonlyMap<string, Mirror[]>, files: ReadonlyMap<string, string>): MirrorChange[] {
	const out: MirrorChange[] = [];
	for (const path of [...byPath.keys()].sort()) {
		const blob = files.get(path) ?? null;
		const notes = (byPath.get(path) ?? []).filter((m) => m.meta.blob !== blob);
		if (notes.length) out.push({ path, status: blob ? 'modified' : 'removed', blob, notes });
	}
	return out;
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
	return { seenCommit: state?.seenCommit ?? null, checkedAt: at };
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

/** State after acknowledging a check: `seenCommit` moves to head. */
export function acknowledged(c: SourceCheck, at: string): SourceState {
	return { seenCommit: c.head.commit, checkedAt: at };
}

/** Whether a check found anything to show. */
export function hasNews(c: SourceCheck): boolean {
	return c.changes.length > 0 || c.mirrors.length > 0 || c.forks.length > 0;
}
