import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { App, TFile } from 'obsidian';
import { rewriterFor } from '../src/links/rewrite-run.ts';
import type { LinkRef } from '../src/links/links.ts';

/**
 * A vault of `paths`, finding notes as Obsidian does: by the path from the linking note's folder,
 * from the root, then by name; as written when it ends in `.md`, else with `.md` added.
 */
function vault(paths: string[], wiki: boolean): { app: App; file: (p: string) => TFile } {
	const files = paths.map(note);
	const byPath = (p: string) => files.find((f) => f.path.toLowerCase() === p.toLowerCase()) ?? null;
	const join = (dir: string, p: string) => {
		const out: string[] = dir ? dir.split('/') : [];
		for (const part of p.split('/')) part === '..' ? out.pop() : out.push(part);
		return out.join('/');
	};
	const find = (linkpath: string, source: string): TFile | null => {
		const dir = source.split('/').slice(0, -1).join('/');
		for (const p of /\.md$/i.test(linkpath) ? [linkpath, `${linkpath}.md`] : [`${linkpath}.md`]) {
			const f = byPath(join(dir, p)) ?? byPath(p) ?? files.find((g) => g.path.toLowerCase().endsWith(`/${p.toLowerCase()}`));
			if (f) return f;
		}
		return null;
	};
	const app = {
		metadataCache: {
			getFirstLinkpathDest: (linkpath: string, source: string) => find(linkpath, source),
			fileToLinktext: (f: TFile) => {
				const name = f.path.split('/').pop()!.replace(/\.md$/i, '');
				return files.filter((g) => g.path.split('/').pop()!.replace(/\.md$/i, '') === name).length === 1 ? name : f.path.replace(/\.md$/i, '');
			},
		},
		fileManager: { generateMarkdownLink: () => (wiki ? '[[x]]' : '[x](x.md)') },
	};
	return { app: standIn<App>(app), file: (p) => byPath(p) ?? note(p) };
}

/** A note at `path`, as far as the rewriter looks: its path. No `TFile` outside Obsidian. */
function note(path: string): TFile {
	return standIn<TFile>({ path });
}

function standIn<T>(value: unknown): T {
	return value as T;
}

const ref = (original: string, link: string): LinkRef => ({ start: 0, end: original.length, original, link });

test('rewrite: Markdown links by a relative path, to the note Obsidian finds', () => {
	const { app, file } = vault(['notes/a.md', 'wiki/x/Obsidian.md'], false);
	const { rewrite } = rewriterFor(app, file('notes/a.md'), { convert: true, match: false });
	assert.equal(rewrite(ref('[[Obsidian]]', 'Obsidian'), '').link, '[Obsidian](../wiki/x/Obsidian.md)');
	assert.equal(rewrite(ref('[Obsidian](Obsidian.md)', 'Obsidian.md'), '').link, '[Obsidian](../wiki/x/Obsidian.md)');
	// Already so: the same link, which counts as no change.
	assert.equal(rewrite(ref('[Obsidian](../wiki/x/Obsidian.md)', '../wiki/x/Obsidian.md'), '').link, '[Obsidian](../wiki/x/Obsidian.md)');
});

test('rewrite: matching points a broken link at the note of its name', () => {
	const { app, file } = vault(['notes/a.md', 'wiki/b.md'], true);
	const r = rewriterFor(app, file('notes/a.md'), { convert: false, match: true }).rewrite(ref('[[../cs/b|see]]', '../cs/b'), '');
	assert.equal(r.link, '[[b|see]]');
	assert.equal(r.matched?.path, 'wiki/b.md');
	const none = rewriterFor(app, file('notes/a.md'), { convert: false, match: true }).rewrite(ref('[[gone]]', 'gone'), '');
	assert.deepEqual([none.link, none.broken, none.matched], [null, true, null]);
});

test('rewrite: wikilinks by the shortest', () => {
	const { app, file } = vault(['a.md', 'cs/b.md'], true);
	const { rewrite } = rewriterFor(app, file('a.md'), { convert: true, match: false });
	assert.equal(rewrite(ref('[see](cs/b.md)', 'cs/b.md'), '').link, '[[b|see]]');
	assert.equal(rewrite(ref('[[cs/b|see]]', 'cs/b'), '').link, '[[b|see]]');
});

test('rewrite: a link the vault\'s form can\'t hold is left, its path too', () => {
	const { app, file } = vault(['notes/a.md', 'cs/b.md'], true);
	const { rewrite } = rewriterFor(app, file('notes/a.md'), { convert: true, match: false });
	const r = rewrite(ref('[see [1]](../cs/b.md)', '../cs/b.md'), '');
	assert.equal(r.link, null);
	assert.equal(r.target?.path, 'cs/b.md');
});

test('rewrite: a link to no note keeps its path, in the other form', () => {
	const { app, file } = vault(['a.md'], false);
	const { rewrite } = rewriterFor(app, file('a.md'), { convert: true, match: false });
	assert.equal(rewrite(ref('[[cs/gone]]', 'cs/gone'), '').link, '[gone](cs/gone.md)');
});
