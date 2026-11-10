import { Notice, Plugin, type TAbstractFile } from 'obsidian';
import { normalizeData, type PublicTxtData } from './sources/schema.ts';
import { isFollowPath } from './sources/follow-note.ts';
import { acknowledged } from './check/check.ts';
import { runCheck, type CheckRun } from './check/run.ts';
import { PublicTxtSettingTab } from './settings.ts';
import { CheckView, VIEW_TYPE_CHECK } from './ui/check-view.ts';
import { forkFromSource } from './fork/command.ts';
import { ForkLists } from './fork/fork-lists.ts';

export default class PublicTxtPlugin extends Plugin {
	/** Everything in data.json, always normalized (docs/spec.md → Data). */
	data!: PublicTxtData;
	/** The last check, in memory only. */
	lastRun: CheckRun | null = null;
	/** Progress text while a check runs; `null` otherwise. */
	checking: string | null = null;
	/** Keeps follow notes' fork lists current. */
	forkLists!: ForkLists;

	async onload() {
		this.data = normalizeData(await this.loadData());
		const tab = new PublicTxtSettingTab(this.app, this);
		this.addSettingTab(tab);

		this.registerView(VIEW_TYPE_CHECK, (leaf) => new CheckView(leaf, this));
		this.addRibbonIcon('git-compare', 'Check sources', () => void this.showAndCheck());
		this.addCommand({ id: 'check-sources', name: 'Check sources', callback: () => void this.showAndCheck() });
		this.addCommand({ id: 'open-check-view', name: 'Open check view', callback: () => void this.showCheckView() });
		this.addCommand({ id: 'fork-file', name: 'Fork a file from a source', callback: () => forkFromSource(this.app, this.data) });
		this.addCommand({ id: 'update-fork-lists', name: 'Update fork lists in follow notes', callback: () => void this.forkLists.update(true) });

		this.forkLists = new ForkLists(this);
		this.forkLists.register();

		// The settings tab lists follow notes; redraw it when one changes.
		const touched = (f: TAbstractFile, oldPath?: string) => {
			if (isFollowPath(f.path) || (oldPath !== undefined && isFollowPath(oldPath))) tab.refresh();
		};
		this.registerEvent(this.app.metadataCache.on('changed', (f) => touched(f)));
		this.registerEvent(this.app.vault.on('delete', (f) => touched(f)));
		this.registerEvent(this.app.vault.on('rename', (f, oldPath) => touched(f, oldPath)));
	}

	/** Normalizes `next`, keeps it, and writes it to data.json. */
	async save(next: PublicTxtData): Promise<void> {
		this.data = normalizeData(next);
		await this.saveData(this.data);
	}

	/** Checks every source; saves `checkedAt`, keeps the results for the view. */
	async check(): Promise<void> {
		if (this.checking !== null) return;
		this.checking = 'Checking…';
		this.renderViews();
		try {
			const { run, state } = await runCheck(this.app, this.data, (done, total) => {
				this.checking = `Checking ${Math.min(done + 1, total)} of ${total}…`;
				this.renderViews();
			});
			this.lastRun = run;
			await this.save({ ...this.data, state });
		} catch (e) {
			new Notice(e instanceof Error ? e.message : String(e));
		} finally {
			this.checking = null;
			this.renderViews();
		}
	}

	/** Moves a source's `seenCommit` and `watched` to the last check's head. */
	async acknowledge(url: string): Promise<void> {
		const r = this.lastRun?.results.find((x) => x.check?.url === url);
		if (!r?.check) return;
		const c = r.check;
		await this.save({ ...this.data, state: { ...this.data.state, [url]: acknowledged(c, new Date().toISOString()) } });
		// Forks stay: only updating a fork acknowledges it (docs/spec.md → Check).
		r.check = { ...c, changes: [], reason: null, watched: [] };
		this.renderViews();
	}

	private async showAndCheck(): Promise<void> {
		await this.showCheckView();
		await this.check();
	}

	private async showCheckView(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_CHECK)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: VIEW_TYPE_CHECK, active: true });
		}
		if (leaf) await workspace.revealLeaf(leaf);
	}

	private renderViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CHECK)) {
			if (leaf.view instanceof CheckView) leaf.view.render();
		}
	}
}
