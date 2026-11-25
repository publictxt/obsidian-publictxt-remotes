import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWikilink, linkShows, matchesExceptLinks, nameOf, notePath, reformat, relink, rewriteLinks, splitLink, type LinkRef } from '../src/fork/links.ts';

test('splitLink and isWikilink', () => {
	assert.deepEqual(splitLink('a.md#H#I'), { path: 'a.md', subpath: '#H#I' });
	assert.deepEqual(splitLink('a'), { path: 'a', subpath: '' });
	assert.ok(isWikilink('[[a]]'));
	assert.ok(isWikilink('![[a]]'));
	assert.ok(!isWikilink('[a](a.md)'));
});

test('notePath: links to notes only', () => {
	const path = (original: string, link: string) => notePath({ original, link });
	assert.equal(path('[[cs/b#H|x]]', 'cs/b#H'), 'cs/b');
	assert.equal(path('[b](../cs/My%20Note.md#H)', '../cs/My%20Note.md#H'), '../cs/My Note.md');
	assert.equal(path('[[v1.2 notes]]', 'v1.2 notes'), 'v1.2 notes');
	assert.equal(path('[[#H]]', '#H'), null);
	assert.equal(path('[w](https://example.com/a.md)', 'https://example.com/a.md'), null);
	assert.equal(path('![[p.png]]', 'p.png'), null);
	assert.equal(path('![p](../img/p.png)', '../img/p.png'), null);
	// Perhaps a folder.
	assert.equal(path('[src](../src)', '../src'), null);
	assert.equal(path('[[src/]]', 'src/'), null);
});

test('nameOf: the name, without folder, .md or case', () => {
	assert.equal(nameOf('../cs/My Note.md'), 'my note');
	assert.equal(nameOf('B'), 'b');
});

/** `original` as a wikilink vault writes it, and as a Markdown one does. */
function forms(original: string, link: string, line = original): (string | null)[] {
	return [true, false].map((wiki) => reformat({ original, link }, wiki, line));
}

test('reformat: the form changes, the path stays', () => {
	assert.deepEqual(forms('[[test one]]', 'test one'), [null, '[test one](test%20one.md)']);
	assert.deepEqual(forms('[[cs/b|see]]', 'cs/b'), [null, '[see](cs/b.md)']);
	assert.deepEqual(forms('![[../c#My Heading]]', '../c#My Heading'), [null, '![c > My Heading](../c.md#My%20Heading)']);
	assert.deepEqual(forms('[see](../cs/b.md#My%20Heading)', '../cs/b.md#My Heading'), ['[[../cs/b#My Heading|see]]', null]);
	assert.deepEqual(forms('[d](./d.md)', './d.md'), ['[[./d]]', null]);
	assert.deepEqual(forms('[b](/cs/b.md)', '/cs/b.md'), ['[[/cs/b]]', null]);
	assert.deepEqual(forms('[n](<My Note.md>)', 'My Note.md'), ['[[My Note|n]]', null]);
	assert.deepEqual(forms('[see](x/c.md)', 'x/c.md', '| [see](x/c.md) |'), ['[[x/c\\|see]]', null]);
	assert.deepEqual(forms('[[x/c\\|see]]', 'x/c', '| [[x/c\\|see]] |'), [null, '[see](x/c.md)']);
});

test('reformat: left', () => {
	// The other form can't hold it, or it isn't to a note.
	assert.deepEqual(forms('[c](x/c.md "T")', 'x/c.md'), [null, null]);
	assert.deepEqual(forms('[a|b](c.md)', 'c.md'), [null, null]);
	assert.deepEqual(forms('[c](./c(1).md)', './c(1).md'), [null, null]);
	assert.deepEqual(forms('![[p.png]]', 'p.png'), [null, null]);
	assert.deepEqual(forms('[w](https://example.com/a.md)', 'https://example.com/a.md'), [null, null]);
	assert.deepEqual(forms('[src](../src)', '../src'), [null, null]);
});

test('reformat: is no edit', () => {
	for (const [original, link] of [['[[cs/b]]', 'cs/b'], ['[s](../cs/b.md#A%20B)', '../cs/b.md#A B'], ['[[x/c#H\\|see]]', 'x/c#H'], ['![[C]]', 'C']] as const) {
		for (const f of forms(original, link, '| x')) if (f) assert.ok(matchesExceptLinks(f, original), `${original} ${f}`);
	}
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
	assert.deepEqual(both('[[wiki/C]]', 'wiki/C', 'c'), ['[[c|C]]', '[C](c.md)']);
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
