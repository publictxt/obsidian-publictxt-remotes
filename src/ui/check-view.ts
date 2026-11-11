// The check view: the last check, source by source (docs/spec.md → Check view). It owns the
// clicks; check-source.ts draws each source.

import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type PublicTxtPlugin from '../main.ts';
import type { SourceResult } from '../check/run.ts';
import { FOLLOWS_FOLDER } from '../sources/follow-note.ts';
import { startFork } from '../fork/run.ts';
import { renderSource } from './check-source.ts';

export const VIEW_TYPE_CHECK = 'publictxt-check';

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
		for (const r of lastRun.results) renderSource(el, r);
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
		}
	}

	/** The last check's result for the source `url`. */
	private result(url: string): SourceResult | undefined {
		return this.plugin.lastRun?.results.find((r) => r.follow.url === url);
	}

	/** Forks `path` at the head the last check saw: what the user is looking at. */
	private fork(url: string, path: string): void {
		const r = this.result(url);
		if (!r?.check) return;
		void startFork(this.app, this.plugin.data, { url, name: r.follow.name, head: r.check.head, path, folder: r.follow.folder });
	}
}
