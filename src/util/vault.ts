// Small vault helpers shared by the Obsidian-side modules.

import type { App } from 'obsidian';

/** Creates each missing folder along `path`; `''` is the vault root. */
export async function ensureFolder(app: App, path: string): Promise<void> {
	let at = '';
	for (const part of path.split('/').filter(Boolean)) {
		at = at ? `${at}/${part}` : part;
		if (!app.vault.getAbstractFileByPath(at)) await app.vault.createFolder(at);
	}
}
