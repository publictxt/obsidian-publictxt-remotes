import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forkPath, forksOf, freePath, isForkable, newForkMeta } from '../src/fork/fork.ts';
import type { Fork } from '../src/sources/fork-meta.ts';
import { localIso } from '../src/util/time.ts';
import { readForkMeta, forkMetaProps } from '../src/sources/fork-meta.ts';

const sha = (c: string) => c.repeat(40);
const REPO = 'https://github.com/a/b';
const REMOTE = { url: REPO, name: 'a-b' };

test('isForkable: Markdown only', () => {
	assert.ok(isForkable('wiki/a.md'));
	assert.ok(isForkable('A.MD'));
	assert.ok(!isForkable('media/x.png'));
	assert.ok(!isForkable('README'));
});

test('forkPath: file name in the folder; empty folder is the root', () => {
	assert.equal(forkPath('forks', 'wiki/deep/a.md'), 'forks/a.md');
	assert.equal(forkPath('', 'wiki/a.md'), 'a.md');
	assert.equal(forkPath('x/y', 'a.md'), 'x/y/a.md');
});

test('freePath: the path if free, else numbered before the extension', () => {
	const taken = new Set(['f/a.md', 'f/a 1.md', 'f.d/noext']);
	assert.equal(freePath('f/b.md', (p) => taken.has(p)), 'f/b.md');
	assert.equal(freePath('f/a.md', (p) => taken.has(p)), 'f/a 2.md');
	// A dot in a folder name is not an extension.
	assert.equal(freePath('f.d/noext', (p) => taken.has(p)), 'f.d/noext 1');
});

test('forksOf: same remote (or repo, for forks without one) and path only', () => {
	const fork = (path: string, remote: string | null, repo: string, from: string): Fork => ({ path, meta: { remote, repo, path: from, blob: sha('1'), branch: null, commit: null, date: null, seen: null } });
	const forks = [
		fork('a.md', 'a-b', REPO, 'wiki/a.md'),
		fork('old.md', null, REPO, 'wiki/a.md'),
		fork('b.md', 'a-b', REPO, 'wiki/b.md'),
		fork('c.md', 'x-y', REPO, 'wiki/a.md'),
		fork('d.md', null, 'https://github.com/x/y', 'wiki/a.md'),
	];
	assert.deepEqual(forksOf(forks, REMOTE, 'wiki/a.md').map((f) => f.path), ['a.md', 'old.md']);
});

test('localIso: local time with offset, to the second', () => {
	const d = new Date('2026-11-10T11:42:05.678Z');
	assert.equal(localIso(d, 120), '2026-11-10T13:42:05+02:00');
	assert.equal(localIso(d, -330), '2026-11-10T06:12:05-05:30');
	assert.equal(localIso(d, 0), '2026-11-10T11:42:05+00:00');
	// Default: the machine's offset; it parses back to the same instant (seconds).
	assert.equal(new Date(localIso(d)).getTime(), Math.floor(d.getTime() / 1000) * 1000);
});

test('newForkMeta: head and blob recorded; reads back as a fork', () => {
	const head = { branch: 'main', commit: sha('c'), tree: sha('t') };
	const m = newForkMeta(REMOTE, 'wiki/a.md', head, sha('b'), new Date('2026-11-10T11:42:05Z'));
	assert.equal(m.remote, 'a-b');
	assert.equal(m.repo, REPO);
	assert.equal(m.branch, 'main');
	assert.equal(m.commit, sha('c'));
	assert.equal(m.blob, sha('b'));
	assert.deepEqual(readForkMeta(forkMetaProps(m)), m);
});

test('newForkMeta: a local source records its name, no repo', () => {
	const head = { branch: 'main', commit: sha('c'), tree: sha('t') };
	const m = newForkMeta({ url: 'local:notes', name: 'notes' }, 'a.md', head, sha('b'), new Date());
	assert.equal(m.remote, 'notes');
	assert.equal(m.repo, null);
	assert.deepEqual(readForkMeta(forkMetaProps(m)), m);
	assert.equal('fork_repo' in forkMetaProps(m), false);
});
