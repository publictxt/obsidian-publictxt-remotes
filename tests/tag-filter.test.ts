import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHIP_LIMIT, NO_FILTER, chips, isSet, matchTags, passes, press, shownChips, type PageTags, type TagFilter } from '../src/tags/filter.ts';

const PAGES: PageTags = new Map(
	Object.entries({ 'a.md': ['dev/app', 'Obsidian'], 'b.md': ['dev'], 'c.md': ['books', 'dev'], 'd.md': ['books/fiction'], 'e.md': [] }).map(([p, t]) => [p, matchTags(t)]),
);
const ALL = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'x.png'];
const filter = (include: string[], exclude: string[] = [], mode: TagFilter['mode'] = 'all'): TagFilter => ({ include: new Set(include), exclude: new Set(exclude), mode });
// A path not in PAGES has no tags to go by, and never passes.
const found = (f: TagFilter) => ALL.filter((p) => { const t = PAGES.get(p); return t !== undefined && passes(f, t); }).map((p) => p[0]).join('');

test('matchTags: compared form, with the tags it is nested in', () => {
	assert.deepEqual([...matchTags(['Dev/App/x', 'dev', '/', 'a//b/'])], ['dev', 'dev/app', 'dev/app/x', 'a', 'a/b']);
});

test('all, any, exclude, and nested tags', () => {
	assert.equal(found(filter(['dev'])), 'abc');
	assert.equal(found(filter(['dev/app'])), 'a');
	assert.equal(found(filter(['dev', 'books'])), 'c');
	assert.equal(found(filter(['dev', 'books'], [], 'any')), 'abcd');
	assert.equal(found(filter(['dev'], ['books'])), 'ab');
	assert.equal(found(filter([], ['dev'])), 'de');
	assert.equal(found(filter(['dev', 'books'], ['dev'], 'any')), 'd');
	// Untagged pages pass an empty filter; what isn't a page doesn't.
	assert.equal(found(NO_FILTER), 'abcde');
});

test('press: the chip includes or clears, the ✕ excludes or clears', () => {
	const inc = press(NO_FILTER, 'a', 'chip');
	assert.deepEqual([[...inc.include], [...inc.exclude]], [['a'], []]);
	assert.ok(!isSet(press(inc, 'a', 'chip')));
	const exc = press(inc, 'a', 'x');
	assert.deepEqual([[...exc.include], [...exc.exclude]], [[], ['a']]);
	assert.ok(!isSet(press(exc, 'a', 'x')));
	assert.ok(!isSet(press(exc, 'a', 'chip')));
	assert.ok(!isSet(NO_FILTER));
});

test('chips: most used first whatever the filter; counts are of what passes', () => {
	const of = (f: TagFilter) => chips(PAGES, f).map((c) => `${c.tag} ${c.count}`);
	assert.deepEqual(of(NO_FILTER), ['dev 3', 'books 2', 'books/fiction 1', 'dev/app 1', 'obsidian 1']);
	assert.deepEqual(of(filter(['books'])), ['dev 1', 'books 2', 'books/fiction 1', 'dev/app 0', 'obsidian 0']);
	// Any: including more adds pages, so the counts aren't narrowed by what is included.
	assert.deepEqual(of(filter(['books'], ['obsidian'], 'any')), ['dev 2', 'books 2', 'books/fiction 1', 'dev/app 0', 'obsidian 0']);
	const last = chips(PAGES, filter(['gone'])).at(-1);
	assert.deepEqual(last, { tag: 'gone', state: 'include', count: 0 });
});

test('shownChips: the first few, any that are set, and what was typed', () => {
	const pages: PageTags = new Map([['p', new Set(Array.from({ length: CHIP_LIMIT + 10 }, (_, i) => `t${String(i).padStart(2, '0')}`))]]);
	const list = chips(pages, filter(['t29']));
	const some = shownChips(list, '', false);
	assert.equal(some.shown.length, CHIP_LIMIT + 1);
	assert.equal(some.more, 9);
	assert.equal(shownChips(list, '', true).more, 0);
	assert.deepEqual(shownChips(list, ' #T05 ', false).shown.map((c) => c.tag), ['t05', 't29']);
});
