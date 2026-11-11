import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acknowledged, checkSource, checked, inInclude, isSettled, latestFirst, type Fork } from '../src/check/check.ts';
import type { Change, Head, RemoteHost } from '../src/remote/host.ts';
import type { Source, SourceState } from '../src/sources/schema.ts';
import type { Remote } from '../src/fork/fork.ts';

const sha = (c: string) => c.repeat(40);
const URL_ = 'https://github.com/a/b';
const HEAD: Head = { branch: 'main', commit: sha('c'), tree: sha('t') };

function fakeHost(files: Record<string, string>, changes: Change[] | null = []): RemoteHost & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		head: async () => (calls.push('head'), HEAD),
		tree: async () => (calls.push('tree'), { files: new Map(Object.entries(files)) }),
		changes: async () => (calls.push('changes'), changes),
		blob: async () => '',
		diffStat: async () => null,
	};
}
const source = (over: Partial<Source & Remote> = {}): Source & Remote => ({ url: URL_, name: 'a-b', branch: null, include: [], watch: [], folder: null, listForks: null, ...over });
const state = (over: Partial<SourceState> = {}): SourceState => ({ seenCommit: sha('a'), checkedAt: null, watched: {}, ...over });

test('inInclude: prefixes; empty is the whole repo', () => {
	assert.ok(inInclude('x/y.md', []));
	assert.ok(inInclude('wiki/a.md', ['blog/', 'wiki/']));
	assert.ok(!inInclude('wikis/a.md', ['wiki/']));
});

test('first check: every file in include, sorted, reason given, no diff', async () => {
	const h = fakeHost({ 'wiki/b.md': sha('1'), 'wiki/a.md': sha('2'), 'x.md': sha('3') });
	const c = await checkSource(h, source({ include: ['wiki/'] }), undefined, []);
	assert.equal(c.reason, 'first-check');
	assert.deepEqual(c.changes.map((x) => x.path), ['wiki/a.md', 'wiki/b.md']);
	assert.ok(!h.calls.includes('changes'));
});

test('seen is head: nothing new, no diff', async () => {
	const h = fakeHost({ 'a.md': sha('1') });
	const c = await checkSource(h, source(), state({ seenCommit: HEAD.commit }), []);
	assert.deepEqual(c.changes, []);
	assert.equal(c.reason, null);
	assert.ok(!h.calls.includes('changes'));
});

test('changes filtered by include; a rename into or out of it counts', async () => {
	const changes: Change[] = [
		{ path: 'wiki/a.md', status: 'modified', from: null },
		{ path: 'x.md', status: 'added', from: null },
		{ path: 'out.md', status: 'renamed', from: 'wiki/old.md' },
	];
	const c = await checkSource(fakeHost({}, changes), source({ include: ['wiki/'] }), state(), []);
	assert.deepEqual(c.changes.map((x) => x.path), ['wiki/a.md', 'out.md']);
});

test('history rewritten: every file, with the reason', async () => {
	const c = await checkSource(fakeHost({ 'a.md': sha('1') }, null), source(), state(), []);
	assert.equal(c.reason, 'history-rewritten');
	assert.deepEqual(c.changes.map((x) => x.path), ['a.md']);
});

test('watched: new, modified, removed; unchanged left out', async () => {
	const files = { 'n.md': sha('1'), 'm.md': sha('2'), 'same.md': sha('3') };
	const st = state({ seenCommit: HEAD.commit, watched: { 'm.md': sha('9'), 'same.md': sha('3'), 'gone.md': sha('4') } });
	const c = await checkSource(fakeHost(files), source({ watch: ['n.md', 'm.md', 'same.md', 'gone.md'] }), st, []);
	assert.deepEqual(c.watched.map((w) => [w.path, w.status]), [['n.md', 'new'], ['m.md', 'modified'], ['gone.md', 'removed']]);
	assert.deepEqual(c.watchedBlobs, files);
});

test('forks: this source only; modified and removed; unchanged left out', async () => {
	const fork = (path: string, fp: string, blob: string, repo = URL_): Fork => ({ path, meta: { remote: null, repo, path: fp, blob, branch: null, commit: null, date: null, seen: null } });
	const forks = [fork('f1.md', 'a.md', sha('0')), fork('f2.md', 'b.md', sha('2')), fork('f3.md', 'gone.md', sha('3')), fork('f4.md', 'a.md', sha('0'), 'https://github.com/x/y')];
	const c = await checkSource(fakeHost({ 'a.md': sha('1'), 'b.md': sha('2') }), source(), state({ seenCommit: HEAD.commit }), forks);
	assert.deepEqual(c.forks.map((f) => [f.path, f.status, f.blob, f.copies.map((x) => x.path)]), [['a.md', 'modified', sha('1'), ['f1.md']], ['gone.md', 'removed', null, ['f3.md']]]);
});

test('forks: matched by fork_remote when they have one, else by fork_repo', async () => {
	const fork = (path: string, remote: string | null, repo: string | null): Fork => ({ path, meta: { remote, repo, path: 'a.md', blob: sha('0'), branch: null, commit: null, date: null, seen: null } });
	const forks = [fork('named.md', 'A-B', 'https://github.com/x/y'), fork('other.md', 'x-y', URL_), fork('old.md', null, URL_), fork('local.md', 'notes', null)];
	const c = await checkSource(fakeHost({ 'a.md': sha('1') }), source(), state({ seenCommit: HEAD.commit }), forks);
	assert.deepEqual(c.forks.flatMap((f) => f.copies.map((x) => x.path)), ['named.md', 'old.md']);
	const local = await checkSource(fakeHost({ 'a.md': sha('1') }), source({ url: 'local:notes', name: 'notes' }), state({ seenCommit: HEAD.commit }), forks);
	assert.deepEqual(local.forks.flatMap((f) => f.copies.map((x) => x.path)), ['local.md']);
});

const copy = (path: string, over: Partial<Fork['meta']> = {}): Fork => ({ path, meta: { remote: null, repo: URL_, path: 'a.md', blob: sha('0'), branch: null, commit: null, date: null, seen: null, ...over } });

test('isSettled: by the blob the text came from, or the one seen; gone only by fork_seen', () => {
	assert.ok(isSettled(copy('f.md').meta, sha('0')));
	assert.ok(isSettled(copy('f.md', { seen: sha('1') }).meta, sha('1')));
	assert.ok(!isSettled(copy('f.md', { seen: sha('1') }).meta, sha('2')));
	assert.ok(!isSettled(copy('f.md').meta, null));
	assert.ok(isSettled(copy('f.md', { seen: 'gone' }).meta, null));
	// Back after it was gone: settled only if it is what was forked.
	assert.ok(isSettled(copy('f.md', { seen: 'gone' }).meta, sha('0')));
	assert.ok(!isSettled(copy('f.md', { seen: 'gone' }).meta, sha('1')));
});

test('latestFirst: newest fork_date first, across time zones; undated last; ties by path', () => {
	const forks = [
		copy('undated.md'),
		copy('b.md', { date: '2026-11-10T10:00:00+02:00' }),
		copy('new.md', { date: '2026-11-10T09:30:00+00:00' }),
		copy('a.md', { date: '2026-11-10T08:00:00Z' }),
		copy('bad.md', { date: 'yesterday' }),
	];
	assert.deepEqual(latestFirst(forks).map((f) => f.path), ['new.md', 'a.md', 'b.md', 'bad.md', 'undated.md']);
});

test('forks: one row per upstream file, its copies latest first, listed while any copy is unsettled', async () => {
	const host = fakeHost({ 'a.md': sha('1'), 'b.md': sha('1') });
	const st = state({ seenCommit: HEAD.commit });
	const older = copy('a.md', { date: '2026-11-01T10:00:00Z' });
	const alongside = copy('a (up-01).md', { blob: sha('1'), date: '2026-11-05T10:00:00Z' });
	const listed = await checkSource(host, source(), st, [older, alongside, copy('b.md', { path: 'b.md', seen: sha('1') })]);
	assert.deepEqual(listed.forks.map((f) => [f.path, f.copies.map((x) => x.path)]), [['a.md', ['a (up-01).md', 'a.md']]]);
	const settled = await checkSource(host, source(), st, [copy('a.md', { seen: sha('1') }), alongside]);
	assert.deepEqual(settled.forks, []);
});

test('forks: gone upstream is quiet once kept, and listed again when the file is back and differs', async () => {
	const kept = [copy('f.md', { seen: 'gone' })];
	const st = state({ seenCommit: HEAD.commit });
	assert.deepEqual((await checkSource(fakeHost({}), source(), st, kept)).forks, []);
	assert.deepEqual((await checkSource(fakeHost({ 'a.md': sha('0') }), source(), st, kept)).forks, []);
	assert.deepEqual((await checkSource(fakeHost({ 'a.md': sha('1') }), source(), st, kept)).forks.map((f) => f.status), ['modified']);
});

test('checked moves checkedAt only; acknowledged moves seenCommit and watched', async () => {
	const st = state({ watched: { 'old.md': sha('4') } });
	assert.deepEqual(checked(st, 'T'), { ...st, checkedAt: 'T' });
	const c = await checkSource(fakeHost({ 'w.md': sha('1') }), source({ watch: ['w.md'] }), st, []);
	assert.deepEqual(acknowledged(c, 'T'), { seenCommit: HEAD.commit, checkedAt: 'T', watched: { 'w.md': sha('1') } });
});
