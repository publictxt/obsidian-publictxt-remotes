// The tag filter over a source's lists in the check view (docs/features/tags.md): what it leaves
// of a check, what a click in it does, and drawing it.

import type { SourceCheck } from '../check/check.ts';
import { isCopyable } from '../copy/copy.ts';
import type { Change } from '../remote/host.ts';
import { comboKey, comboText, parseCombo, type TagCombo } from '../tags/combo.ts';
import { chips, isSet, NO_FILTER, passes, passing, press, sameFilter, shownChips, type Chip, type PageTags, type TagFilter } from '../tags/filter.ts';
import { comboFilter, filterCombos } from '../tags/follow.ts';
import type { TagsState } from '../tags/run.ts';
import { actionAttrs, type CheckAction } from './check-actions.ts';

/** What the user set in a source's filter. */
export interface FilterUi {
	/** Shown. Hidden, it is kept but leaves nothing out. */
	open: boolean;
	filter: TagFilter;
	/** Typed to find a chip. */
	typed: string;
	/** Every chip is shown, not just the first. */
	all: boolean;
}

export function newFilterUi(): FilterUi {
	return { open: false, filter: NO_FILTER, typed: '', all: false };
}

/** Whether the filter leaves files out. */
export function filtering(ui: FilterUi): boolean {
	return ui.open && isSet(ui.filter);
}

/** The last answer of `narrowed`, per filter: the view draws again at every click. */
const last = new WeakMap<FilterUi, { c: SourceCheck; pages: PageTags; filter: TagFilter; out: SourceCheck }>();

/**
 * `c` with only the changes and files the filter lets through: what the lists show, and their
 * tick boxes are of. While a filter is set and the tags aren't known, no files and only removals.
 */
export function narrowed(c: SourceCheck, ui: FilterUi, tags: TagsState): SourceCheck {
	if (!filtering(ui)) return c;
	if (tags.state !== 'ready') return { ...c, changes: c.changes.filter((ch) => ch.status === 'removed'), files: [] };
	const { filter } = ui;
	const was = last.get(ui);
	if (was && was.c === c && was.pages === tags.pages && was.filter === filter) return was.out;
	const out = { ...c, changes: news(c.changes, tags.pages, filter), files: passing(c.files, tags.pages, filter) };
	last.set(ui, { c, pages: tags.pages, filter, out });
	return out;
}

/**
 * The changes the filter lets through. News is let through when in doubt: a removed page has no
 * tags at head, and one that couldn't be read might match. Other files have no tags.
 */
function news(changes: readonly Change[], pages: PageTags, filter: TagFilter): Change[] {
	return changes.filter((ch) => {
		if (ch.status === 'removed') return true;
		if (!isCopyable(ch.path)) return false;
		const tags = pages.get(ch.path);
		return tags === undefined || passes(filter, tags);
	});
}

export type FilterAction = Extract<CheckAction, `tag-${string}`>;

/** Does what a click in the filter does to what is set; `tag` is the chip's, or a followed combo's line. */
export function filterAction(ui: FilterUi, action: Exclude<FilterAction, 'tag-retry' | 'tag-follow'>, tag: string | undefined): void {
	switch (action) {
		case 'tag-filter':
			ui.open = !ui.open;
			break;
		case 'tag-include':
		case 'tag-exclude':
			if (tag !== undefined) ui.filter = press(ui.filter, tag, action === 'tag-include' ? 'chip' : 'x');
			break;
		case 'tag-mode':
			ui.filter = { ...ui.filter, mode: ui.filter.mode === 'all' ? 'any' : 'all' };
			break;
		case 'tag-more':
			ui.all = !ui.all;
			break;
		case 'tag-clear':
			ui.filter = NO_FILTER;
			ui.typed = '';
			break;
		case 'tag-combo': {
			// A followed combo sets the filter to it; selected again, it clears it.
			const c = tag === undefined ? null : parseCombo(tag);
			if (c) ui.filter = sameFilter(ui.filter, comboFilter(c)) ? NO_FILTER : comboFilter(c);
			break;
		}
		default:
			action satisfies never;
	}
}

/** The button that shows or hides the filter, in the source's `actions` row. */
export function tagFilterButton(actions: HTMLElement, ui: FilterUi): void {
	actions.createEl('button', { text: ui.open ? 'Hide tag filter' : 'Filter by tag', attr: { ...actionAttrs('tag-filter'), 'aria-expanded': String(ui.open), 'aria-label': 'Show only pages with the tags you choose, in what\'s new and all files' } });
}

/** The filter itself, when shown; `followed`: the source's followed tags. */
export function renderTagFilter(parent: HTMLElement, ui: FilterUi, tags: TagsState, followed: readonly TagCombo[]): void {
	if (!ui.open) return;
	const el = parent.createDiv({ cls: 'publictxt-tag-filter' });
	const row = el.createDiv({ cls: 'publictxt-actions' });
	if (tags.state === 'error') {
		el.createEl('p', { cls: 'publictxt-error', text: tags.message });
		retry(el);
		return;
	}
	if (tags.state !== 'ready') {
		const left = tags.state === 'reading' ? tags.total - tags.done : 0;
		el.createEl('p', { cls: 'publictxt-quiet', text: left ? `Reading ${pagesText(left)}…` : 'Reading tags…' });
		return;
	}
	if (tags.unread) {
		el.createEl('p', { cls: 'publictxt-warning', text: `${pagesText(tags.unread)} couldn't be read.` });
		retry(el);
	}
	if (followed.length) followedRow(el, ui.filter, followed);
	const list = chips(tags.pages, ui.filter);
	if (!list.length) {
		el.createEl('p', { cls: 'publictxt-quiet', text: 'No tags in these files.' });
		return;
	}
	row.createEl('input', { type: 'search', placeholder: 'Find a tag', value: ui.typed, attr: { 'data-find': 'tag', 'aria-label': 'Find a tag' } });
	// All or any only matters once two are included.
	if (ui.filter.include.size > 1) {
		const { mode } = ui.filter;
		row.createEl('button', { text: mode === 'all' ? 'All' : 'Any', attr: { ...actionAttrs('tag-mode'), 'aria-label': `Pages with ${mode} of the tags. Select for ${mode === 'all' ? 'any' : 'all'}.` } });
	}
	if (isSet(ui.filter)) row.createEl('button', { text: 'Clear', attr: actionAttrs('tag-clear') });
	if (isNew(ui.filter, followed)) row.createEl('button', { text: 'Follow these tags', attr: { ...actionAttrs('tag-follow'), 'aria-label': 'Add them to the follow note: what\'s new then lists the pages with them, the rest folded' } });
	renderChips(el.createDiv({ cls: 'publictxt-chips' }), ui, list);
}

/** The followed combos: selecting one sets the filter to it. */
function followedRow(el: HTMLElement, filter: TagFilter, followed: readonly TagCombo[]): void {
	const row = el.createDiv({ cls: 'publictxt-actions' });
	row.createSpan({ cls: 'publictxt-quiet', text: 'Followed:' });
	for (const c of followed) {
		const line = comboText(c);
		row.createEl('button', { text: line, attr: { ...actionAttrs('tag-combo', line), 'aria-pressed': String(sameFilter(filter, comboFilter(c))) } });
	}
}

/** Whether the filter is set and stands for a combo not followed yet. */
function isNew(filter: TagFilter, followed: readonly TagCombo[]): boolean {
	const keys = new Set(followed.map(comboKey));
	return filterCombos(filter).some((c) => !keys.has(comboKey(c)));
}

function pagesText(n: number): string {
	return n === 1 ? '1 page' : `${n} pages`;
}

function retry(el: HTMLElement): void {
	el.createDiv({ cls: 'publictxt-actions' }).createEl('button', { text: 'Try again', attr: actionAttrs('tag-retry') });
}

/** Draws the chips again in `el`, as the user types: the rest, and the field, stay as they are. */
export function redrawChips(el: HTMLElement, ui: FilterUi, tags: TagsState): void {
	if (tags.state !== 'ready') return;
	el.empty();
	renderChips(el, ui, chips(tags.pages, ui.filter));
}

function renderChips(el: HTMLElement, ui: FilterUi, list: readonly Chip[]): void {
	const { shown, more } = shownChips(list, ui.typed, ui.all);
	for (const c of shown) chip(el, c);
	if (!shown.length) el.createSpan({ cls: 'publictxt-quiet', text: 'No such tag.' });
	if (more) el.createEl('button', { cls: 'publictxt-chip-more', text: `+${more} more`, attr: actionAttrs('tag-more') });
	else if (ui.all) el.createEl('button', { cls: 'publictxt-chip-more', text: 'Show fewer', attr: actionAttrs('tag-more') });
}

/** A chip: its tag includes or clears it, its ✕ excludes or clears it. An excluded one has no count: it is always 0. */
function chip(el: HTMLElement, c: Chip): void {
	const pill = el.createSpan({ cls: ['publictxt-chip', `is-${c.state}`] });
	if (c.state === 'off' && c.count === 0) pill.addClass('is-empty');
	const body = pill.createEl('button', { text: `#${c.tag}`, attr: { ...actionAttrs('tag-include', c.tag), 'aria-pressed': String(c.state === 'include') } });
	if (c.state !== 'exclude') body.createSpan({ cls: 'publictxt-quiet', text: ` ${c.count}` });
	pill.createEl('button', { text: '✕', attr: { ...actionAttrs('tag-exclude', c.tag), 'aria-label': c.state === 'exclude' ? `Stop leaving out #${c.tag}` : `Leave out #${c.tag}`, 'aria-pressed': String(c.state === 'exclude') } });
}
