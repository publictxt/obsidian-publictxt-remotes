// Where git fetches a source from on this computer: its URL, or a folder in `localPaths`
// (docs/spec.md → Local sources, Local copies). Pure.

import type { PublicTxtData } from '../sources/schema.ts';
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
 * Where git fetches the source keyed `key` from: a local source's folder; a hosted source's
 * local copy while that folder is there, else its URL (another computer, an unplugged drive).
 * `nameOf`: the remote name of a hosted key, `isFolder`: whether a path is a folder now. Pure.
 */
export function fetchFrom(data: PublicTxtData, key: string, nameOf: (key: string) => string | undefined, isFolder: (path: string) => boolean): string {
	if (isLocalRepo(key)) return fileUrl(localFolder(data, localName(key)));
	if (Object.keys(data.localPaths).length === 0) return key;
	const name = nameOf(key);
	const copy = name === undefined ? undefined : data.localPaths[name];
	return copy && isFolder(copy) ? fileUrl(copy) : key;
}
