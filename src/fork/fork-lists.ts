// Keeps the fork list in each follow note current (docs/spec.md → Fork list): the Obsidian side
// of fork-list.ts.

import { App, debounce, Notice, TFile, type TAbstractFile } from 'obsidian';
import type PublicTxtPlugin from '../main.ts';
import { scanForks } from '../sources/forks.ts';
import { readForkMeta, type ForkMeta } from '../sources/fork-meta.ts';
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
}

/**
 * What the fork lists say of a note: which source it is a fork of (`null`: not a fork). A list
 * changes only when this does, or the note moves; not when its text or other keys do.
 */
export function listedAs(meta: ForkMeta | null): string | null {
	return meta ? `${meta.remote ?? ''}\0${meta.repo ?? ''}` : null;
}

/** Whether a follow note keeps a fork list: its `list_forks`, else the setting. */
export function wantsForkList(follow: Follow, setting: boolean): boolean {
	return follow.listForks ?? setting;
}

/** Rewrites the fork list of each follow note in `wanted` where it changed; others aren't touched. */
export async function syncForkLists(app: App, wanted: (follow: Follow) => boolean): Promise<SyncResult> {
	const follows = scanFollows(app).follows.filter(wanted);
	const forks = follows.length ? scanForks(app) : [];
	const out: SyncResult = { written: [], skipped: [] };
	for (const follow of follows) {
		const note = app.vault.getFileByPath(follow.path);
		if (!note) continue;
		const links: string[] = [];
		for (const f of forks) {
			const file = isForkOf(f.meta, follow) ? app.vault.getFileByPath(f.path) : null;
			if (file) links.push(app.fileManager.generateMarkdownLink(file, follow.path));
		}
		const section = renderForkList(links);
		// The cached text is enough to tell whether to write: `process` reads the file itself.
		const text = await app.vault.cachedRead(note);
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
	/** Each fork note and what the lists say of it (`listedAs`), kept current: a sync is due only when this changes. */
	private known = new Map<string, string>();
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
		// Read-only: which notes are forks, and of what.
		app.workspace.onLayoutReady(() => {
			this.known = new Map(scanForks(app).map((f) => [f.path, listedAs(f.meta) ?? '']));
		});
		// Most changes to a fork note are to its text, which no list shows: only a note that
		// becomes a fork, stops being one or changes source is synced. A follow note always is:
		// its list may have been edited, or turned on or off.
		plugin.registerEvent(
			app.metadataCache.on('changed', (f, _data, cache) => {
				const now = listedAs(readForkMeta(cache.frontmatter));
				const was = this.known.get(f.path) ?? null;
				if (now === null) this.known.delete(f.path);
				else this.known.set(f.path, now);
				if (now !== was || isFollowPath(f.path)) this.changed();
			}),
		);
		plugin.registerEvent(
			app.vault.on('delete', (f) => {
				if (this.known.delete(f.path) || isFollowPath(f.path)) this.changed();
			}),
		);
		plugin.registerEvent(app.vault.on('rename', (f, oldPath) => this.renamed(f, oldPath)));
	}

	/** A fork note that moved is linked by its new path; a follow note that moved has another name, so other forks. */
	private renamed(f: TAbstractFile, oldPath: string): void {
		if (!(f instanceof TFile)) return;
		const was = this.known.get(oldPath);
		if (was !== undefined) {
			this.known.delete(oldPath);
			this.known.set(f.path, was);
		}
		if (was !== undefined || isFollowPath(f.path) || isFollowPath(oldPath)) this.changed();
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

	/** Any follow note may keep a list, so every change that counts is synced; the sync filters. */
	private changed(): void {
		this.soon();
	}
}
