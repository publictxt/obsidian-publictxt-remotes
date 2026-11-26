// The check view: the last check, source by source (docs/features/check.md). It owns the
// clicks; check-source.ts draws each source.

import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';
import type PublicTxtPlugin from '../main.ts';
import type { SourceCheck } from '../check/check.ts';
import type { SourceResult } from '../check/run.ts';
import { FOLLOWS_FOLDER } from '../sources/follow-note.ts';
import { forkableUnder, selectedPaths, toggleAll, type FileList } from '../check/selection.ts';
import type { CopySource } from '../copy/copy.ts';
import { startFork } from '../fork/run.ts';
import { mirrorFiles, stopMirroring } from '../mirror/run.ts';
import { updateMirror, updateMirrors } from '../mirror/update-run.ts';
import { UNREAD } from '../tags/run.ts';
import { checkFromOf } from '../remote/fetch-from.ts';
import { actionAttrs, checkAction, type CheckAction } from './check-actions.ts';
import { renderSource } from './check-source.ts';
import { folderList } from './file-rows.ts';
import { actOnForkChange } from './fork-change.ts';
import { keepFocus } from './keep-focus.ts';
import { folderOpen, newSourceUi, sourceOpen, type SourceUi } from './source-ui.ts';
import { filterAction, narrowed, redrawChips } from './tag-filter.ts';
import { errorText } from '../remote/vault-host.ts';
import { filterCombos } from '../tags/follow.ts';

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
		this.registerDomEvent(this.contentEl, 'input', (e) => this.onInput(e));
		this.render();
	}

	/** Draws the last run, or the prompt to run one. */
	render(): void {
		const el = this.contentEl;
		// Drawing again (a row opened, a check's progress) must not jump back to the top.
		const scrolled = el.scrollTop;
		const refocus = keepFocus(el);
		el.empty();
		const { lastRun, checking } = this.plugin;

		const bar = el.createDiv({ cls: 'publictxt-check-bar' });
		bar.createEl('button', { text: checking ? 'Checking…' : 'Check now', cls: 'mod-cta', attr: { ...actionAttrs('check'), ...(checking ? { disabled: 'true' } : {}) } });
		bar.createSpan({ cls: 'publictxt-status', text: checking ?? (lastRun ? `Checked ${new Date(lastRun.at).toLocaleString()}` : 'Not checked yet') });

		if (!lastRun) return;
		if (lastRun.results.length === 0) {
			el.createEl('p', { text: `No sources. Add one in settings, or a note in ${FOLLOWS_FOLDER}/.` });
		}
		if (lastRun.ignored) {
			el.createEl('p', { cls: 'publictxt-warning', text: `${lastRun.ignored} follow notes ignored: see settings.` });
		}
		const { data } = this.plugin;
		for (const r of lastRun.results) {
			const ui = this.uiOf(r.follow.url);
			// The filter is in use: the first time, and after a check that found another head.
			if (r.check && ui.tags.open && sourceOpen(r, ui)) this.plugin.tags.read(r.check);
			const tags = r.check ? this.plugin.tags.state(r.check) : UNREAD;
			renderSource(el, r, ui, { from: checkFromOf(data, r.follow.name, r.follow.url), busy: checking !== null }, tags);
		}
		el.scrollTop = scrolled;
		refocus();
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
		const action = checkAction(el.dataset.action);
		const { path } = el.dataset;
		if (!action) return;
		if (action === 'check') {
			void this.plugin.check();
			return;
		}
		const url = el.closest<HTMLElement>('[data-source]')?.dataset.source;
		if (url) this.act(action, url, path);
	}

	/** Typing in a tag filter: only its chips are drawn again, so the field stays as it is. */
	private onInput(e: Event): void {
		const input = e.target instanceof HTMLInputElement && e.target.dataset.find === 'tag' ? e.target : null;
		const url = input?.closest<HTMLElement>('[data-source]')?.dataset.source;
		const c = url === undefined ? null : this.result(url)?.check;
		const el = input?.closest('.publictxt-tag-filter')?.querySelector<HTMLElement>('.publictxt-chips');
		if (!input || url === undefined || !c || !el) return;
		const ui = this.uiOf(url).tags;
		ui.typed = input.value;
		redrawChips(el, ui, this.plugin.tags.state(c));
	}

	/** Runs `action` on the source `url`; `path` is the file, folder or tag it is about, if any. */
	private act(action: Exclude<CheckAction, 'check'>, url: string, path: string | undefined): void {
		switch (action) {
			case 'from-local':
			case 'from-remote':
				void this.plugin.checkFrom(url, action === 'from-local' ? 'local' : 'remote');
				break;
			case 'snapshot':
				void this.plugin.snapshot(url);
				break;
			case 'ack':
				void this.plugin.acknowledge(url);
				break;
			case 'mirror':
				if (path) this.mirror(url, [path]);
				break;
			case 'mirror-selected':
				this.mirrorSelected(url);
				break;
			case 'unmirror':
				if (path) this.unmirror(url, path);
				break;
			case 'update-mirror':
				if (path) this.updateMirror(url, path);
				break;
			case 'update-mirrors':
				this.updateMirrors(url);
				break;
			case 'fork':
				if (path) this.fork(url, path);
				break;
			case 'toggle-source':
				this.toggleSource(url);
				break;
			case 'toggle-folder':
			case 'toggle-other-folder':
			case 'toggle-all-folder':
				if (path) this.toggleFolder(url, path, folderList(action));
				break;
			case 'select':
				if (path) this.select(url, [path]);
				break;
			case 'select-folder':
			case 'select-other-folder':
			case 'select-all-folder':
				if (path) this.selectFolder(url, path, folderList(action));
				break;
			case 'toggle-others':
				this.uiOf(url).others = !this.uiOf(url).others;
				this.render();
				break;
			case 'browse':
				this.toggleBrowse(url);
				break;
			case 'fork-selected':
				this.forkSelected(url);
				break;
			case 'compare':
			case 'detach':
			case 'keep-gone':
				if (path) this.forkChanged(action, url, path);
				break;
			case 'tag-filter':
			case 'tag-include':
			case 'tag-exclude':
			case 'tag-mode':
			case 'tag-more':
			case 'tag-clear':
			case 'tag-combo':
				filterAction(this.uiOf(url).tags, action, path);
				this.render();
				break;
			case 'tag-retry':
				this.retryTags(url);
				break;
			case 'tag-follow':
				this.plugin.followTags(url, filterCombos(this.uiOf(url).tags.filter)).catch((e: unknown) => void new Notice(errorText(e)));
				break;
			default:
				// A new action without a case here doesn't compile.
				action satisfies never;
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

	private toggleFolder(url: string, path: string, list: FileList = 'new'): void {
		const c = this.listedCheck(url);
		if (!c) return;
		const ui = this.uiOf(url);
		ui.folders[list].set(path, !folderOpen(c, ui, path, list));
		this.render();
	}

	/** Shows or hides all files. */
	private toggleBrowse(url: string): void {
		const ui = this.uiOf(url);
		ui.browse = !ui.browse;
		this.render();
	}

	/** The last check's result for the source `url`. */
	private result(url: string): SourceResult | undefined {
		return this.plugin.lastRun?.results.find((r) => r.follow.url === url);
	}

	/** The check the lists show: what the tag filter leaves of it. */
	private listedCheck(url: string): SourceCheck | null {
		const c = this.result(url)?.check ?? null;
		return c && narrowed(c, this.uiOf(url).tags, this.plugin.tags.state(c));
	}

	/** Reads what a source's tag filter couldn't. */
	private retryTags(url: string): void {
		const c = this.result(url)?.check;
		if (!c) return;
		this.plugin.tags.read(c, true);
		this.render();
	}

	/** Ticks `paths`, or clears them when all were ticked. */
	private select(url: string, paths: readonly string[]): void {
		toggleAll(this.uiOf(url).selected, paths);
		this.render();
	}

	private selectFolder(url: string, folder: string, list: FileList = 'new'): void {
		const c = this.listedCheck(url);
		if (c) this.select(url, forkableUnder(c, folder, list));
	}

	/** The source `url` as the last check saw it: mirrors and forks come from the head the user is looking at. */
	private forkSource(url: string): { from: CopySource; check: SourceCheck } | null {
		const r = this.result(url);
		if (!r?.check) return null;
		return { from: { url, name: r.follow.name, head: r.check.head, folder: r.follow.folder }, check: r.check };
	}

	private fork(url: string, path: string): void {
		const source = this.forkSource(url);
		if (source) void startFork(this.plugin, source.from, [path]);
	}

	private mirror(url: string, paths: readonly string[], done?: () => void): void {
		const source = this.forkSource(url);
		if (source) void mirrorFiles(this.plugin, source.from, paths, done);
	}

	/** Mirrors the ticked files, then clears the ticks. */
	private mirrorSelected(url: string): void {
		const c = this.result(url)?.check;
		if (!c) return;
		const { selected } = this.uiOf(url);
		this.mirror(url, selectedPaths(c, selected), () => {
			selected.clear();
			this.render();
		});
	}

	private unmirror(url: string, path: string): void {
		const r = this.result(url);
		if (r) stopMirroring(this.plugin, r.follow, path);
	}

	/** Overwrites one upstream file's mirrors with what the last check found at head. */
	private updateMirror(url: string, path: string): void {
		const r = this.result(url);
		const change = r?.check?.mirrors.find((m) => m.path === path);
		if (r?.check && change) void updateMirror(this.plugin, r.follow, r.check.head, change);
	}

	private updateMirrors(url: string): void {
		const r = this.result(url);
		if (r?.check) void updateMirrors(this.plugin, r.follow, r.check.head, r.check.mirrors);
	}

	/** Forks the ticked files, then clears the ticks. */
	private forkSelected(url: string): void {
		const source = this.forkSource(url);
		if (!source) return;
		const { selected } = this.uiOf(url);
		void startFork(this.plugin, source.from, selectedPaths(source.check, selected), {
			done: () => {
				selected.clear();
				this.render();
			},
		});
	}

	/** Acts on an upstream file that changed under its forks: compare it, or, gone, detach or keep them. */
	private forkChanged(action: 'compare' | 'detach' | 'keep-gone', url: string, path: string): void {
		const c = this.result(url)?.check;
		const change = c?.forks.find((f) => f.path === path);
		if (c && change) actOnForkChange(this.plugin, action, c, change);
	}
}
