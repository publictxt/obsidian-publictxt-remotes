import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkForkPath, forkFolder, forkPath, forksOf, freePath, isForkable, localIso, newForkMeta } from '../src/fork/fork.ts';
import type { Fork } from '../src/check/check.ts';
import { readForkMeta, forkMetaProps } from '../src/sources/fork-meta.ts';

const sha = (c: string) => c.repeat(40);
const REPO = 'https://github.com/a/b';

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

test('checkForkPath: trimmed, .md added, no clash, no .. segments', () => {
	const taken = (p: string) => p === 'x/a.md';
	assert.deepEqual(checkForkPath('  /x/b ', taken), { ok: true, path: 'x/b.md' });
	assert.deepEqual(checkForkPath('x/b.md', taken), { ok: true, path: 'x/b.md' });
	assert.equal(checkForkPath('x/a', taken).ok, false);
	assert.equal(checkForkPath('', taken).ok, false);
	assert.equal(checkForkPath('../a.md', taken).ok, false);
});

test('forksOf: same repo and path only', () => {
	const fork = (path: string, repo: string, from: string): Fork => ({ path, meta: { repo, path: from, blob: sha('1'), branch: null, commit: null, date: null } });
	const forks = [fork('a.md', REPO, 'wiki/a.md'), fork('b.md', REPO, 'wiki/b.md'), fork('c.md', 'https://github.com/x/y', 'wiki/a.md')];
	assert.deepEqual(forksOf(forks, REPO, 'wiki/a.md').map((f) => f.path), ['a.md']);
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
	const m = newForkMeta(REPO, 'wiki/a.md', head, sha('b'), new Date('2026-11-10T11:42:05Z'));
	assert.equal(m.branch, 'main');
	assert.equal(m.commit, sha('c'));
	assert.equal(m.blob, sha('b'));
	assert.deepEqual(readForkMeta(forkMetaProps(m)), m);
});

test('forkFolder: source folder, else a matching vault folder, else the default', () => {
	const vault = new Set(['wiki', 'wiki/cs']);
	const o = { sourceFolder: null, defaultFolder: 'forks', matchFolders: true, folderExists: (f: string) => vault.has(f) };
	assert.deepEqual(forkFolder('wiki/cs/a.md', { ...o, sourceFolder: 'theirs' }), { folder: 'theirs', reason: 'source' });
	assert.deepEqual(forkFolder('wiki/cs/a.md', o), { folder: 'wiki/cs', reason: 'matched' });
	// Exact folder only: a partial match falls back to the default.
	assert.deepEqual(forkFolder('wiki/cs/se/a.md', o), { folder: 'forks', reason: 'default' });
	assert.deepEqual(forkFolder('wiki/cs/a.md', { ...o, matchFolders: false }), { folder: 'forks', reason: 'default' });
	// A file at the repo root has no folder to match.
	assert.deepEqual(forkFolder('a.md', o), { folder: 'forks', reason: 'default' });
});
