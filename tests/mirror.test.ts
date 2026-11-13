import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forkedMeta, mirroredText, mirrorFolderOf, mirrorPath, newMirrorMeta, planMirrors, updatedMirrorMeta } from '../src/mirror/mirror.ts';
import { forkMetaProps, mirrorMetaProps, readForkMeta, readMirrorMeta, writeForkMeta, writeMirrorMeta, type MirrorMeta } from '../src/sources/fork-meta.ts';
import { isEdited } from '../src/fork/update.ts';

const B = '0123456789abcdef0123456789abcdef01234567';
const C = 'c'.repeat(40);
const NOW = new Date('2026-11-13T10:00:00Z');
const meta: MirrorMeta = { remote: 'txt', repo: 'https://github.com/a/b', path: 'wiki/cs/git.md', blob: B, branch: 'main', commit: B, date: '2026-11-03T10:00:00+02:00' };

test('mirrorFolderOf: the source\'s folder, else its name, under the community folder', () => {
	assert.equal(mirrorFolderOf('community', null, 'txt'), 'community/txt');
	assert.equal(mirrorFolderOf('community', 'research/ann', 'txt'), 'community/research/ann');
	assert.equal(mirrorFolderOf('', null, 'txt'), 'txt');
	assert.equal(mirrorFolderOf('', 'ann', 'txt'), 'ann');
});

test('mirrorPath: the path it has upstream, in the source\'s folder', () => {
	assert.equal(mirrorPath('community/txt', 'wiki/cs/git.md'), 'community/txt/wiki/cs/git.md');
	assert.equal(mirrorPath('community/txt', 'top.md'), 'community/txt/top.md');
	assert.equal(mirrorPath('', 'wiki/a.md'), 'wiki/a.md');
});

test('mirror keys: round trip, mirror_* only, in order', () => {
	const props = mirrorMetaProps(meta);
	assert.deepEqual(Object.keys(props), ['mirror_remote', 'mirror_repo', 'mirror_path', 'mirror_branch', 'mirror_commit', 'mirror_blob', 'mirror_date']);
	assert.deepEqual(readMirrorMeta(props), meta);
	assert.equal(readForkMeta(props), null);
	assert.equal(readMirrorMeta({ ...props, mirror_blob: 'abc' }), null);
	assert.equal(readMirrorMeta(null), null);
});

test('a note is a fork or a mirror, never both: fork keys win, and each write clears the other', () => {
	const fork = forkedMeta(meta, NOW);
	assert.equal(readMirrorMeta({ ...mirrorMetaProps(meta), ...forkMetaProps(fork) }), null);

	const front: Record<string, unknown> = { title: 'Git', ...mirrorMetaProps(meta) };
	writeForkMeta(front, fork);
	assert.equal(readMirrorMeta(front), null);
	assert.deepEqual(Object.keys(front).filter((k) => k.startsWith('mirror_')), []);
	assert.equal(front.title, 'Git');
	assert.deepEqual(readForkMeta(front), fork);

	writeMirrorMeta(front, meta);
	assert.equal(readForkMeta(front), null);
	assert.deepEqual(readMirrorMeta(front), meta);
});

test('newMirrorMeta: a local source has no repo; updatedMirrorMeta moves to the new version', () => {
	const head = { branch: 'main', commit: C };
	assert.equal(newMirrorMeta({ url: 'local:notes', name: 'notes' }, 'a.md', head, B, NOW).repo, null);
	const m = newMirrorMeta({ url: 'https://github.com/a/b', name: 'txt' }, 'a.md', head, B, NOW);
	assert.deepEqual([m.remote, m.repo, m.path, m.blob, m.commit], ['txt', 'https://github.com/a/b', 'a.md', B, C]);
	const next = updatedMirrorMeta(meta, head, C, NOW);
	assert.deepEqual([next.path, next.blob, next.commit, next.remote], ['wiki/cs/git.md', C, C, 'txt']);
	assert.notEqual(next.date, meta.date);
});

test('forkedMeta: the same file and version, forked now, nothing seen', () => {
	const f = forkedMeta(meta, NOW);
	assert.deepEqual([f.remote, f.repo, f.path, f.blob, f.branch, f.commit, f.seen], ['txt', meta.repo, meta.path, B, 'main', B, null]);
	assert.notEqual(f.date, meta.date);
});

test('planMirrors: new, already mirrored wherever it is, and a place that is taken', () => {
	const taken = new Set(['community/txt/wiki/mine.md']);
	const plan = planMirrors(['wiki/a.md', 'wiki/b.md', 'wiki/mine.md', 'Wiki/A.md'], 'community/txt', new Map([['wiki/b.md', 'reading/b.md']]), (p) => taken.has(p));
	assert.deepEqual(plan, [
		{ path: 'wiki/a.md', to: 'community/txt/wiki/a.md', state: 'new' },
		{ path: 'wiki/b.md', to: 'reading/b.md', state: 'mirrored' },
		{ path: 'wiki/mine.md', to: 'community/txt/wiki/mine.md', state: 'taken' },
		// File names are compared without case: the first of the two has the place.
		{ path: 'Wiki/A.md', to: 'community/txt/Wiki/A.md', state: 'taken' },
	]);
});

test('mirroredText: what was written, what was already there, what failed', () => {
	assert.equal(mirroredText('txt', 3, 0, []), 'Mirrored 3 files from txt.');
	assert.equal(mirroredText('txt', 1, 2, []), 'Mirrored 1 file from txt. 2 already mirrored.');
	assert.equal(mirroredText('txt', 0, 0, ['a.md: no']), 'Mirrored 0 files from txt.\nNot mirrored:\na.md: no');
});

test('isEdited: a mirror\'s own keys don\'t count as an edit', () => {
	const upstream = { front: { title: 'Git' }, body: 'text\n' };
	assert.ok(!isEdited({ front: { title: 'Git', ...mirrorMetaProps(meta) }, body: 'text\n' }, upstream));
	assert.ok(isEdited({ front: { title: 'Git', ...mirrorMetaProps(meta) }, body: 'mine\n' }, upstream));
	assert.ok(isEdited({ front: { title: 'Mine', ...mirrorMetaProps(meta) }, body: 'text\n' }, upstream));
});
