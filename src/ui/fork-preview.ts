// What the fork modal's choices would write: one line for one file, a list for several, or
// the error that stops it. Draws only.

import { noteName, type PlannedFork, type Resolved } from '../fork/destination.ts';

/** Redraws `el`. `earlier`: notes already forked from each path. `mirrored`: each path's mirror note, which moves. `one`: a single file, with a name field. */
export function renderForkPreview(el: HTMLElement, resolved: Resolved, earlier: ReadonlyMap<string, readonly string[]>, mirrored: ReadonlyMap<string, string>, one: boolean): void {
	el.empty();
	if (!resolved.ok) {
		el.createDiv({ cls: 'publictxt-error', text: resolved.error });
		return;
	}
	const { plan, newFolders } = resolved;
	const [first] = plan;
	if (one && first) {
		el.createDiv({ text: `Goes to ${first.to}` });
		if (first.numbered) note(el, `${noteName(first.path)}.md exists there, so another name is suggested.`);
	}
	if (newFolders.length) note(el, `New ${newFolders.length === 1 ? 'folder' : 'folders'}: ${newFolders.join(', ')}.`);
	if (!one) planList(el, plan, earlier, mirrored);
}

function planList(el: HTMLElement, plan: readonly PlannedFork[], earlier: ReadonlyMap<string, readonly string[]>, mirrored: ReadonlyMap<string, string>): void {
	const list = el.createDiv({ cls: 'publictxt-fork-plan' });
	for (const p of plan) {
		const row = list.createDiv();
		row.createSpan({ text: p.path });
		row.createSpan({ cls: 'publictxt-fork-to', text: ` → ${p.to}` });
		const notes = [p.numbered ? 'Name taken.' : '', earlier.get(p.path)?.length ? 'Forked before.' : '', mirrored.has(p.path) ? 'Its mirror moves.' : ''].filter(Boolean);
		if (notes.length) row.createSpan({ cls: 'publictxt-fork-note', text: ` ${notes.join(' ')}` });
	}
}

function note(el: HTMLElement, text: string): void {
	el.createDiv({ cls: 'publictxt-fork-note', text });
}
