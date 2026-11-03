import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DATA, type PublicTxtData } from '../src/sources/schema.ts';
import { addSource, removeSource, sourceToForm, updateSource, type SourceForm } from '../src/sources/edit.ts';

const B = '0123456789abcdef0123456789abcdef01234567';
const form = (over: Partial<SourceForm> = {}): SourceForm => ({ url: '', branch: '', include: '', watch: '', folder: '', ...over });

function ok(r: ReturnType<typeof addSource>): PublicTxtData {
	assert.ok(r.ok, r.ok ? '' : r.error);
	return r.data;
}

test('add: canonical URL, lines split and cleaned, blanks → null', () => {
	const d = ok(addSource(DEFAULT_DATA, form({ url: 'git@github.com:a/b.git', include: ' wiki \n\n/notes/\n', watch: 'x.md\r\nx.md', folder: '/forks/' })));
	assert.deepEqual(d.sources, [{ url: 'https://github.com/a/b', branch: null, include: ['wiki/', 'notes/'], watch: ['x.md'], folder: 'forks' }]);
});

test('add: invalid URL and duplicate rejected, data untouched', () => {
	const bad = addSource(DEFAULT_DATA, form({ url: 'nope' }));
	assert.equal(bad.ok, false);
	const d = ok(addSource(DEFAULT_DATA, form({ url: 'https://github.com/a/b' })));
	const dup = addSource(d, form({ url: 'https://GITHUB.com/a/b.git' }));
	assert.equal(dup.ok, false);
	assert.equal(d.sources.length, 1);
});

test('update: in place, URL fixed, state kept; unknown URL rejected', () => {
	let d = ok(addSource(DEFAULT_DATA, form({ url: 'https://github.com/a/b' })));
	d = ok(addSource(d, form({ url: 'https://github.com/c/d' })));
	d = { ...d, state: { 'https://github.com/a/b': { seenCommit: B, checkedAt: null, watched: {} } } };
	const u = ok(updateSource(d, 'https://github.com/a/b', form({ url: 'https://github.com/x/y', branch: 'dev' })));
	assert.deepEqual(u.sources.map((s) => [s.url, s.branch]), [['https://github.com/a/b', 'dev'], ['https://github.com/c/d', null]]);
	assert.deepEqual(u.state, d.state);
	assert.equal(updateSource(d, 'https://github.com/z/z', form()).ok, false);
});

test('form round-trip', () => {
	const d = ok(addSource(DEFAULT_DATA, form({ url: 'https://github.com/a/b', branch: 'main', include: 'w/\nn/', watch: 'x.md', folder: 'f' })));
	const s = d.sources[0];
	assert.ok(s);
	assert.deepEqual(ok(updateSource(d, s.url, sourceToForm(s))), d);
});

test('remove: source and its state go', () => {
	let d = ok(addSource(DEFAULT_DATA, form({ url: 'https://github.com/a/b' })));
	d = { ...d, state: { 'https://github.com/a/b': { seenCommit: B, checkedAt: null, watched: {} } } };
	const r = removeSource(d, 'https://github.com/a/b');
	assert.deepEqual(r.sources, []);
	assert.deepEqual(r.state, {});
});
