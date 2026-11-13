// The plugin's remote host for this vault, and how its errors read to the user.

import { App, FileSystemAdapter } from 'obsidian';
import type { PublicTxtData } from '../sources/schema.ts';
import { gitHost, isFolderNow } from './git-process.ts';
import { scanFollows } from '../sources/follows.ts';
import { fetchFrom } from './fetch-from.ts';
import { RemoteError, type RemoteHost } from './host.ts';

/**
 * The git host with clones under the vault's `clonesFolder`; a local source, and a hosted one
 * with a local copy, fetch from their folder. Desktop only.
 */
export function vaultHost(app: App, data: PublicTxtData): RemoteHost {
	const adapter = app.vault.adapter;
	if (!(adapter instanceof FileSystemAdapter)) throw new Error('This needs the desktop app.');
	const nameOf = (key: string) => scanFollows(app).follows.find((f) => f.url === key)?.name;
	const remote = (key: string) => fetchFrom(data, key, nameOf, isFolderNow);
	return gitHost(data.gitPath, adapter.getBasePath(), data.clonesFolder, remote);
}

/** An error as one line for the user; a missing git points at the setting. */
export function errorText(e: unknown): string {
	if (e instanceof RemoteError && e.kind === 'no-git') return `${e.message}. Set the git executable in settings.`;
	return e instanceof Error ? e.message : String(e);
}
