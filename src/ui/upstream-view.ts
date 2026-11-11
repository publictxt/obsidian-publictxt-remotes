// The Upstream view: a file as it is upstream now, read-only, beside a note forked from it, and
// what to do about the difference (docs/spec.md → Fork update). src/fork/update-run.ts does it.

import { Component, getFrontMatterInfo, ItemView, MarkdownRenderer, Notice, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import type PublicTxtPlugin from '../main.ts';
import { VIEW_TYPE_UPSTREAM } from '../fork/compare-run.ts';
import { copyEdited, keepMine, loadCompare, overwrite, writeAlongside, type CompareInfo } from '../fork/update-run.ts';
import { changedText, editedText, readCompare, type Compare } from '../fork/update.ts';
import { errorText } from '../remote/vault-host.ts';
import { ConfirmModal } from './confirm-modal.ts';

export class UpstreamView extends ItemView {
	private readonly plugin: PublicTxtPlugin;
	/** What is compared: the view's state, so it comes back after a restart. */
	private compare: Compare | null = null;
	private info: CompareInfo | null = null;
	private problem: string | null = null;
	private showSource = false;
	/** An action is writing. */
	private busy = false;
	/** Counts loads, so a slow one that was overtaken draws nothing. */
	private loads = 0;
	/** Owns the rendered Markdown, to unload it when drawing again. */
	private rendered: Component | null = null;
	/** Where the header says whether the copy is edited: kept current as the note changes. */
	private editedEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: PublicTxtPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_UPSTREAM;
	}

	getDisplayText(): string {
		return this.compare ? `Upstream: ${this.compare.path}` : 'Upstream';
	}

	getIcon(): string {
		return 'git-compare';
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass('publictxt-upstream');
		this.registerDomEvent(this.contentEl, 'click', (e) => this.onClick(e));
		this.registerEvent(
			this.app.vault.on('modify', (f) => {
				if (f.path === this.compare?.note) void this.showEdited();
			}),
		);
		this.render();
	}

	getState(): Record<string, unknown> {
		return this.compare ? { ...this.compare } : {};
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		this.compare = readCompare(state);
		await super.setState(state, result);
		// Not awaited: git may be slow. As Obsidian starts, wait for the vault to be there.
		this.app.workspace.onLayoutReady(() => void this.read());
	}

	/** Reads what the compare shows, and draws it. Not `load`: that is a view's own. */
	private async read(): Promise<void> {
		const c = this.compare;
		const turn = ++this.loads;
		this.info = null;
		this.problem = null;
		this.render();
		if (!c) return;
		try {
			const info = await loadCompare(this.plugin, c);
			if (turn !== this.loads) return;
			this.info = info;
		} catch (e) {
			if (turn !== this.loads) return;
			this.problem = errorText(e);
		}
		this.render();
	}

	private render(): void {
		const el = this.contentEl;
		el.empty();
		if (this.rendered) this.removeChild(this.rendered);
		this.rendered = null;
		this.editedEl = null;
		const { compare: c, info } = this;
		if (!c) {
			el.createEl('p', { cls: 'publictxt-quiet', text: 'Nothing to compare. Use the check view to compare a fork with upstream.' });
			return;
		}
		if (this.problem !== null) {
			el.createEl('p', { cls: 'publictxt-error', text: this.problem });
			return;
		}
		if (!info) {
			el.createEl('p', { cls: 'publictxt-quiet', text: 'Loading…' });
			return;
		}
		this.header(el, c, info);
		const body = el.createDiv({ cls: 'publictxt-upstream-body' });
		if (this.showSource) {
			body.createEl('pre', { text: info.text });
			return;
		}
		body.addClass('markdown-rendered');
		this.rendered = this.addChild(new Component());
		const markdown = info.text.slice(getFrontMatterInfo(info.text).contentStart);
		// Links are resolved as if they were in the note beside it.
		void MarkdownRenderer.render(this.app, markdown, body, c.note, this.rendered);
	}

	private header(el: HTMLElement, c: Compare, info: CompareInfo): void {
		const head = el.createDiv({ cls: 'publictxt-upstream-head' });
		const what = head.createEl('p');
		what.createSpan({ text: `${info.follow.name} · ${c.branch} · beside ${c.note}. ` });
		const row = head.createDiv({ cls: 'publictxt-actions' });
		if (info.current) what.appendText('Your copy is from this version: nothing to update.');
		else {
			what.appendText(`${changedText(info.stat)} `);
			this.editedEl = what.createSpan();
			void this.showEdited();
			row.createEl('button', { text: 'Overwrite', attr: { 'data-action': 'overwrite', 'aria-label': 'Replace your copy with this version' } });
			row.createEl('button', { text: 'Write alongside', attr: { 'data-action': 'alongside', 'aria-label': 'Save this version as a new note beside your copy' } });
			row.createEl('button', { text: 'Keep mine', attr: { 'data-action': 'keep', 'aria-label': 'Change nothing, and stop listing this version' } });
		}
		row.createEl('button', { text: this.showSource ? 'Show rendered' : 'Show source', attr: { 'data-action': 'source' } });
	}

	/** Says in the header whether the copy is edited, as it is now. */
	private async showEdited(): Promise<void> {
		const { compare: c, info, editedEl } = this;
		if (!c || !info || !editedEl) return;
		const edited = await copyEdited(this.app, c, info);
		if (this.editedEl === editedEl) editedEl.setText(editedText(edited));
	}

	private onClick(e: MouseEvent): void {
		const target = e.target instanceof Element ? e.target : null;
		const action = target?.closest<HTMLElement>('[data-action]')?.dataset.action;
		const { compare: c, info } = this;
		if (!action || !c || !info || this.busy) return;
		switch (action) {
			case 'source':
				this.showSource = !this.showSource;
				this.render();
				break;
			case 'overwrite':
				void this.askOverwrite(c, info);
				break;
			case 'alongside':
				void this.run(() => writeAlongside(this.plugin, c, info));
				break;
			case 'keep':
				void this.run(() => keepMine(this.plugin, c, info));
				break;
		}
	}

	/** Overwrites at once when the copy is as it was forked; asks when it is edited, or can't be told. */
	private async askOverwrite(c: Compare, info: CompareInfo): Promise<void> {
		const go = () => this.run(() => overwrite(this.plugin, c, info));
		if ((await copyEdited(this.app, c, info)) === false) {
			await go();
			return;
		}
		const message = `Your edits to ${c.note} will be replaced, front matter included. Obsidian's file recovery can bring them back.`;
		new ConfirmModal(this.app, 'Overwrite your copy?', message, 'Overwrite', go).open();
	}

	/** Runs an action. Done, the compare is over and the pane closes; failed, it stays and says why. */
	private async run(job: () => Promise<void>): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		try {
			await job();
			this.leaf.detach();
		} catch (e) {
			new Notice(errorText(e));
		} finally {
			this.busy = false;
		}
	}
}
