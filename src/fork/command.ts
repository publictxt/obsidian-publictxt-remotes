// The "Fork a file from a source" command: pick a source, then a file at its head.

import { App, Notice } from 'obsidian';
import { errorText, vaultHost } from '../remote/vault-host.ts';
import { scanFollows } from '../sources/follows.ts';
import type { Follow } from '../sources/follow-note.ts';
import type { PublicTxtData } from '../sources/schema.ts';
import { PickModal } from '../ui/pick-modal.ts';
import { isForkable } from './fork.ts';
import { startFork } from './run.ts';

export function forkFromSource(app: App, data: PublicTxtData): void {
	const { follows } = scanFollows(app);
	if (follows.length === 0) {
		new Notice('No sources. Add one in settings first.');
		return;
	}
	if (follows.length === 1 && follows[0]) void pickFile(app, data, follows[0]);
	else new PickModal(app, 'Fork from which source?', follows, (f) => f.name, (f) => void pickFile(app, data, f)).open();
}

/** Fetches the source's head, then offers its Markdown files. */
async function pickFile(app: App, data: PublicTxtData, follow: Follow): Promise<void> {
	const fetching = new Notice(`Fetching ${follow.name}…`, 0);
	try {
		const host = vaultHost(app, data);
		const head = await host.head(follow.url, follow.branch);
		const paths = [...(await host.tree(follow.url, head.tree)).files.keys()].filter(isForkable).sort();
		fetching.hide();
		if (paths.length === 0) {
			new Notice(`No Markdown files in ${follow.name} at ${head.branch}.`);
			return;
		}
		const choose = (path: string) => void startFork(app, data, { url: follow.url, name: follow.name, head, path, folder: follow.folder });
		new PickModal(app, `Fork which file from ${head.branch}?`, paths, (p) => p, choose).open();
	} catch (e) {
		fetching.hide();
		new Notice(errorText(e));
	}
}
