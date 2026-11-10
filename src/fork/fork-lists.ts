// Keeps the fork list in each follow note current (docs/spec.md → Fork list): the Obsidian side
// of fork-list.ts.

import { App, debounce, Notice, TFile, type TAbstractFile } from 'obsidian';
import type PublicTxtPlugin from '../main.ts';
import { scanForks } from '../check/run.ts';
import { readForkMeta } from '../sources/fork-meta.ts';
import { isFollowPath } from '../sources/follow-note.ts';
import { scanFollows } from '../sources/follows.ts';
import { errorText } from '../remote/vault-host.ts';
import { renderForkList, withForkList } from './fork-list.ts';

export interface SyncResult {
	/** Follow notes rewritten. */
	written: string[];
	/** Follow notes left alone: the heading appears more than once. */
	skipped: string[];
	/** Every fork note seen. */
	forks: Set<string>;
}

/** Rewrites each follow note's fork list where it changed; others aren't touched. */
export async function syncForkLists(app: App): Promise<SyncResult> {
	const forks = scanForks(app);
	const out: SyncResult = { written: [], skipped: [], forks: new Set(forks.map((f) => f.path)) };
	for (const follow of scanFollows(app).follows) {
		const note = app.vault.getFileByPath(follow.path);
		if (!note) continue;
		const links: string[] = [];
		for (const f of forks) {
			const file = f.meta.repo === follow.url ? app.vault.getFileByPath(f.path) : null;
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

/** Updates fork lists after vault changes, while `listForks` is on. */
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
		plugin.registerEvent(
			app.metadataCache.on('changed', (f, _data, cache) => {
				if (readForkMeta(cache.frontmatter) || this.known.has(f.path) || isFollowPath(f.path)) this.changed();
			}),
		);
		const moved = (f: TAbstractFile, oldPath?: string) => {
			if (f instanceof TFile && f.extension === 'md' && (this.known.has(oldPath ?? f.path) || isFollowPath(f.path))) this.changed();
		};
		plugin.registerEvent(app.vault.on('delete', (f) => moved(f)));
		plugin.registerEvent(app.vault.on('rename', (f, oldPath) => moved(f, oldPath)));
	}

	/**
	 * Syncs every follow note now. `manual`: from the command, so it runs even with the setting
	 * off and reports what it did.
	 */
	async update(manual: boolean): Promise<void> {
		const { app, data } = this.plugin;
		if (!manual && (!data.listForks || !app.workspace.layoutReady)) return;
		if (this.running) {
			this.again = true;
			return;
		}
		this.running = true;
		try {
			const r = await syncForkLists(app);
			this.known = r.forks;
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

	private changed(): void {
		if (this.plugin.data.listForks) this.soon();
	}
}
