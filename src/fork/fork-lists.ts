// Keeps the fork list in each follow note current (docs/spec.md → Fork list): the Obsidian side
// of fork-list.ts.

import { App, debounce, Notice, TFile, type TAbstractFile } from 'obsidian';
import type PublicTxtPlugin from '../main.ts';
import { scanForks } from '../check/run.ts';
import { readForkMeta } from '../sources/fork-meta.ts';
import { isFollowPath, type Follow } from '../sources/follow-note.ts';
import { scanFollows } from '../sources/follows.ts';
import { errorText } from '../remote/vault-host.ts';
import { renderForkList, withForkList } from './fork-list.ts';
import { isForkOf } from './fork.ts';

export interface SyncResult {
	/** Follow notes rewritten. */
	written: string[];
	/** Follow notes left alone: the heading appears more than once. */
	skipped: string[];
	/** Every fork note seen. */
	forks: Set<string>;
}

/** Whether a follow note keeps a fork list: its `list_forks`, else the setting. */
export function wantsForkList(follow: Follow, setting: boolean): boolean {
	return follow.listForks ?? setting;
}

/** Rewrites the fork list of each follow note in `wanted` where it changed; others aren't touched. */
export async function syncForkLists(app: App, wanted: (follow: Follow) => boolean): Promise<SyncResult> {
	const follows = scanFollows(app).follows.filter(wanted);
	const forks = follows.length ? scanForks(app) : [];
	const out: SyncResult = { written: [], skipped: [], forks: new Set(forks.map((f) => f.path)) };
	for (const follow of follows) {
		const note = app.vault.getFileByPath(follow.path);
		if (!note) continue;
		const links: string[] = [];
		for (const f of forks) {
			const file = isForkOf(f.meta, follow) ? app.vault.getFileByPath(f.path) : null;
			if (file) links.push(app.fileManager.generateMarkdownLink(file, follow.path));
		}
		const section = renderForkList(links);
		const text = await app.vault.read(note);
		const next = withForkList(text, section);
		if (next === null) out.skipped.push(follow.path);
		else if (next !== text) {
			await app.vault.process(note, (t) => withForkList(t, section) ?? t);
			out.written.push(follow.path);
		}
	}
	return out;
}

/** Updates fork lists after vault changes, for the follow notes that keep one. */
export class ForkLists {
	private readonly plugin: PublicTxtPlugin;
	/** Fork notes at the last sync: a note that stops being a fork still counts as a change. */
	private known = new Set<string>();
	private running = false;
	private again = false;
	private readonly soon = debounce(() => void this.update(false), 2000, true);

	constructor(plugin: PublicTxtPlugin) {
		this.plugin = plugin;
	}

	register(): void {
		const { plugin } = this;
		const { app } = plugin;
		plugin.register(() => this.soon.cancel());
		// Read-only: which notes are forks, so one that loses its keys counts as a change.
		app.workspace.onLayoutReady(() => {
			this.known = new Set(scanForks(app).map((f) => f.path));
		});
		plugin.registerEvent(
			app.metadataCache.on('changed', (f, _data, cache) => {
				if (readForkMeta(cache.frontmatter) || this.known.has(f.path) || isFollowPath(f.path)) this.changed();
			}),
		);
		const moved = (f: TAbstractFile) => {
			if (f instanceof TFile && f.extension === 'md') this.changed();
		};
		plugin.registerEvent(app.vault.on('delete', (f) => moved(f)));
		plugin.registerEvent(app.vault.on('rename', (f) => moved(f)));
	}

	/**
	 * Syncs the follow notes that keep a list. `manual`: from the command, so every note but those
	 * with `list_forks: false`, whatever the setting, and it reports what it did.
	 */
	async update(manual: boolean): Promise<void> {
		const { app, data } = this.plugin;
		if (!manual && !app.workspace.layoutReady) return;
		const wanted = manual ? (f: Follow) => f.listForks !== false : (f: Follow) => wantsForkList(f, data.listForks);
		if (this.running) {
			this.again = true;
			return;
		}
		this.running = true;
		try {
			const r = await syncForkLists(app, wanted);
			if (r.forks.size) this.known = r.forks;
			if (r.skipped.length) new Notice(`Fork list not updated in ${r.skipped.join(', ')}: it has more than one "Forked pages" heading.`);
			if (manual) new Notice(r.written.length ? `Updated the fork list in ${r.written.length} follow notes.` : 'Fork lists are up to date.');
		} catch (e) {
			new Notice(errorText(e));
		} finally {
			this.running = false;
		}
		if (this.again) {
			this.again = false;
			await this.update(false);
		}
	}

	/** Any follow note may keep a list, so every relevant change is synced; the sync filters. */
	private changed(): void {
		this.soon();
	}
}
