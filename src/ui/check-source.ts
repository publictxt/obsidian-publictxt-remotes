// One source in the check view: its name and branch, then an error, "nothing new", or what's
// new, watched and forks (docs/spec.md → Check view). Draws only: clicks are the view's. An
// element says what a click on it does with `data-open` (a note to open) or `data-action`; the
// source it belongs to is the nearest `data-source` (the source's key).

import { hasNews, type NewReason, type SourceCheck } from '../check/check.ts';
import type { SourceResult } from '../check/run.ts';
import { isForkable } from '../fork/fork.ts';
import { isLocalRepo } from '../sources/repo-url.ts';

/** Files listed per source before "and n more". */
const LIST_LIMIT = 50;

const REASON: Record<NewReason, string> = {
	'first-check': 'First check: every file is listed. Mark as seen to start from here.',
	'history-rewritten': 'History was rewritten since you last looked: every file is listed.',
};

export function renderSource(parent: HTMLElement, r: SourceResult): void {
	const el = parent.createDiv({ cls: 'publictxt-source', attr: { 'data-source': r.follow.url } });
	header(el, r);

	if (r.error !== null) {
		el.createEl('p', { cls: 'publictxt-error', text: r.error });
		return;
	}
	const c = r.check;
	if (!hasNews(c)) {
		el.createEl('p', { cls: 'publictxt-quiet', text: 'Nothing new since you last looked.' });
		return;
	}
	changes(el, c);
	watched(el, c);
	forks(el, c);
	if (c.changes.length || c.watched.length || c.reason) {
		el.createEl('button', { text: 'Mark as seen', attr: { 'data-action': 'ack' } });
	}
}

function header(el: HTMLElement, r: SourceResult): void {
	const local = isLocalRepo(r.follow.url);
	const h = el.createEl('h4');
	h.createEl('a', { text: r.follow.name, attr: { 'data-open': r.follow.path, 'aria-label': local ? 'Local source' : r.follow.url } });
	if (r.check) h.createSpan({ cls: 'publictxt-branch', text: ` · ${r.check.head.branch}` });
	if (local) {
		el.createEl('button', { text: 'Snapshot', attr: { 'data-action': 'snapshot', 'aria-label': 'Commit what changed in this folder, then check again' } });
	}
}

function changes(el: HTMLElement, c: SourceCheck): void {
	if (!c.changes.length) return;
	el.createEl('h5', { text: `What's new (${c.changes.length})` });
	if (c.reason) el.createEl('p', { cls: 'publictxt-quiet', text: REASON[c.reason] });
	const ul = el.createEl('ul');
	for (const ch of c.changes.slice(0, LIST_LIMIT)) {
		const li = ul.createEl('li');
		li.createSpan({ cls: `publictxt-status-${ch.status}`, text: ch.status });
		li.appendText(` ${ch.path}`);
		if (ch.from) li.appendText(` (from ${ch.from})`);
		if (ch.status !== 'removed') forkLink(li, ch.path);
	}
	if (c.changes.length > LIST_LIMIT) el.createEl('p', { cls: 'publictxt-quiet', text: `And ${c.changes.length - LIST_LIMIT} more.` });
}

function watched(el: HTMLElement, c: SourceCheck): void {
	if (!c.watched.length) return;
	el.createEl('h5', { text: `Watched (${c.watched.length})` });
	const ul = el.createEl('ul');
	for (const w of c.watched) {
		const li = ul.createEl('li');
		li.createSpan({ cls: `publictxt-status-${w.status}`, text: w.status });
		li.appendText(` ${w.path}`);
		if (w.status !== 'removed') forkLink(li, w.path);
	}
}

function forks(el: HTMLElement, c: SourceCheck): void {
	if (!c.forks.length) return;
	el.createEl('h5', { text: `Forks changed upstream (${c.forks.length})` });
	const ul = el.createEl('ul');
	for (const f of c.forks) {
		const li = ul.createEl('li');
		li.createSpan({ cls: `publictxt-status-${f.status}`, text: f.status === 'removed' ? 'gone upstream' : 'changed upstream' });
		li.appendText(' ');
		li.createEl('a', { text: f.fork.path, attr: { 'data-open': f.fork.path } });
		li.appendText(` ← ${f.fork.meta.path}`);
	}
}

/** A "fork" action after a file's path, for Markdown files. */
function forkLink(li: HTMLElement, path: string): void {
	if (!isForkable(path)) return;
	li.appendText(' ');
	li.createEl('a', { text: 'Fork', cls: 'publictxt-fork', attr: { 'data-action': 'fork', 'data-path': path, 'aria-label': `Fork ${path} into the vault` } });
}
