// The source form: text ↔ source, and the checks before a follow note is written
// (docs/features/sources.md). Pure.

import { normalizeSource, type Source } from './schema.ts';
import type { Follow } from './follow-note.ts';
import { comboText } from '../tags/combo.ts';
import { canonicalRepoUrl, defaultRemoteName, isLocalRepo, localPathInput, remoteNameProblem } from './repo-url.ts';

/** What the source form holds: raw text, one path per line for lists. */
export interface SourceForm {
	/** The remote name; empty on add: suggested from the URL or folder. */
	name: string;
	/** A repo URL: a hosted source. Empty: a local source. */
	url: string;
	/** A folder on this computer: a local source's, or a hosted source's local copy (empty: none). */
	path: string;
	branch: string;
	include: string;
	/** A tag combo per line, as in `follow_tags`. */
	followTags: string;
	folder: string;
	/** `''`: the setting decides. */
	listMirrors: '' | 'on' | 'off';
	/** `''`: the setting decides. */
	listForks: '' | 'on' | 'off';
}

export const EMPTY_FORM: SourceForm = { name: '', url: '', path: '', branch: '', include: '', followTags: '', folder: '', listMirrors: '', listForks: '' };

/** A source to write, its remote name, and its folder on this computer: a local source's, or a hosted source's local copy (`null`: none). */
export type Checked = { ok: true; source: Source; name: string; localPath: string | null } | { ok: false; error: string };

const lines = (s: string): string[] => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

const NEITHER = 'Enter a repo URL, a local path, or both.';
const NOT_A_URL = 'Repo URL: use https://host/owner/repo or git@host:owner/repo.git.';
const FOLDER_AS_URL = 'Repo URL: that\'s a folder. Enter it as the local path.';
const NOT_A_PATH = 'Local path: enter a folder on this computer, like /home/me/notes.';
const URL_AS_PATH = 'Local path: that\'s a repo URL. Enter it as the repo URL.';

/** A follow as form text, for editing. `localPath`: its folder on this computer, if set. */
export function sourceToForm(f: Follow, localPath: string | null): SourceForm {
	return {
		name: f.name,
		url: isLocalRepo(f.url) ? '' : f.url,
		path: localPath ?? '',
		branch: f.branch ?? '',
		include: f.include.join('\n'),
		followTags: f.followTags.map(comboText).join('\n'),
		folder: f.folder ?? '',
		listMirrors: f.listMirrors === null ? '' : f.listMirrors ? 'on' : 'off',
		listForks: f.listForks === null ? '' : f.listForks ? 'on' : 'off',
	};
}

/** Why the form's URL and path don't make a source, or `null`: at least one, each of its own kind. */
function whereProblem(f: SourceForm): string | null {
	if (!f.url.trim() && !f.path.trim()) return NEITHER;
	if (f.url.trim() && !canonicalRepoUrl(f.url)) return localPathInput(f.url) ? FOLDER_AS_URL : NOT_A_URL;
	if (f.path.trim() && !localPathInput(f.path)) return canonicalRepoUrl(f.path) ? URL_AS_PATH : NOT_A_PATH;
	return null;
}

/** Form text → the source named `name`, or why not. A URL makes it hosted, its path a local copy; a path alone, local. */
export function formToSource(f: SourceForm, name: string): Checked {
	const problem = whereProblem(f);
	if (problem) return { ok: false, error: problem };
	const source = normalizeSource(
		{
			url: f.url,
			local: !f.url.trim(),
			branch: f.branch,
			include: lines(f.include),
			follow_tags: lines(f.followTags),
			folder: f.folder,
			list_mirrors: f.listMirrors === '' ? null : f.listMirrors === 'on',
			list_forks: f.listForks === '' ? null : f.listForks === 'on',
		},
		name,
	);
	return source ? { ok: true, source, name, localPath: localPathInput(f.path) } : { ok: false, error: 'Not a valid source.' };
}

/** A new source: a free name (suggested if empty), a URL not followed already. */
export function checkAdd(followed: readonly Follow[], f: SourceForm): Checked {
	const where = whereProblem(f);
	if (where) return { ok: false, error: where };
	const name = f.name.trim() || defaultRemoteName(f.url.trim() ? f.url : f.path);
	if (!name) return { ok: false, error: 'Enter a name.' };
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
 * An edit of `follow`. Its name and its URL (a local source has none) are its identity, so the
 * form's are ignored; its path can change (it is this computer's, not the note's). A local
 * source must have one.
 */
export function checkUpdate(follow: Follow, f: SourceForm): Checked {
	if (!isLocalRepo(follow.url)) return formToSource({ ...f, url: follow.url }, follow.name);
	if (!f.path.trim()) return { ok: false, error: NOT_A_PATH };
	return formToSource({ ...f, url: '' }, follow.name);
}
