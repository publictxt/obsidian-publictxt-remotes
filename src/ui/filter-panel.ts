// The filter over a source's lists in the check view (docs/features/check.md#filter): by copies
// and by tag. What it leaves of a check, what a click in it does, and drawing it.

import type { SourceCheck } from '../check/check.ts';
import { byCopy, byTag, COPIES, kept, type Copies, type Keep } from '../check/filter.ts';
import { comboKey, comboText, parseCombo, type TagCombo } from '../tags/combo.ts';
import { chips, isSet, NO_FILTER, press, sameFilter, shownChips, type Chip, type PageTags, type TagFilter } from '../tags/filter.ts';
import { comboFilter, filterCombos } from '../tags/follow.ts';
import type { TagsState } from '../tags/run.ts';
import { actionAttrs, type CheckAction } from './check-actions.ts';

/** What the user set in a source's filter. */
export interface FilterUi {
	/** Shown. Hidden, it is kept but leaves nothing out. */
	open: boolean;
	/** Files by the copies the user has of them. */
	copies: Copies;
	tags: TagFilter;
	/** Typed to find a chip. */
	typed: string;
	/** Every chip is shown, not just the first. */
	all: boolean;
}

export function newFilterUi(): FilterUi {
	return { open: false, copies: 'all', tags: NO_FILTER, typed: '', all: false };
}

/** Whether the filter leaves files out. */
export function filtering(ui: FilterUi): boolean {
	return ui.open && (ui.copies !== 'all' || isSet(ui.tags));
}

/** Whether the lists show what the filter leaves: it is set, and doesn't wait for tags. Counts are then "3 of 12". */
export function answered(ui: FilterUi, tags: TagsState): boolean {
	return filtering(ui) && (!isSet(ui.tags) || tags.state === 'ready');
}

/** The last answer of `narrowed`, per filter: the view draws again at every click. */
const last = new WeakMap<FilterUi, { c: SourceCheck; pages: PageTags | null; copies: Copies; tagFilter: TagFilter; out: SourceCheck }>();

/** `c` with only the changes and files the filter lets through: what the lists show, and their tick boxes are of. */
export function narrowed(c: SourceCheck, ui: FilterUi, tags: TagsState): SourceCheck {
	if (!filtering(ui)) return c;
	const { copies, tags: tagFilter } = ui;
	const pages = tags.state === 'ready' ? tags.pages : null;
	const was = last.get(ui);
	if (was && was.c === c && was.pages === pages && was.copies === copies && was.tagFilter === tagFilter) return was.out;
	const keeps = [byCopy(c, copies), isSet(tagFilter) ? byTag(pages, tagFilter) : null].filter((k): k is Keep => k !== null);
	const out = kept(c, keeps);
	last.set(ui, { c, pages, copies, tagFilter, out });
	return out;
}

export type FilterAction = Extract<CheckAction, 'filter' | 'filter-copies' | `tag-${string}`>;

/** Does what a click in the filter does to what is set; `tag` is the chip's, a followed combo's line, or which copies. */
export function filterAction(ui: FilterUi, action: Exclude<FilterAction, 'tag-retry' | 'tag-follow'>, tag: string | undefined): void {
	switch (action) {
		case 'filter':
			ui.open = !ui.open;
			break;
		case 'filter-copies':
			ui.copies = COPIES.find((c) => c === tag) ?? 'all';
			break;
		case 'tag-include':
		case 'tag-exclude':
			if (tag !== undefined) ui.tags = press(ui.tags, tag, action === 'tag-include' ? 'chip' : 'x');
			break;
		case 'tag-mode':
			ui.tags = { ...ui.tags, mode: ui.tags.mode === 'all' ? 'any' : 'all' };
			break;
		case 'tag-more':
			ui.all = !ui.all;
			break;
		case 'tag-clear':
			ui.tags = NO_FILTER;
			ui.typed = '';
			break;
		case 'tag-combo': {
			// A followed combo sets the filter to it; selected again, it clears it.
			const c = tag === undefined ? null : parseCombo(tag);
			if (c) ui.tags = sameFilter(ui.tags, comboFilter(c)) ? NO_FILTER : comboFilter(c);
			break;
		}
		default:
			action satisfies never;
	}
}

/** The button that shows or hides the filter, in the source's `actions` row. */
export function filterButton(actions: HTMLElement, ui: FilterUi): void {
	actions.createEl('button', { text: ui.open ? 'Hide filter' : 'Filter', attr: { ...actionAttrs('filter'), 'aria-expanded': String(ui.open), 'aria-label': 'Show only the pages you choose, in what\'s new and all files: by mirrors and forks, or by tag' } });
}

const COPIES_TEXT: Record<Copies, string> = { all: 'All', mirrored: 'Mirrored', forked: 'Forked', neither: 'Neither' };

/** Which files to show by the copies the user has: offered when the source has any, or while set. */
function copiesRow(el: HTMLElement, ui: FilterUi, c: SourceCheck): void {
	if (ui.copies === 'all' && !c.mirrored.size && !c.forked.size) return;
	const row = el.createDiv({ cls: 'publictxt-actions', attr: { role: 'group', 'aria-label': 'Show files by your copies' } });
	for (const copies of COPIES) {
		row.createEl('button', { text: COPIES_TEXT[copies], cls: ui.copies === copies ? 'mod-cta' : '', attr: { ...actionAttrs('filter-copies', copies), 'aria-pressed': String(ui.copies === copies) } });
	}
}

/** The filter itself, when shown: copies, then tags; `followed`: the source's followed tags. */
export function renderFilter(parent: HTMLElement, ui: FilterUi, c: SourceCheck, tags: TagsState, followed: readonly TagCombo[]): void {
	if (!ui.open) return;
	const el = parent.createDiv({ cls: 'publictxt-tag-filter' });
	copiesRow(el, ui, c);
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
	if (followed.length) followedRow(el, ui.tags, followed);
	const list = chips(tags.pages, ui.tags);
	if (!list.length) {
		el.createEl('p', { cls: 'publictxt-quiet', text: 'No tags in these files.' });
		return;
	}
	row.createEl('input', { type: 'search', placeholder: 'Find a tag', value: ui.typed, attr: { 'data-find': 'tag', 'aria-label': 'Find a tag' } });
	// All or any only matters once two are included.
	if (ui.tags.include.size > 1) {
		const { mode } = ui.tags;
		row.createEl('button', { text: mode === 'all' ? 'All' : 'Any', attr: { ...actionAttrs('tag-mode'), 'aria-label': `Pages with ${mode} of the tags. Select for ${mode === 'all' ? 'any' : 'all'}.` } });
	}
	if (isSet(ui.tags)) row.createEl('button', { text: 'Clear', attr: actionAttrs('tag-clear') });
	if (isNew(ui.tags, followed)) row.createEl('button', { text: 'Follow these tags', attr: { ...actionAttrs('tag-follow'), 'aria-label': 'Add them to the follow note: what\'s new then lists the pages with them, the rest folded' } });
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
	renderChips(el, ui, chips(tags.pages, ui.tags));
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
