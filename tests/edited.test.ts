import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEdited, sameText } from '../src/copy/edited.ts';
import { forkMetaProps, type ForkMeta } from '../src/sources/fork-meta.ts';

const sha = (c: string) => c.repeat(40);
const META: ForkMeta = { remote: 'a-b', repo: 'https://github.com/a/b', path: 'wiki/a.md', blob: sha('1'), branch: 'main', commit: sha('2'), date: '2026-11-01T10:00:00+02:00', seen: sha('3') };

test('isEdited: not by the fork_* keys, key order, or how the front matter was written', () => {
	const forked = { front: { title: 'A', tags: ['x', 'y'], nested: { a: 1, b: [1, 2] } }, body: '# A\n\ntext\n' };
	const note = { front: { ...forkMetaProps(META), nested: { b: [1, 2], a: 1 }, tags: ['x', 'y'], title: 'A' }, body: '# A\n\ntext\n' };
	assert.ok(!isEdited(note, forked));
	// A file without front matter gets some when the keys are added.
	assert.ok(!isEdited({ front: forkMetaProps(META), body: '\ntext\n' }, { front: null, body: 'text\n' }));
	assert.ok(!isEdited({ front: null, body: 'a\r\nb\r\n' }, { front: null, body: 'a\nb\n' }));
});

test('isEdited: by the body, or a key of the user\'s', () => {
	const forked = { front: { title: 'A', tags: ['x', 'y'] }, body: 'text\n' };
	assert.ok(isEdited({ ...forked, body: 'text, more\n' }, forked));
	assert.ok(isEdited({ ...forked, body: 'text\n\n' }, forked));
	assert.ok(isEdited({ front: { ...forked.front, mine: true }, body: forked.body }, forked));
	assert.ok(isEdited({ front: { title: 'B', tags: ['x', 'y'] }, body: forked.body }, forked));
	assert.ok(isEdited({ front: { title: 'A', tags: ['y', 'x'] }, body: forked.body }, forked));
	assert.ok(isEdited({ front: { title: 'A' }, body: forked.body }, forked));
	assert.ok(isEdited({ front: null, body: forked.body }, forked));
});

test('isEdited: not by converted links; by a link showing other words', () => {
	const forked = { front: null, body: 'See [sorting](../cs/algorithms.md).\n' };
	assert.ok(!isEdited({ front: forkMetaProps(META), body: '\nSee [[algorithms|sorting]].\n' }, forked));
	assert.ok(isEdited({ front: forkMetaProps(META), body: 'See [[algorithms]].\n' }, forked));
});

test('sameText: all but a byte order mark counts', () => {
	assert.ok(sameText('a\n', 'a\n'));
	assert.ok(sameText('\uFEFFa\n', 'a\n'));
	assert.ok(!sameText('a\n', 'a\r\n'));
	assert.ok(!sameText('a\n', 'a\n\n'));
});
