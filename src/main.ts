import { Notice, Plugin, type TAbstractFile } from 'obsidian';
import { normalizeData, type PublicTxtData } from './sources/schema.ts';
import { isFollowPath } from './sources/follow-note.ts';
import { acknowledged, checkedAll } from './check/check.ts';
import { runCheck, type CheckRun } from './check/run.ts';
import { PublicTxtSettingTab } from './settings.ts';
import { CheckView, VIEW_TYPE_CHECK } from './ui/check-view.ts';
import { UpstreamView } from './ui/upstream-view.ts';
import { forkFromSource } from './fork/command.ts';
import { compareActiveFork, VIEW_TYPE_UPSTREAM } from './fork/compare-run.ts';
import { ForkLists } from './fork/fork-lists.ts';
import { localFollows, snapshotAndTell } from './snapshot/run.ts';

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
		this.registerView(VIEW_TYPE_UPSTREAM, (leaf) => new UpstreamView(leaf, this));
		this.addRibbonIcon('git-compare', 'Check sources', () => void this.showAndCheck());
		this.addCommand({ id: 'check-sources', name: 'Check sources', callback: () => void this.showAndCheck() });
		this.addCommand({ id: 'open-check-view', name: 'Open check view', callback: () => void this.showCheckView() });
		this.addCommand({ id: 'fork-file', name: 'Fork a file from a source', callback: () => forkFromSource(this.app, this.data) });
		this.addCommand({ id: 'compare-fork', name: 'Compare this fork with upstream', callback: () => void compareActiveFork(this.app, this.data) });
		this.addCommand({ id: 'snapshot-local-sources', name: 'Snapshot local sources', callback: () => void this.snapshot() });
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
			// Not as Obsidian starts: with the metadata cache half loaded, follow notes read as
			// invalid, and the state of every source would be dropped as no longer followed.
			await new Promise<void>((ready) => this.app.workspace.onLayoutReady(ready));
			const run = await runCheck(this.app, this.data, (done, total) => {
				this.checking = `Checking ${Math.min(done + 1, total)} of ${total}…`;
				this.renderViews();
			});
			this.lastRun = run;
			// From the state as it is now: a source acknowledged while this ran keeps that.
			const sources = run.results.map((r) => ({ url: r.follow.url, ok: r.check !== null }));
			await this.save({ ...this.data, state: checkedAll(this.data.state, sources, run.at) });
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
		// Forks stay: each is dealt with on its own (docs/spec.md → Fork update).
		r.check = { ...c, changes: [], reason: null, watched: [] };
		this.renderViews();
	}

	/** Drops an upstream file from the last check's forks: every note forked from it is settled. */
	forkSettled(url: string, path: string): void {
		const c = this.lastRun?.results.find((x) => x.check?.url === url)?.check;
		if (!c) return;
		c.forks = c.forks.filter((f) => f.path !== path);
		this.renderViews();
	}

	/**
	 * Commits what changed in one local source's folder (by URL), or in every local source's.
	 * Checks again if anything was committed and the view shows a check.
	 */
	async snapshot(url?: string): Promise<void> {
		const follows = localFollows(this.app).filter((f) => url === undefined || f.url === url);
		await snapshotAndTell(this.app, this.data, follows, async () => {
			if (this.lastRun) await this.check();
		});
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
