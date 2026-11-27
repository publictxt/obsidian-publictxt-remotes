// One source in the check view: a header that opens and closes it, then an error, "nothing
// new", the filter, what's new, mirrors and forks; then all files, when asked for
// (docs/features/check.md). Draws only: clicks are
// the view's. An element says what a click on it does with `data-open` (a note to open) or
// `data-action`; the source it belongs to is the nearest `data-source` (the source's key).

import { hasNews, type NewReason, type SourceCheck } from '../check/check.ts';
import type { SourceResult } from '../check/run.ts';
import { changesIn, selectedPaths } from '../check/selection.ts';
import { isLocalRepo } from '../sources/repo-url.ts';
import type { CheckFrom } from '../sources/schema.ts';
import type { TagsState } from '../tags/run.ts';
import { actionAttrs, setAction } from './check-actions.ts';
import { folderRows, listed, rowAction, type Drawing } from './file-rows.ts';
import { sourceOpen, type SourceUi } from './source-ui.ts';
import { filterButton, filtering, answered, narrowed, renderFilter } from './filter-panel.ts';
import { treeFlair, treeItem } from './tree.ts';

const REASON: Record<NewReason, string> = {
	'first-check': 'First check: every file is listed. Mark as seen to start from here.',
	'history-rewritten': 'History was rewritten since you last looked: every file is listed.',
};

/**
 * For a hosted source with a local copy, the same finding has a likelier cause: what was last
 * seen came from the other one (an unpushed commit, or a remote ahead of the copy).
 */
const COPY_REWRITTEN = 'This head doesn\'t follow the commit you last saw: the local copy and the remote are likely at different commits, or history was rewritten. Every file is listed.';

/** Why every file is listed, if it is. `copy`: the source has a local copy. */
function reasonText(reason: NewReason | null, copy: boolean): string | null {
	if (reason === 'history-rewritten' && copy) return COPY_REWRITTEN;
	return reason ? REASON[reason] : null;
}

/** What a source's header offers besides opening it. */
export interface HeaderOffers {
	/** Where it is checked from, for a hosted source with a local copy; `null`: no choice. */
	from: CheckFrom | null;
	/** A check is running: the choice waits. */
	busy: boolean;
}

export function renderSource(parent: HTMLElement, r: SourceResult, ui: SourceUi, offers: HeaderOffers, tags: TagsState): void {
	const source = parent.createDiv({ cls: 'publictxt-source', attr: { 'data-source': r.follow.url } });
	const el = header(source, r, sourceOpen(r, ui), offers);
	if (!el) return;

	if (r.error !== null) {
		el.createEl('p', { cls: 'publictxt-error', text: r.error });
		return;
	}
	const c = r.check;
	const d: Drawing = { c, ui, unsettled: new Set(c.forks.map((f) => f.path)), reason: reasonText(c.reason, offers.from !== null) };
	if (!hasNews(c)) el.createEl('p', { cls: 'publictxt-quiet', text: 'Nothing new since you last looked.' });
	const shown = narrowed(c, ui.filter, tags);
	const found = answered(ui.filter, tags);
	actions(el, c, ui, shown);
	if (c.files.length) renderFilter(el, ui.filter, c, tags, r.follow.followTags);
	changes(el, { ...d, c: shown }, c, found);
	mirrors(el, c);
	forks(el, c);
	allFiles(el, { ...d, c: shown }, c.files.length, found);
}

/** What can be done with the whole source: before the lists, which can be long. */
function actions(el: HTMLElement, c: SourceCheck, ui: SourceUi, shown: SourceCheck): void {
	const seeable = c.changes.length > 0 || c.reason !== null;
	const selected = selectedPaths(c, ui.selected).length;
	// Ticked, and left out by the filter.
	const hidden = selected - selectedPaths(shown, ui.selected).length;
	const count = hidden ? `${selected}, ${hidden} hidden` : String(selected);
	const stale = c.mirrors.filter((m) => m.status === 'modified').length;
	const row = el.createDiv({ cls: 'publictxt-actions' });
	// Seeing acknowledges every change, the hidden ones too: the button says so.
	const ack = filtering(ui.filter) && c.changes.length ? `Mark all ${c.changes.length} as seen` : 'Mark as seen';
	if (seeable) row.createEl('button', { text: ack, attr: actionAttrs('ack') });
	row.createEl('button', { text: ui.browse ? 'Hide all files' : 'Browse all files', attr: { ...actionAttrs('browse'), 'aria-label': 'Every file at head, whatever you have seen' } });
	if (c.files.length) filterButton(row, ui.filter);
	if (stale) row.createEl('button', { text: `Update mirrors (${stale})`, attr: { ...actionAttrs('update-mirrors'), 'aria-label': 'Overwrite each mirror with what is upstream now. Edited ones are left.' } });
	if (selected) row.createEl('button', { text: `Mirror selected (${count})`, cls: 'mod-cta', attr: { ...actionAttrs('mirror-selected'), 'aria-label': 'Copy them into the community folder, as upstream\'s' } });
	if (selected) row.createEl('button', { text: `Fork selected (${count})`, attr: { ...actionAttrs('fork-selected'), 'aria-label': 'Take them into your notes, as yours' } });
}

/** The row that opens and closes the source. Returns where its details go, or `null` when closed. */
function header(source: HTMLElement, r: SourceResult, open: boolean, offers: HeaderOffers): HTMLElement | null {
	const local = isLocalRepo(r.follow.url);
	const item = treeItem(source, open);
	item.self.addClass('publictxt-source-head');
	setAction(item.self, 'toggle-source');
	item.inner.createEl('a', { text: r.follow.name, attr: { 'data-open': r.follow.path, 'aria-label': local ? 'Local source' : r.follow.url } });
	if (r.check) item.inner.createSpan({ cls: 'publictxt-branch', text: ` · ${r.check.head.branch}` });
	treeFlair(item, summary(r));
	if (offers.from !== null) {
		// Local or remote: chosen here, never for the user. Selecting one checks this source from there.
		const pick = item.self.createSpan({ cls: 'publictxt-from' });
		const choice = (from: CheckFrom, text: string, label: string) =>
			pick.createEl('button', {
				text,
				cls: offers.from === from ? 'mod-cta' : '',
				attr: { ...actionAttrs(from === 'local' ? 'from-local' : 'from-remote'), 'aria-label': label, 'aria-pressed': String(offers.from === from), ...(offers.busy ? { disabled: 'true' } : {}) },
			});
		choice('local', 'Local', 'Check from the local copy on this computer');
		choice('remote', 'Remote', `Check from ${r.follow.url}`);
	}
	// For the folder being checked: a local source's, or a local copy while it is what is checked.
	// A copy checked from the remote would commit, and the check after show nothing of it.
	if (local || offers.from === 'local') {
		item.self.createEl('button', { text: 'Snapshot', attr: { ...actionAttrs('snapshot'), 'aria-label': local ? 'Commit what changed in this folder, then check again' : 'Commit what changed in the local copy, then check again' } });
	}
	return item.children;
}

/** What a closed source still says: `New 4 · Other 3 · Mirrors 2 · Forks 1`; other changes only with followed tags. */
function summary(r: SourceResult): string {
	if (r.check === null) return 'Error';
	const counts: [string, number][] = [
		['New', changesIn(r.check, 'new').length],
		['Other', changesIn(r.check, 'other').length],
		['Mirrors', r.check.mirrors.length],
		['Forks', r.check.forks.length],
	];
	const parts = counts.filter(([, n]) => n > 0).map(([label, n]) => `${label} ${n}`);
	return parts.join(' · ') || 'Nothing new';
}

/** `n`, or "n of total" once the filter has an answer (`found`). */
function counted(n: number, total: number, found: boolean): string {
	return found ? `${n} of ${total}` : String(total);
}

/**
 * What changed, those the tag filter lets through (`all`: the check without it). With followed
 * tags, those that match, then the others, folded.
 */
function changes(el: HTMLElement, d: Drawing, all: SourceCheck, found: boolean): void {
	const { c } = d;
	if (!all.changes.length) return;
	const [n, total] = [changesIn(c, 'new').length, changesIn(all, 'new').length];
	el.createEl('h5', { text: `What's new (${counted(n, total, found)})` });
	if (d.reason) el.createEl('p', { cls: 'publictxt-quiet', text: d.reason });
	if (!total) el.createEl('p', { cls: 'publictxt-quiet', text: 'Nothing new with your followed tags.' });
	else if (found && !n) el.createEl('p', { cls: 'publictxt-quiet', text: 'No pages match.' });
	folderRows(el, listed(c, 'new').tree, d, 'new');
	otherChanges(el, d, all, found);
}

/** The changes that don't match the followed tags, folded: **Mark as seen** covers them too. */
function otherChanges(el: HTMLElement, d: Drawing, all: SourceCheck, found: boolean): void {
	const total = changesIn(all, 'other').length;
	if (!total) return;
	const item = treeItem(el, d.ui.others);
	setAction(item.self, 'toggle-others');
	item.inner.setText(`Other changes (${counted(changesIn(d.c, 'other').length, total, found)})`);
	if (item.children) folderRows(item.children, listed(d.c, 'other').tree, d, 'other');
}

/**
 * Every file at head, as a tree, when the user asked for it: to fork what was seen long ago. Those
 * the tag filter lets through, when one is set; `total` is how many there are without it.
 */
function allFiles(el: HTMLElement, d: Drawing, total: number, found: boolean): void {
	const { c, ui } = d;
	if (!ui.browse) return;
	el.createEl('h5', { text: `All files (${counted(c.files.length, total, found)})` });
	if (!total) el.createEl('p', { cls: 'publictxt-quiet', text: 'No files at head.' });
	else if (found && !c.files.length) el.createEl('p', { cls: 'publictxt-quiet', text: 'No pages match.' });
	folderRows(el, listed(c, 'all').tree, d, 'all');
}

/** One row per upstream file whose mirror isn't what is at head, then a row per mirror note. */
function mirrors(el: HTMLElement, c: SourceCheck): void {
	if (!c.mirrors.length) return;
	el.createEl('h5', { text: `Mirrors changed upstream (${c.mirrors.length})` });
	for (const m of c.mirrors) {
		const { inner } = treeItem(el);
		inner.createSpan({ cls: `publictxt-status-${m.status}`, text: m.status === 'removed' ? 'gone upstream' : 'changed upstream' });
		inner.appendText(` ${m.path}`);
		if (m.status === 'modified') rowAction(inner, 'update-mirror', m.path, 'Update', 'Overwrite the mirror with what is upstream now');
		else {
			rowAction(inner, 'unmirror', m.path, 'Remove', 'Stop mirroring: the mirror goes to the trash');
			rowAction(inner, 'fork', m.path, 'Fork', 'Keep it: the mirror moves into your notes, as your fork');
		}
		for (const note of m.notes) {
			const row = treeItem(el);
			row.self.addClass('publictxt-copy');
			row.inner.createEl('a', { text: note.path, attr: { 'data-open': note.path } });
		}
	}
}

/** One row per upstream file, then a row per note forked from it, latest first. */
function forks(el: HTMLElement, c: SourceCheck): void {
	if (!c.forks.length) return;
	el.createEl('h5', { text: `Forks changed upstream (${c.forks.length})` });
	for (const f of c.forks) {
		const { inner } = treeItem(el);
		inner.createSpan({ cls: `publictxt-status-${f.status}`, text: f.status === 'removed' ? 'gone upstream' : 'changed upstream' });
		inner.appendText(` ${f.path}`);
		if (f.status === 'modified') rowAction(inner, 'compare', f.path, 'Compare', 'Compare the latest copy with upstream');
		else {
			rowAction(inner, 'detach', f.path, 'Detach', 'Make these notes no longer forks');
			rowAction(inner, 'keep-gone', f.path, 'Keep', 'Keep them as forks, and stop listing this');
		}
		for (const [i, copy] of f.copies.entries()) {
			const row = treeItem(el);
			row.self.addClass('publictxt-copy');
			row.inner.createEl('a', { text: copy.path, attr: { 'data-open': copy.path } });
			if (i === 0 && f.copies.length > 1) row.inner.createSpan({ cls: 'publictxt-quiet', text: ' · latest' });
		}
	}
}
