import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachmentState, attachmentsOf, attachmentsText, gitBlobSha, isAttachment, linkRefs, noAttachments, resolveRef, unusedAttachments } from '../src/copy/attachments.ts';

test('linkRefs: wikilinks, Markdown links and HTML sources, not in code; web links left out', () => {
	const text = [
		'---',
		'cover: "[[cover.jpg]]"',
		'---',
		'![[a.png|200]] and [[Note#H|alias]] and ![x](img/b%20c.png "title") and [pdf](<docs/d e.pdf>)',
		'<img src="h.gif" width=3> [web](https://x.com/i.png) [here](#top) [mail](mailto:a@b)',
		'`![[code.png]]`',
		'```',
		'![[fenced.png]]',
		'```',
		'~~~md',
		'![[open.png]]',
	].join('\n');
	assert.deepEqual(linkRefs(text), [
		{ target: 'cover.jpg', wiki: true },
		{ target: 'a.png', wiki: true },
		{ target: 'Note', wiki: true },
		{ target: 'img/b c.png', wiki: false },
		{ target: 'docs/d e.pdf', wiki: false },
		{ target: 'h.gif', wiki: false },
	]);
});

test('isAttachment: an extension, not .md', () => {
	assert.ok(isAttachment('a/b.png'));
	assert.ok(isAttachment('x.PDF'));
	assert.ok(!isAttachment('a/b.md'));
	assert.ok(!isAttachment('a/B.MD'));
	assert.ok(!isAttachment('a/note'));
	assert.ok(!isAttachment('a/.hidden'));
	assert.ok(!isAttachment('a/b.'));
});

test('resolveRef: from the note, from the root, else by the end of the path', () => {
	const files = new Set(['wiki/cs/img/a.png', 'img/a.png', 'wiki/b.png', 'deep/x/y/b.png', 'wiki/cs/c.png', 'other/c.png', 'wiki/cs/git.md']);
	const note = 'wiki/cs/git.md';
	assert.equal(resolveRef(note, { target: 'img/a.png', wiki: false }, files), 'wiki/cs/img/a.png');
	assert.equal(resolveRef(note, { target: 'img/a.png', wiki: true }, files), 'img/a.png');
	assert.equal(resolveRef(note, { target: '/img/a.png', wiki: false }, files), 'img/a.png');
	assert.equal(resolveRef(note, { target: '../b.png', wiki: false }, files), 'wiki/b.png');
	assert.equal(resolveRef(note, { target: './c.png', wiki: false }, files), 'wiki/cs/c.png');
	// By name: the note's folder first, else the shortest path.
	assert.equal(resolveRef(note, { target: 'c.png', wiki: true }, files), 'wiki/cs/c.png');
	assert.equal(resolveRef(note, { target: 'b.png', wiki: true }, files), 'wiki/b.png');
	assert.equal(resolveRef('top.md', { target: 'B.PNG', wiki: true }, files), 'wiki/b.png');
	assert.equal(resolveRef(note, { target: 'nope.png', wiki: true }, files), null);
	assert.equal(resolveRef(note, { target: 'git', wiki: true }, files), null);
	assert.equal(resolveRef(note, { target: 'git.md', wiki: false }, files), null);
	assert.equal(resolveRef('a.md', { target: '../../a.png', wiki: false }, files), null);
});

test('attachmentsOf: each once, with its blob, in the order found', () => {
	const files = new Map([['wiki/a.md', '1'], ['wiki/a.png', '2'], ['img/b.jpg', '3'], ['c.pdf', '4']]);
	const got = attachmentsOf(
		[
			{ path: 'wiki/a.md', text: '![[a.png]] ![](../img/b.jpg) ![[missing.png]] [[a]]' },
			{ path: 'x.md', text: '![[b.jpg]] [c](c.pdf)' },
		],
		files,
	);
	assert.deepEqual([...got], [['wiki/a.png', '2'], ['img/b.jpg', '3'], ['c.pdf', '4']]);
});

test('gitBlobSha: as git hashes a blob', async () => {
	// `printf 'hello\n' | git hash-object --stdin`
	assert.equal(await gitBlobSha(new TextEncoder().encode('hello\n')), 'ce013625030ba8dba906f756967f9e9ca394464a');
	assert.equal(await gitBlobSha(new Uint8Array()), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
	assert.equal((await gitBlobSha(new Uint8Array(), 'a'.repeat(64))).length, 64);
});

test('attachmentState: the same; an earlier upstream version; anything else is left', () => {
	assert.equal(attachmentState('a', 'a', false), 'current');
	assert.equal(attachmentState('a', 'b', true), 'stale');
	assert.equal(attachmentState('a', 'b', false), 'mine');
});

test('attachmentsText: what was copied, updated, left and failed', () => {
	assert.deepEqual(attachmentsText(noAttachments()), []);
	assert.deepEqual(attachmentsText({ ...noAttachments(), written: ['a.png'] }), ['1 attachment copied.']);
	assert.deepEqual(attachmentsText({ written: ['a', 'b'], updated: ['c'], left: ['d.png'], failed: ['e.png: no'] }), [
		'2 attachments copied, 1 attachment updated.',
		'Left, as they differ from upstream:',
		'd.png',
		'Attachments not copied:',
		'e.png: no',
	]);
});

test('unusedAttachments: in the mirror folder, linked by the notes going and by no other', () => {
	const links = {
		'community/t/a.md': { 'community/t/a.png': 1, 'community/t/shared.png': 1, 'mine/p.png': 1, 'community/t/b.md': 1 },
		'community/t/b.md': { 'community/t/shared.png': 1 },
		'community/t/c.md': { 'community/t/c.png': 1, 'community/t/a.png': 1 },
	};
	// c.md uses a.png, b.md shared.png; mine/p.png isn't in the mirror folder.
	assert.deepEqual(unusedAttachments(['community/t/a.md'], 'community/t', links), []);
	assert.deepEqual(unusedAttachments(['community/t/a.md', 'community/t/b.md'], 'community/t', links), ['community/t/shared.png']);
	assert.deepEqual(unusedAttachments(['community/t/a.md', 'community/t/c.md'], 'community/t', links), ['community/t/a.png', 'community/t/c.png']);
	assert.deepEqual(unusedAttachments(['gone.md'], 'community/t', links), []);
});
