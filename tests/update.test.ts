import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alongsidePath, changedText, editedText, isEdited, readCompare, updatedMeta, type Compare } from '../src/fork/update.ts';
import { forkMetaProps, type ForkMeta } from '../src/sources/fork-meta.ts';

const sha = (c: string) => c.repeat(40);
const META: ForkMeta = { remote: 'a-b', repo: 'https://github.com/a/b', path: 'wiki/a.md', blob: sha('1'), branch: 'main', commit: sha('2'), date: '2026-11-01T10:00:00+02:00', seen: sha('3') };

test('readCompare: a whole compare, or nothing', () => {
	const c: Compare = { source: 'local:notes', path: 'wiki/a.md', blob: sha('1'), branch: 'main', commit: sha('2'), note: 'forks/a.md' };
	assert.deepEqual(readCompare({ ...c, extra: 1 }), c);
	assert.equal(readCompare(null), null);
	assert.equal(readCompare({}), null);
	assert.equal(readCompare({ ...c, blob: 'abc' }), null);
	assert.equal(readCompare({ ...c, path: '../a.md' }), null);
	assert.equal(readCompare({ ...c, note: '' }), null);
});

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

test('alongsidePath: (up-nn) beside the note, the first free, never stacked', () => {
	const none = () => false;
	assert.equal(alongsidePath('forks/algorithms.md', none), 'forks/algorithms (up-01).md');
	assert.equal(alongsidePath('algorithms.md', none), 'algorithms (up-01).md');
	assert.equal(alongsidePath('forks/algorithms (up-01).md', (p) => p === 'forks/algorithms (up-01).md'), 'forks/algorithms (up-02).md');
	const taken = new Set(['a (up-01).md', 'a (up-02).md']);
	assert.equal(alongsidePath('a.md', (p) => taken.has(p)), 'a (up-03).md');
	// A dot in a folder's name is not the note's extension.
	assert.equal(alongsidePath('v1.2/notes.md', none), 'v1.2/notes (up-01).md');
	assert.equal(alongsidePath('a (up-1).md', none), 'a (up-01).md');
});

test('updatedMeta: the source and path stay; branch, commit, blob and date are new; nothing seen', () => {
	const m = updatedMeta(META, { branch: 'next', commit: sha('5') }, sha('4'), new Date('2026-11-11T08:00:00Z'));
	assert.deepEqual({ ...m, date: null }, { ...META, branch: 'next', commit: sha('5'), blob: sha('4'), date: null, seen: null });
	assert.match(m.date ?? '', /^2026-11-11T/);
});

test('the header\'s sentences', () => {
	assert.equal(changedText({ added: 12, removed: 3 }), '12 lines added, 3 removed since you forked.');
	assert.equal(changedText({ added: 1, removed: 0 }), '1 line added, 0 removed since you forked.');
	assert.equal(changedText({ added: 0, removed: 0 }), 'No lines changed since you forked.');
	assert.match(changedText(null), /^Can't tell what changed/);
	assert.equal(editedText(true), 'Your copy is edited.');
	assert.equal(editedText(false), 'Your copy is as you forked it.');
	assert.match(editedText(null), /^Can't tell/);
});
