import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alongsidePath, changedText, editedText, forksSettled, forksUpdatedText, noForksUpdated, readCompare, updatedMeta, type Compare, type ForksUpdated } from '../src/fork/update.ts';
import type { ForkMeta } from '../src/sources/fork-meta.ts';

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

const forksResult = (over: Partial<ForksUpdated>): ForksUpdated => ({ ...noForksUpdated(), ...over });

test('forksSettled: only when nothing is left or failed', () => {
	assert.ok(forksSettled(forksResult({ updated: ['a.md'] })));
	// Every copy was settled already.
	assert.ok(forksSettled(noForksUpdated()));
	assert.ok(!forksSettled(forksResult({ updated: ['a.md'], edited: ['b.md'] })));
	assert.ok(!forksSettled(forksResult({ unknown: ['a.md'] })));
	assert.ok(!forksSettled(forksResult({ failed: ['a.md: no'] })));
});

test('forksUpdatedText: the count of forks, then what is left', () => {
	assert.deepEqual(forksUpdatedText('txt', forksResult({ updated: ['a.md'] })), { text: 'Updated 1 fork from txt.', left: false });
	assert.deepEqual(forksUpdatedText('txt', forksResult({ updated: ['a.md', 'b.md'] })), { text: 'Updated 2 forks from txt.', left: false });
	const { text, left } = forksUpdatedText('txt', forksResult({ edited: ['a.md'], unknown: ['b.md'], failed: ['c.md: no'] }));
	assert.ok(left);
	assert.equal(text, 'Updated 0 forks from txt.\nEdited since forked, so left as they are:\na.md\nCan\'t tell whether edited, so left as they are:\nb.md\nCompare one to choose what to do with it.\nNot updated:\nc.md: no');
});
