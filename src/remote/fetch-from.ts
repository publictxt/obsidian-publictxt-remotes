// Where git fetches a source from on this computer: its URL, or a folder in `localPaths`
// (docs/spec.md → Local sources, Local copies). Pure.

import type { CheckFrom, PublicTxtData } from '../sources/schema.ts';
import { fileUrl, isLocalRepo, localName } from '../sources/repo-url.ts';
import { RemoteError } from './host.ts';

/**
 * The folder on this computer of the source named `name`: a local source's, or a hosted
 * source's local copy. Throws if none is set.
 */
export function localFolder(data: PublicTxtData, name: string): string {
	const path = data.localPaths[name];
	if (!path) throw new RemoteError('not-found', 'No folder set on this computer: set one with Edit in the source\'s settings.');
	return path;
}

/**
 * Where the hosted source named `name` is checked from, when it has a local copy: as chosen in
 * the check view, the copy until then. `null`: no choice to make (a local source, or no copy).
 */
export function checkFromOf(data: PublicTxtData, name: string, key: string): CheckFrom | null {
	if (isLocalRepo(key) || !data.localPaths[name]) return null;
	return data.checkFrom[name] ?? 'local';
}

/**
 * Where git fetches the source keyed `key` from: a local source's folder; a hosted source's
 * URL, or its local copy when it has one and that is what is chosen (`checkFromOf()`). A copy
 * chosen whose folder is missing (another computer, an unplugged drive) throws: the network is
 * never fetched in its place. `nameOf`: the remote name of a hosted key, `isFolder`: whether a
 * path is a folder now. Pure.
 */
export function fetchFrom(data: PublicTxtData, key: string, nameOf: (key: string) => string | undefined, isFolder: (path: string) => boolean): string {
	if (isLocalRepo(key)) return fileUrl(localFolder(data, localName(key)));
	if (Object.keys(data.localPaths).length === 0) return key;
	const name = nameOf(key);
	if (name === undefined || checkFromOf(data, name, key) !== 'local') return key;
	const copy = localFolder(data, name);
	if (!isFolder(copy)) throw new RemoteError('not-found', `The local copy's folder is missing: ${copy}. Choose Remote to check from the network, or set the local copy again with Edit in the source's settings.`);
	return fileUrl(copy);
}
