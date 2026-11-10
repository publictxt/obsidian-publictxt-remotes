// The plugin's remote host for this vault, and how its errors read to the user.

import { App, FileSystemAdapter } from 'obsidian';
import type { PublicTxtData } from '../sources/schema.ts';
import { gitHost } from './git-process.ts';
import { fileUrl, isLocalRepo, localName } from '../sources/repo-url.ts';
import { RemoteError, type RemoteHost } from './host.ts';

/** The folder of the local source keyed `key` on this computer. Throws if none is set. */
export function localFolder(data: PublicTxtData, key: string): string {
	const name = localName(key);
	const path = data.localPaths[name];
	if (!path) throw new RemoteError('not-found', 'No folder set on this computer: set one with Edit in the source\'s settings.');
	return path;
}

/** The git host with clones under the vault's `remotesFolder`; local sources fetch from their folder. Desktop only. */
export function vaultHost(app: App, data: PublicTxtData): RemoteHost {
	const adapter = app.vault.adapter;
	if (!(adapter instanceof FileSystemAdapter)) throw new Error('This needs the desktop app.');
	const remote = (key: string) => (isLocalRepo(key) ? fileUrl(localFolder(data, key)) : key);
	return gitHost(data.gitPath, adapter.getBasePath(), data.remotesFolder, remote);
}

/** An error as one line for the user; a missing git points at the setting. */
export function errorText(e: unknown): string {
	if (e instanceof RemoteError && e.kind === 'no-git') return `${e.message}. Set the git executable in settings.`;
	return e instanceof Error ? e.message : String(e);
}
