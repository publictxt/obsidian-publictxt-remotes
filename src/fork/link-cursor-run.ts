// The link under the cursor (docs/features/fork-links.md): converted, matched, or both, in the
// editor, so it can be undone.

import { Notice, type App, type Editor, type TFile } from 'obsidian';
import { isWikilink, notePath, type LinkRef } from './links.ts';
import { refsOf, rewriterFor, type LinkWork } from './links-run.ts';

/** Does `work` on the link under the cursor of `editor`, showing `file`. A notice says what came of it. */
export function workAtCursor(app: App, editor: Editor, file: TFile | null, work: LinkWork): void {
	if (!file) {
		new Notice('No note is open.');
		return;
	}
	const at = editor.posToOffset(editor.getCursor());
	const text = editor.getValue();
	// The cache may lag the editor: only a link still where it says counts.
	const ref = refsOf(app.metadataCache.getFileCache(file)).find((r) => r.start <= at && at <= r.end && text.slice(r.start, r.end) === r.original);
	if (!ref) {
		new Notice('No link here.');
		return;
	}
	const from = editor.offsetToPos(ref.start);
	const { rewrite, wiki, several, none } = rewriterFor(app, file, [ref], work);
	const { link, to } = rewrite(ref, editor.getLine(from.line));
	if (link !== null && link !== ref.original) {
		editor.replaceRange(link, from, editor.offsetToPos(ref.end));
		new Notice(to ? `Matched the link to ${to.path}.` : `Converted the link to ${linkName(wiki)}.`);
		return;
	}
	new Notice(whyLeft(ref, work, wiki, several, none));
}

/** Why `ref` was left as it is. */
function whyLeft(ref: LinkRef, work: LinkWork, wiki: boolean, several: number, none: number): string {
	if (notePath(ref) === null) return 'This link isn\'t to a note.';
	const why: string[] = [];
	if (work.match) {
		if (several) why.push('Several notes have its name.');
		else if (none) why.push('No note has its name.');
		else if (!work.convert) why.push('This link isn\'t broken.');
	}
	if (work.convert) {
		if (isWikilink(ref.original) === wiki) why.push(`It is a ${linkName(wiki)} already.`);
		else why.push(`It can't be written as a ${linkName(wiki)}.`);
	}
	return why.length ? `Link left as it is. ${why.join(' ')}` : 'Link left as it is.';
}

function linkName(wiki: boolean): string {
	return wiki ? 'wikilink' : 'Markdown link';
}
