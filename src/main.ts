import { Plugin, type TAbstractFile } from 'obsidian';
import { normalizeData, type PublicTxtData } from './sources/schema.ts';
import { isFollowPath } from './sources/follow-note.ts';
import { PublicTxtSettingTab } from './settings.ts';

export default class PublicTxtPlugin extends Plugin {
	/** Everything in data.json, always normalized (docs/spec.md → Data). */
	data!: PublicTxtData;

	async onload() {
		this.data = normalizeData(await this.loadData());
		const tab = new PublicTxtSettingTab(this.app, this);
		this.addSettingTab(tab);

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
}
