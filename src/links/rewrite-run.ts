// What a note's links become (docs/features/links.md): the note each is to, by Obsidian's rules,
// and the link to it as the vault writes links.

import type { App, TFile } from 'obsidian';
import { baseName, splitLink } from '../copy/link-text.ts';
import { isWikilink, notePath, reformat, relativePath, relink, type LinkRef } from './links.ts';

/** What to do with a note's links. */
export interface LinkWork {
	/** Write them as the vault writes links, to the note each is to. */
	convert: boolean;
	/** Point those Obsidian finds no note by at the note Obsidian finds by their name. */
	match: boolean;
}

/** What came of one link. */
export interface LinkResult {
	/** The link rewritten; `null`: left. */
	link: string | null;
	/** Whether Obsidian finds no note by it. */
	broken: boolean;
	/** The note it was matched to. */
	matched: TFile | null;
	/** The note it is to, for converting, and the path to it. */
	target: TFile | null;
	targetPath: string | null;
}

export type Rewrite = (ref: LinkRef, line: string) => LinkResult;

/** How `work` rewrites the links of `file`, from their line, and whether the vault writes wikilinks. */
export function rewriterFor(app: App, file: TFile, work: LinkWork): { rewrite: Rewrite; wiki: boolean } {
	const wiki = writesWikilinks(app, file);
	const find = (linkpath: string) => app.metadataCache.getFirstLinkpathDest(linkpath, file.path);
	const pathTo = (to: TFile) => (wiki ? app.metadataCache.fileToLinktext(to, file.path, true) : relativePath(file.path, to.path).replace(/\.md$/i, ''));
	const rewrite: Rewrite = (ref, line) => {
		const left: LinkResult = { link: null, broken: false, matched: null, target: null, targetPath: null };
		const path = notePath(ref);
		if (path === null) return left;
		const found = find(splitLink(ref.link).path);
		const broken = found === null;
		if (broken && work.match) {
			const matched = find(baseName(path).replace(/\.md$/i, ''));
			const link = matched && relink(ref, pathTo(matched), wiki, line);
			if (matched && link) return { ...left, link, broken, matched };
		}
		if (!work.convert) return { ...left, broken };
		if (!found) return { ...left, link: reformat(ref, wiki, line), broken };
		const targetPath = pathTo(found);
		const link = relink(ref, targetPath, wiki, line);
		// Not in the vault's form: the other form can't hold it, so it is left.
		return { link: link !== null && isWikilink(link) === wiki ? link : null, broken, matched: null, target: found, targetPath };
	};
	return { rewrite, wiki };
}

/** Whether the vault writes wikilinks. Obsidian's setting isn't public API: ask it for a link and see which kind comes back. */
export function writesWikilinks(app: App, file: TFile): boolean {
	return app.fileManager.generateMarkdownLink(file, file.path).startsWith('[[');
}
