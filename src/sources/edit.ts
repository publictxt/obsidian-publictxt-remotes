// The source form: text ↔ source, and the checks before a follow note is written
// (docs/spec.md → Sources settings). Pure.

import { normalizeSource, type Source } from './schema.ts';
import type { Follow } from './follow-note.ts';
import { canonicalRepoUrl, defaultRemoteName, isLocalRepo, localPathInput, remoteNameProblem } from './repo-url.ts';

/** What the source form holds: raw text, one path per line for lists. */
export interface SourceForm {
	/** The remote name; empty on add: suggested from the URL or folder. */
	name: string;
	/** A repo URL, or a local source's folder. */
	url: string;
	branch: string;
	include: string;
	folder: string;
	/** `''`: the setting decides. */
	listMirrors: '' | 'on' | 'off';
	/** `''`: the setting decides. */
	listForks: '' | 'on' | 'off';
}

export const EMPTY_FORM: SourceForm = { name: '', url: '', branch: '', include: '', folder: '', listMirrors: '', listForks: '' };

/** A source to write, its remote name, and a local source's folder (`null`: hosted). */
export type Checked = { ok: true; source: Source; name: string; localPath: string | null } | { ok: false; error: string };

const lines = (s: string): string[] => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

const NOT_A_SOURCE = 'Not a repo URL or folder: use https://host/owner/repo, git@host:owner/repo.git, or a folder like /home/me/notes.';

/** A follow as form text, for editing. `localPath`: a local source's folder on this computer, if set. */
export function sourceToForm(f: Follow, localPath: string | null): SourceForm {
	return {
		name: f.name,
		url: isLocalRepo(f.url) ? (localPath ?? '') : f.url,
		branch: f.branch ?? '',
		include: f.include.join('\n'),
		folder: f.folder ?? '',
		listMirrors: f.listMirrors === null ? '' : f.listMirrors ? 'on' : 'off',
		listForks: f.listForks === null ? '' : f.listForks ? 'on' : 'off',
	};
}

/** Form text → the source named `name`, or why not. A folder makes it local. */
export function formToSource(f: SourceForm, name: string): Checked {
	const hosted = canonicalRepoUrl(f.url);
	const localPath = hosted ? null : localPathInput(f.url);
	if (!hosted && !localPath) return { ok: false, error: NOT_A_SOURCE };
	const source = normalizeSource(
		{
			url: f.url,
			local: localPath !== null,
			branch: f.branch,
			include: lines(f.include),
			folder: f.folder,
			list_mirrors: f.listMirrors === '' ? null : f.listMirrors === 'on',
			list_forks: f.listForks === '' ? null : f.listForks === 'on',
		},
		name,
	);
	return source ? { ok: true, source, name, localPath } : { ok: false, error: 'Not a valid source.' };
}

/** A new source: a free name (suggested if empty), a URL not followed already. */
export function checkAdd(followed: readonly Follow[], f: SourceForm): Checked {
	const name = f.name.trim() || defaultRemoteName(f.url);
	if (!f.name.trim() && !name) return { ok: false, error: canonicalRepoUrl(f.url) || localPathInput(f.url) ? 'Enter a name.' : NOT_A_SOURCE };
	const problem = remoteNameProblem(name);
	if (problem) return { ok: false, error: problem };
	const taken = followed.find((s) => s.name.toLowerCase() === name.toLowerCase());
	if (taken) return { ok: false, error: `A remote named ${taken.name} already exists.` };
	const r = formToSource(f, name);
	if (!r.ok) return r;
	const same = followed.find((s) => s.url === r.source.url);
	if (same) return { ok: false, error: `Already following ${r.source.url}, as ${same.name}.` };
	return r;
}

/**
 * An edit of `follow`. Its name and a hosted source's URL are its identity, so the form's are
 * ignored; a local source's folder can change (it is this computer's, not the note's).
 */
export function checkUpdate(follow: Follow, f: SourceForm): Checked {
	if (!isLocalRepo(follow.url)) return formToSource({ ...f, url: follow.url }, follow.name);
	if (!localPathInput(f.url)) return { ok: false, error: 'Enter the folder of this local source on this computer, like /home/me/notes.' };
	return formToSource(f, follow.name);
}
