import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWikilink, linkByName, linkShows, matchesExceptLinks, rewriteLinks, shortestName, splitLink, upstreamTarget, upstreamFiles, type LinkRef } from '../src/fork/links.ts';

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

/** `original` by name, as from the fork of `FROM`. */
function named(original: string, link: string, files = FILES): string | null {
	return linkByName({ original, link }, FROM, files);
}

test('linkByName: a path becomes a name, in the link\'s own form', () => {
	assert.equal(named('[t](../top.md)', '../top.md'), '[t](top.md)');
	assert.equal(named('[t](/top.md)', '/top.md'), '[t](top.md)');
	assert.equal(named('[c](./c)', './c'), '[c](c.md)');
	assert.equal(named('[[wiki/c]]', 'wiki/c'), '[[c]]');
	assert.equal(named('[[/top]]', '/top'), '[[top]]');
	assert.equal(named('[[../top.md]]', '../top.md'), '[[top]]');
	assert.equal(named('![[wiki/c]]', 'wiki/c'), '![[c]]');
});

test('linkByName: only the path changes', () => {
	assert.equal(named('[see [c]](./c.md#My%20Heading "A title")', './c.md#My Heading'), '[see [c]](c.md#My%20Heading "A title")');
	assert.equal(named('[[wiki/c#H|see c]]', 'wiki/c#H'), '[[c#H|see c]]');
	assert.equal(named('[[wiki/c#^blk]]', 'wiki/c#^blk'), '[[c#^blk]]');
	// In a table the pipe is escaped.
	assert.equal(named('[[wiki/c\\|see c]]', 'wiki/c'), '[[c\\|see c]]');
	// A name is written as the link wrote it.
	assert.equal(named('[[wiki/C]]', 'wiki/C'), '[[C]]');
	// Spaces: encoded, or in angle brackets. The cache decodes them.
	assert.equal(named('[n](./My%20Note.md)', './My Note.md'), '[n](My%20Note.md)');
	assert.equal(named('[n](<./My Note.md#H>)', './My Note.md#H'), '[n](<My%20Note.md#H>)');
});

test('linkByName: a name that is several notes upstream keeps enough of its path, or is left', () => {
	assert.equal(named('[[./cs/b]]', './cs/b'), '[[wiki/cs/b]]');
	assert.equal(named('[b](/wiki/cs/b.md)', '/wiki/cs/b.md'), '[b](cs/b.md)');
	assert.equal(named('[[cs/b]]', 'cs/b'), '[[cs/b]]');
	assert.equal(named('[b](/cs/b.md)', '/cs/b.md'), null);
});

test('linkByName: a page not written yet, when upstream has nothing of that name', () => {
	assert.equal(named('[x](../ideas/some-idea.md)', '../ideas/some-idea.md'), '[x](some-idea.md)');
	assert.equal(named('[[ideas/Some Idea]]', 'ideas/Some Idea'), '[[Some Idea]]');
	// `c` is another note upstream.
	assert.equal(named('[x](../ideas/c.md)', '../ideas/c.md'), null);
	// A folder, or a file that isn't a note.
	assert.equal(named('[src](../src)', '../src'), null);
	assert.equal(named('[src](../src/)', '../src/'), null);
	assert.equal(named('![[img/gone.png]]', 'img/gone.png'), null);
});

test('linkByName: left as written', () => {
	// By name already, within the note, the web, an image.
	assert.equal(named('[[c]]', 'c'), null);
	assert.equal(named('[c](c.md#a/b)', 'c.md#a/b'), null);
	assert.equal(named('[[#a/b]]', '#a/b'), null);
	assert.equal(named('[w](https://example.com/a.md)', 'https://example.com/a.md'), null);
	assert.equal(named('![p](../img/p.png)', '../img/p.png'), null);
	// Cut elsewhere than Obsidian cuts it.
	assert.equal(named('[c](./c(1).md)', './c(1).md', upstreamFiles(['wiki/a.md', 'wiki/c(1).md'])), null);
	assert.equal(named('[c](./C%23.md)', './C#.md', upstreamFiles(['wiki/a.md', 'wiki/C#.md'])), null);
});

test('linkByName: a second run changes nothing, and it is no edit', () => {
	const text = '[t](../top.md#H) [[wiki/c|c]] [[wiki/C]] [[./cs/b]] [n](<./My Note.md>) [i](../ideas/new.md "T")\n';
	const run = (t: string) => rewriteLinks(t, refsOf(t).map((r) => ({ ...r, link: r.link.replace(/^<|>$| "T"$/g, '') })), (r) => linkByName(r, FROM, FILES))?.text;
	const once = run(text);
	assert.equal(once, '[t](top.md#H) [[c|c]] [[C]] [[wiki/cs/b]] [n](<My%20Note.md>) [i](new.md "T")\n');
	assert.equal(run(once ?? ''), once);
	assert.ok(matchesExceptLinks(once ?? '', text));
});
