// The link under the cursor (docs/features/links.md): converted, matched, or both, in the
// editor, so it can be undone.

import { Notice, type App, type Editor, type TFile } from 'obsidian';
import { isWikilink, notePath, relink, type LinkRef } from './links.ts';
import { refsOf } from './run.ts';
import { rewriterFor, type LinkResult, type LinkWork } from './rewrite-run.ts';

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
	const line = editor.getLine(from.line);
	const { rewrite, wiki } = rewriterFor(app, file, work);
	const r = rewrite(ref, line);
	if (r.link !== null && r.link !== ref.original) {
		editor.replaceRange(r.link, from, editor.offsetToPos(ref.end));
		new Notice(doneText(ref, r, wiki));
		return;
	}
	new Notice(`Link left as it is. ${whyLeft(ref, r, work, wiki, line)}`);
}

/** What was done to `ref`. */
function doneText(ref: LinkRef, r: LinkResult, wiki: boolean): string {
	if (r.matched) return `Matched the link to ${r.matched.path}.`;
	if (isWikilink(ref.original) !== wiki) return `Converted the link to a ${linkName(wiki)}.`;
	return r.target ? `Rewrote the link's path to ${r.target.path}.` : 'Rewrote the link.';
}

/** Why `ref` was left as it is. */
function whyLeft(ref: LinkRef, r: LinkResult, work: LinkWork, wiki: boolean, line: string): string {
	if (notePath(ref) === null) return 'It isn\'t to a note.';
	const why: string[] = [];
	if (work.match && r.broken) why.push('No note has its name.');
	if (work.match && !r.broken && !work.convert) why.push('It isn\'t broken.');
	if (work.convert) {
		if (isWikilink(ref.original) !== wiki) why.push(`It can't be written as a ${linkName(wiki)}.`);
		else if (!r.target) {
			if (!work.match) why.push('No note is found by it.');
		} else if (r.targetPath !== null && relink(ref, r.targetPath, wiki, line) === ref.original) why.push(`It is a ${linkName(wiki)} by that path already.`);
		else why.push('The path to its note can\'t be written in this link.');
	}
	return why.join(' ');
}

function linkName(wiki: boolean): string {
	return wiki ? 'wikilink' : 'Markdown link';
}
