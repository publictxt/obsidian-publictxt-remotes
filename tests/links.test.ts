import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWikilink, linkShows, matchesExceptLinks, missingName, relink, rewriteLinks, shortestName, splitLink, upstreamTarget, upstreamFiles, type LinkRef } from '../src/fork/links.ts';

const FILES = upstreamFiles(['wiki/a.md', 'wiki/cs/b.md', 'wiki/c.md', 'cs/b.md', 'top.md', 'wiki/v1.2 notes.md', 'wiki/My Note.md', 'x/dup.md', 'y/dup.md', 'img/p.png']);
const FROM = 'wiki/a.md';

/** The upstream path `original` names from `FROM`, or why not. */
function target(original: string, link: string, files = FILES): string | null {
	const t = upstreamTarget({ original, link }, FROM, files);
	return t === null ? null : 'path' in t ? t.path : t.none;
}

test('splitLink and isWikilink', () => {
	assert.deepEqual(splitLink('a.md#H#I'), { path: 'a.md', subpath: '#H#I' });
	assert.deepEqual(splitLink('a'), { path: 'a', subpath: '' });
	assert.ok(isWikilink('[[a]]'));
	assert.ok(isWikilink('![[a]]'));
	assert.ok(!isWikilink('[a](a.md)'));
});

test('upstreamTarget: Markdown links, relative to the note first', () => {
	assert.equal(target('[b](cs/b.md)', 'cs/b.md'), 'wiki/cs/b.md');
	assert.equal(target('[b](./cs/b.md)', './cs/b.md'), 'wiki/cs/b.md');
	assert.equal(target('[t](../top.md)', '../top.md'), 'top.md');
	assert.equal(target('[b](/cs/b.md)', '/cs/b.md'), 'cs/b.md');
	// Not beside the note: from the root.
	assert.equal(target('[t](top.md)', 'top.md'), 'top.md');
	assert.equal(target('[b](cs/b)', 'cs/b'), 'wiki/cs/b.md');
	assert.equal(target('[b](cs/b.md#Heading)', 'cs/b.md#Heading'), 'wiki/cs/b.md');
});

test('upstreamTarget: wikilinks, from the root first', () => {
	assert.equal(target('[[cs/b]]', 'cs/b'), 'cs/b.md');
	assert.equal(target('[[wiki/cs/b]]', 'wiki/cs/b'), 'wiki/cs/b.md');
	assert.equal(target('[[c|see c]]', 'c'), 'wiki/c.md');
	assert.equal(target('![[c]]', 'c'), 'wiki/c.md');
	assert.equal(target('[[../top]]', '../top'), 'top.md');
});

test('upstreamTarget: by name, one file or several', () => {
	assert.equal(target('[[b]]', 'b', upstreamFiles(['wiki/cs/b.md', 'wiki/a.md'])), 'wiki/cs/b.md');
	assert.equal(target('[[b]]', 'b'), 'several');
	assert.equal(target('[[dup]]', 'dup'), 'several');
	assert.equal(target('[[x/dup]]', 'x/dup'), 'x/dup.md');
	assert.equal(target('[d](dup.md)', 'dup.md'), 'several');
});

test('upstreamTarget: case only when nothing matches exactly', () => {
	assert.equal(target('[[my note]]', 'my note'), 'wiki/My Note.md');
	assert.equal(target('[[C]]', 'C'), 'wiki/c.md');
	assert.equal(target('[[C]]', 'C', upstreamFiles(['wiki/c.md', 'wiki/C.md'])), 'wiki/C.md');
});

test('upstreamTarget: encoded, dotted, gone, out of the repo, not a file link', () => {
	assert.equal(target('[n](My%20Note.md)', 'My%20Note.md'), 'wiki/My Note.md');
	assert.equal(target('[n](My Note.md)', 'My Note.md'), 'wiki/My Note.md');
	assert.equal(target('[[v1.2 notes]]', 'v1.2 notes'), 'wiki/v1.2 notes.md');
	assert.equal(target('![p](../img/p.png)', '../img/p.png'), 'img/p.png');
	assert.equal(target('[[nowhere]]', 'nowhere'), 'missing');
	assert.equal(target('[o](../../out.md)', '../../out.md'), 'missing');
	assert.equal(target('[[#Heading]]', '#Heading'), null);
	assert.equal(target('[w](https://example.com/a.md)', 'https://example.com/a.md'), null);
	assert.equal(target('[[a]]', 'a'), 'wiki/a.md');
});

test('linkShows: text, alias, or name and subpath', () => {
	assert.equal(linkShows('[sorting](../cs/algorithms.md)'), 'sorting');
	assert.equal(linkShows('![alt](p.png)'), 'alt');
	assert.equal(linkShows('[[cs/algorithms]]'), 'algorithms');
	assert.equal(linkShows('[[cs/algorithms.md]]'), 'algorithms');
	assert.equal(linkShows('[[algorithms|sorting]]'), 'sorting');
	assert.equal(linkShows('[[b#H#I]]'), 'b > H > I');
	assert.equal(linkShows('[[b#^blk]]'), 'b > ^blk');
	assert.equal(linkShows('![[c]]'), 'c');
});

/** Refs for every `[[…]]` and `[…](…)` in `text`, as the cache would give them. */
function refsOf(text: string): LinkRef[] {
	return [...text.matchAll(/!?\[\[([^\]|]*)(?:\|[^\]]*)?\]\]|!?\[[^\]]*\]\(([^)]*)\)/g)].map((m) => ({
		start: m.index,
		end: m.index + m[0].length,
		original: m[0],
		link: m[1] ?? m[2] ?? '',
	}));
}

test('rewriteLinks: from the end, the rest untouched; null or the same text is no change', () => {
	const text = 'See [b](cs/b.md) and [[c]].\n\n![[c]] [[d]]\n';
	const out = rewriteLinks(text, refsOf(text), (r) => (r.link === 'cs/b.md' ? '[b](b.md)' : r.link === 'c' ? r.original.replace('c', 'cc') : null));
	assert.deepEqual(out, { text: 'See [b](b.md) and [[cc]].\n\n![[cc]] [[d]]\n', changed: 3 });
	assert.deepEqual(rewriteLinks(text, refsOf(text), (r) => r.original), { text, changed: 0 });
});

test('rewriteLinks: a stale position gives null', () => {
	const text = 'a [[b]] c';
	assert.equal(rewriteLinks(text, refsOf(text).map((r) => ({ ...r, start: r.start + 1, end: r.end + 1 })), () => '[[x]]'), null);
});

test('rewriteLinks: a link holding one rewritten is left', () => {
	const text = '[![[x/y]]](../top.md)';
	const refs = [{ start: 0, end: text.length, original: text, link: '../top.md' }, { start: 1, end: 9, original: '![[x/y]]', link: 'x/y' }];
	assert.deepEqual(rewriteLinks(text, refs, (r) => (r.link === 'x/y' ? '![[y]]' : 'WRONG')), { text: '[![[y]]](../top.md)', changed: 1 });
});

test('matchesExceptLinks: converted links are not edits', () => {
	const forked = 'See [sorting](../cs/algorithms.md) and [[cs/b]], [[c#H]].\n\n![[c]]\n[x](b.md#My%20Heading)\n';
	const note = 'See [[algorithms|sorting]] and [[b]], [[c 1#H|c > H]].\n\n![[c 1|c]]\n[[b#My Heading|x]]\n';
	assert.ok(matchesExceptLinks(note, forked));
	assert.ok(matchesExceptLinks(forked, forked));
});

test('matchesExceptLinks: changed words, subpath, embed, links or text are edits', () => {
	const forked = 'See [sorting](cs/a.md#H) and ![[c]].\n';
	assert.ok(!matchesExceptLinks('See [[a#H|sorted]] and ![[c]].\n', forked));
	assert.ok(!matchesExceptLinks('See [[a#I|sorting]] and ![[c]].\n', forked));
	assert.ok(!matchesExceptLinks('See [[a#H|sorting]] and [[c]].\n', forked));
	assert.ok(!matchesExceptLinks('See [[a#H|sorting]] and ![[c]] [[d]].\n', forked));
	assert.ok(!matchesExceptLinks('See [[a#H|sorting]], and ![[c]].\n', forked));
	assert.ok(!matchesExceptLinks('See [sorting](cs/a.md#H) and ![[c]].\nMore.\n', forked));
});

test('shortestName: the shortest end of the path upstream reads back as the note', () => {
	assert.equal(shortestName('wiki/c.md', FROM, FILES, true), 'c');
	assert.equal(shortestName('wiki/c.md', FROM, FILES, false), 'c');
	// `b` is two files upstream: the shortest that is only this one.
	assert.equal(shortestName('wiki/cs/b.md', FROM, FILES, true), 'wiki/cs/b');
	assert.equal(shortestName('cs/b.md', FROM, FILES, true), 'cs/b');
	// A Markdown link is read from the note's folder first: `cs/b` there is wiki/cs/b.md.
	assert.equal(shortestName('wiki/cs/b.md', FROM, FILES, false), 'cs/b');
	assert.equal(shortestName('cs/b.md', FROM, FILES, false), null);
	assert.equal(shortestName('img/p.png', FROM, FILES, true), null);
});

test('missingName: a page not written yet, when upstream has nothing of that name', () => {
	const name = (original: string, link: string) => missingName({ original, link }, FROM, FILES, false);
	assert.equal(name('[[Some Idea]]', 'Some Idea'), 'Some Idea');
	assert.equal(name('[x](../ideas/some-idea.md#H)', '../ideas/some-idea.md#H'), 'some-idea');
	// `c` is another note upstream.
	assert.equal(name('[x](../ideas/c.md)', '../ideas/c.md'), null);
	// A folder, or a file that isn't a note.
	assert.equal(name('[src](../src)', '../src'), null);
	assert.equal(name('[src](../src/)', '../src/'), null);
	assert.equal(name('![[img/gone.png]]', 'img/gone.png'), null);
});

/** `original` pointed at `to`, in a wikilink vault and in a Markdown one. */
function both(original: string, link: string, to: string, line = original): (string | null)[] {
	return [true, false].map((wiki) => relink({ original, link }, to, wiki, line));
}

test('relink: as the vault writes links, showing the same words', () => {
	assert.deepEqual(both('[[test one]]', 'test one', 'test one'), ['[[test one]]', '[test one](test%20one.md)']);
	assert.deepEqual(both('[[b]]', 'b', '../community/txt/cs/b'), ['[[../community/txt/cs/b]]', '[b](../community/txt/cs/b.md)']);
	assert.deepEqual(both('[[cs/b]]', 'cs/b', 'b'), ['[[b]]', '[b](b.md)']);
	assert.deepEqual(both('[[b]]', 'b', 'b 1'), ['[[b 1|b]]', '[b](b%201.md)']);
	assert.deepEqual(both('[see](../cs/b.md)', '../cs/b.md', 'b'), ['[[b|see]]', '[see](b.md)']);
	assert.deepEqual(both('[b](../cs/b.md)', '../cs/b.md', 'b'), ['[[b]]', '[b](b.md)']);
});

test('relink: subpath, embed, case and spaces', () => {
	assert.deepEqual(both('[[x/c#My Heading|see c]]', 'x/c#My Heading', 'c'), ['[[c#My Heading|see c]]', '[see c](c.md#My%20Heading)']);
	assert.deepEqual(both('[[c#H]]', 'c#H', 'c'), ['[[c#H]]', '[c > H](c.md#H)']);
	assert.deepEqual(both('![[x/c#^blk]]', 'x/c#^blk', 'c'), ['![[c#^blk]]', '![c > ^blk](c.md#^blk)']);
	assert.deepEqual(both('![c](x/c.md)', 'x/c.md', 'c'), ['![[c]]', '![c](c.md)']);
	assert.deepEqual(both('[c](./c.md#My%20Heading)', './c.md#My Heading', 'c'), ['[[c#My Heading|c]]', '[c](c.md#My%20Heading)']);
	assert.deepEqual(both('[[wiki/C]]', 'wiki/C', 'c'), ['[[C]]', '[C](c.md)']);
	assert.deepEqual(both('[n](<./My Note.md#H>)', './My Note.md#H', 'My Note'), ['[[My Note#H|n]]', '[n](<My%20Note.md#H>)']);
});

test('relink: in a table the pipe is escaped', () => {
	assert.deepEqual(both('[[x/c\\|see]]', 'x/c', 'c', '| [[x/c\\|see]] | 1 |'), ['[[c\\|see]]', '[see](c.md)']);
	assert.deepEqual(both('[[x/c#H\\|see]]', 'x/c#H', 'c', '| [[x/c#H\\|see]] |'), ['[[c#H\\|see]]', '[see](c.md#H)']);
	assert.deepEqual(both('[see](x/c.md)', 'x/c.md', 'c', '| [see](x/c.md) |'), ['[[c\\|see]]', '[see](c.md)']);
});

test('relink: what the other form can\'t hold keeps its form', () => {
	assert.deepEqual(both('[c](x/c.md "T")', 'x/c.md', 'c'), ['[c](c.md "T")', '[c](c.md "T")']);
	assert.deepEqual(both('[a|b](x/c.md)', 'x/c.md', 'c'), ['[a|b](c.md)', '[a|b](c.md)']);
});

test('relink: left when cut elsewhere than Obsidian cuts it, or the name can\'t be in a link', () => {
	assert.deepEqual(both('[c](./c(1).md)', './c(1).md', 'c(1)'), [null, null]);
	assert.deepEqual(both('[c](./C%23.md)', './C#.md', 'c'), [null, null]);
	assert.deepEqual(both('[[c]]', 'c', 'a#b'), [null, null]);
	assert.deepEqual(both('[[x/c|a [b] c]]', 'x/c', 'c'), [null, null]);
});

test('relink: a second time changes nothing, and neither is an edit', () => {
	const cases: [string, string, string][] = [['[[cs/b]]', 'cs/b', 'b'], ['[[b]]', 'b', '../x/b 1'], ['[s](../cs/b.md#A%20B)', '../cs/b.md#A B', 'b'], ['[[x/c#H\\|see]]', 'x/c#H', 'c'], ['![[C]]', 'C', 'c']];
	for (const [original, link, to] of cases) {
		for (const wiki of [true, false]) {
			const once = relink({ original, link }, to, wiki, '| x') ?? '';
			const now = refsOf(once)[0]?.link.replace(/\\$/, '') ?? '';
			assert.equal(relink({ original: once, link: now }, to, wiki, '| x'), once);
			assert.ok(matchesExceptLinks(once, original), `${original} ${once}`);
		}
	}
});
