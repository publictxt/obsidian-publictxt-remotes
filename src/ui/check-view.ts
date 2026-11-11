// The check view: the last check, source by source (docs/spec.md → Check view). It owns the
// clicks; check-source.ts draws each source.

import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';
import type PublicTxtPlugin from '../main.ts';
import type { ForkChange, SourceCheck } from '../check/check.ts';
import type { SourceResult } from '../check/run.ts';
import { FOLLOWS_FOLDER } from '../sources/follow-note.ts';
import { forkableUnder, selectedPaths, toggleAll } from '../check/selection.ts';
import { compareChange } from '../fork/compare-run.ts';
import { startFork, type ForkSource } from '../fork/run.ts';
import { detach, keepGone } from '../fork/update-run.ts';
import { errorText } from '../remote/vault-host.ts';
import { ConfirmModal } from './confirm-modal.ts';
import { folderOpen, newSourceUi, renderSource, sourceOpen, type SourceUi } from './check-source.ts';

export const VIEW_TYPE_CHECK = 'publictxt-check';

export class CheckView extends ItemView {
	private readonly plugin: PublicTxtPlugin;
	/** What the user opened, closed and ticked, per source key. Kept across checks, gone with the view. */
	private readonly ui = new Map<string, SourceUi>();

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
		// Drawing again (a row opened, a check's progress) must not jump back to the top.
		const scrolled = el.scrollTop;
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
		for (const r of lastRun.results) renderSource(el, r, this.uiOf(r.follow.url));
		el.scrollTop = scrolled;
	}

	/** The one click handler: `data-open` opens a note, `data-action` runs one. */
	private onClick(e: MouseEvent): void {
		// An icon is an SVG element, not an HTML one.
		const target = e.target instanceof Element ? e.target : null;
		const open = target?.closest<HTMLElement>('[data-open]')?.dataset.open;
		if (open) {
			void this.app.workspace.openLinkText(open, '', e.ctrlKey || e.metaKey);
			return;
		}
		const el = target?.closest<HTMLElement>('[data-action]');
		if (!el) return;
		const { action, path } = el.dataset;
		if (action === 'check') {
			void this.plugin.check();
			return;
		}
		const url = el.closest<HTMLElement>('[data-source]')?.dataset.source;
		if (url) this.act(action, url, path);
	}

	/** Runs `action` on the source `url`; `path` is the file it is about, if any. */
	private act(action: string | undefined, url: string, path: string | undefined): void {
		switch (action) {
			case 'snapshot':
				void this.plugin.snapshot(url);
				break;
			case 'ack':
				void this.plugin.acknowledge(url);
				break;
			case 'fork':
				if (path) this.fork(url, path);
				break;
			case 'toggle-source':
				this.toggleSource(url);
				break;
			case 'toggle-folder':
				if (path) this.toggleFolder(url, path);
				break;
			case 'select':
				if (path) this.select(url, [path]);
				break;
			case 'select-folder':
				if (path) this.selectFolder(url, path);
				break;
			case 'fork-selected':
				this.forkSelected(url);
				break;
			case 'compare':
			case 'detach':
			case 'keep-gone':
				if (path) this.forkChanged(action, url, path);
				break;
		}
	}

	private uiOf(url: string): SourceUi {
		let ui = this.ui.get(url);
		if (!ui) this.ui.set(url, (ui = newSourceUi()));
		return ui;
	}

	private toggleSource(url: string): void {
		const r = this.result(url);
		if (!r) return;
		const ui = this.uiOf(url);
		ui.open = !sourceOpen(r, ui);
		this.render();
	}

	private toggleFolder(url: string, path: string): void {
		const c = this.result(url)?.check;
		if (!c) return;
		const ui = this.uiOf(url);
		ui.folders.set(path, !folderOpen(c, ui, path));
		this.render();
	}

	/** The last check's result for the source `url`. */
	private result(url: string): SourceResult | undefined {
		return this.plugin.lastRun?.results.find((r) => r.follow.url === url);
	}

	/** Ticks `paths` for forking, or clears them when all were ticked. */
	private select(url: string, paths: readonly string[]): void {
		toggleAll(this.uiOf(url).selected, paths);
		this.render();
	}

	private selectFolder(url: string, folder: string): void {
		const c = this.result(url)?.check;
		if (c) this.select(url, forkableUnder(c, folder));
	}

	/** The source `url` as the last check saw it: forks come from the head the user is looking at. */
	private forkSource(url: string): { from: ForkSource; check: SourceCheck } | null {
		const r = this.result(url);
		if (!r?.check) return null;
		return { from: { url, name: r.follow.name, head: r.check.head, folder: r.follow.folder }, check: r.check };
	}

	private fork(url: string, path: string): void {
		const source = this.forkSource(url);
		if (source) void startFork(this.app, this.plugin.data, source.from, [path]);
	}

	/** Forks the ticked files, then clears the ticks. */
	private forkSelected(url: string): void {
		const source = this.forkSource(url);
		if (!source) return;
		const { selected } = this.uiOf(url);
		void startFork(this.app, this.plugin.data, source.from, selectedPaths(source.check, selected), () => {
			selected.clear();
			this.render();
		});
	}

	/** Acts on an upstream file that changed under its forks: compare it, or, gone, detach or keep them. */
	private forkChanged(action: 'compare' | 'detach' | 'keep-gone', url: string, path: string): void {
		const c = this.result(url)?.check;
		const change = c?.forks.find((f) => f.path === path);
		if (!c || !change) return;
		const { app, plugin } = this;
		const told = (job: Promise<void>) => job.catch((e: unknown) => void new Notice(errorText(e)));
		if (action === 'compare') void told(compareChange(app, url, c.head, change));
		else if (action === 'keep-gone') void told(keepGone(plugin, url, change));
		else new ConfirmModal(app, 'Detach from upstream?', detachQuestion(change), 'Detach', () => told(detach(plugin, url, change))).open();
	}
}

/** What detaching does, before it is done. */
function detachQuestion(change: ForkChange): string {
	const notes = change.copies.map((f) => f.path).join(', ');
	const stay = change.copies.length === 1 ? 'The note stays, as an ordinary note.' : 'The notes stay, as ordinary notes.';
	return `${change.path} is gone upstream. Detaching removes the fork_* keys from ${notes}. ${stay}`;
}
