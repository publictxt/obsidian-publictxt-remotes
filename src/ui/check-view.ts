// The check view: what's new, watched and forks, per source (docs/spec.md → Check view).

import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type PublicTxtPlugin from '../main.ts';
import { hasNews, type NewReason, type SourceCheck } from '../check/check.ts';
import type { SourceResult } from '../check/run.ts';
import { FOLLOWS_FOLDER } from '../sources/follow-note.ts';
import { isForkable } from '../fork/fork.ts';
import { startFork } from '../fork/run.ts';

export const VIEW_TYPE_CHECK = 'publictxt-check';

/** Files listed per source before "and n more". */
const LIST_LIMIT = 50;

const REASON: Record<NewReason, string> = {
	'first-check': 'First check: every file is listed. Mark as seen to start from here.',
	'history-rewritten': 'History was rewritten since you last looked: every file is listed.',
};

export class CheckView extends ItemView {
	private readonly plugin: PublicTxtPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: PublicTxtPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_CHECK;
	}

	getDisplayText(): string {
		return 'Check sources';
	}

	getIcon(): string {
		return 'git-compare';
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass('publictxt-check');
		this.registerDomEvent(this.contentEl, 'click', (e) => this.onClick(e));
		this.render();
	}

	/** Draws the last run, or the prompt to run one. */
	render(): void {
		const el = this.contentEl;
		el.empty();
		const { lastRun, checking } = this.plugin;

		const bar = el.createDiv({ cls: 'publictxt-check-bar' });
		bar.createEl('button', { text: checking ? 'Checking…' : 'Check now', cls: 'mod-cta', attr: { 'data-action': 'check', ...(checking ? { disabled: 'true' } : {}) } });
		bar.createSpan({ cls: 'publictxt-status', text: checking ?? (lastRun ? `Checked ${new Date(lastRun.at).toLocaleString()}` : 'Not checked yet') });

		if (!lastRun) return;
		if (lastRun.results.length === 0) {
			el.createEl('p', { text: `No sources. Add one in settings, or a note in ${FOLLOWS_FOLDER}/.` });
		}
		if (lastRun.ignored) {
			el.createEl('p', { cls: 'publictxt-warning', text: `${lastRun.ignored} follow notes ignored: see settings.` });
		}
		for (const r of lastRun.results) this.source(el, r);
	}

	private source(parent: HTMLElement, r: SourceResult): void {
		const el = parent.createDiv({ cls: 'publictxt-source' });
		const h = el.createEl('h4');
		h.createEl('a', { text: r.follow.url, attr: { 'data-open': r.follow.path } });
		if (r.check) h.createSpan({ cls: 'publictxt-branch', text: ` · ${r.check.head.branch}` });

		if (r.error !== null) {
			el.createEl('p', { cls: 'publictxt-error', text: r.error });
			return;
		}
		const c = r.check;
		if (!hasNews(c)) {
			el.createEl('p', { cls: 'publictxt-quiet', text: 'Nothing new since you last looked.' });
			return;
		}
		this.changes(el, c);
		this.watched(el, c);
		this.forks(el, c);
		if (c.changes.length || c.watched.length || c.reason) {
			el.createEl('button', { text: 'Mark as seen', attr: { 'data-action': 'ack', 'data-url': c.url } });
		}
	}

	private changes(el: HTMLElement, c: SourceCheck): void {
		if (!c.changes.length) return;
		el.createEl('h5', { text: `What's new (${c.changes.length})` });
		if (c.reason) el.createEl('p', { cls: 'publictxt-quiet', text: REASON[c.reason] });
		const ul = el.createEl('ul');
		for (const ch of c.changes.slice(0, LIST_LIMIT)) {
			const li = ul.createEl('li');
			li.createSpan({ cls: `publictxt-status-${ch.status}`, text: ch.status });
			li.appendText(` ${ch.path}`);
			if (ch.from) li.appendText(` (from ${ch.from})`);
			if (ch.status !== 'removed') forkLink(li, c.url, ch.path);
		}
		if (c.changes.length > LIST_LIMIT) el.createEl('p', { cls: 'publictxt-quiet', text: `And ${c.changes.length - LIST_LIMIT} more.` });
	}

	private watched(el: HTMLElement, c: SourceCheck): void {
		if (!c.watched.length) return;
		el.createEl('h5', { text: `Watched (${c.watched.length})` });
		const ul = el.createEl('ul');
		for (const w of c.watched) {
			const li = ul.createEl('li');
			li.createSpan({ cls: `publictxt-status-${w.status}`, text: w.status });
			li.appendText(` ${w.path}`);
			if (w.status !== 'removed') forkLink(li, c.url, w.path);
		}
	}

	private forks(el: HTMLElement, c: SourceCheck): void {
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

	/** The one click handler: `data-open` opens a note, `data-action` runs one. */
	private onClick(e: MouseEvent): void {
		const t = e.target instanceof HTMLElement ? e.target : null;
		const open = t?.closest<HTMLElement>('[data-open]');
		if (open?.dataset.open) {
			void this.app.workspace.openLinkText(open.dataset.open, '', e.ctrlKey || e.metaKey);
			return;
		}
		const action = t?.closest<HTMLElement>('[data-action]');
		if (action?.dataset.action === 'check') void this.plugin.check();
		if (action?.dataset.action === 'ack' && action.dataset.url) void this.plugin.acknowledge(action.dataset.url);
		if (action?.dataset.action === 'fork' && action.dataset.url && action.dataset.path) this.fork(action.dataset.url, action.dataset.path);
	}

	/** Forks `path` at the head the last check saw: what the user is looking at. */
	private fork(url: string, path: string): void {
		const r = this.plugin.lastRun?.results.find((x) => x.check?.url === url);
		if (!r?.check) return;
		void startFork(this.app, this.plugin.data, { url, head: r.check.head, path, folder: r.follow.folder });
	}
}

/** A "fork" action after a file's path, for Markdown files. */
function forkLink(li: HTMLElement, url: string, path: string): void {
	if (!isForkable(path)) return;
	li.appendText(' ');
	li.createEl('a', { text: 'Fork', cls: 'publictxt-fork', attr: { 'data-action': 'fork', 'data-url': url, 'data-path': path, 'aria-label': `Fork ${path} into the vault` } });
}
