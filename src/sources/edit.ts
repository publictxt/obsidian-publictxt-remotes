// The source form: text ↔ source, and the checks before a follow note is written
// (docs/spec.md → Sources settings). Pure.

import { normalizeSource, type Source } from './schema.ts';
import { canonicalRepoUrl } from './repo-url.ts';

/** What the source form holds: raw text, one path per line for lists. */
export interface SourceForm {
	url: string;
	branch: string;
	include: string;
	watch: string;
	folder: string;
	/** `''`: the setting decides. */
	listForks: '' | 'on' | 'off';
}

export type Checked = { ok: true; source: Source } | { ok: false; error: string };

const lines = (s: string): string[] => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** A source as form text, for editing. */
export function sourceToForm(s: Source): SourceForm {
	return {
		url: s.url,
		branch: s.branch ?? '',
		include: s.include.join('\n'),
		watch: s.watch.join('\n'),
		folder: s.folder ?? '',
		listForks: s.listForks === null ? '' : s.listForks ? 'on' : 'off',
	};
}

/** Form text → a normalized source, or why not. */
export function formToSource(f: SourceForm): Checked {
	if (!canonicalRepoUrl(f.url)) return { ok: false, error: 'Not a repo URL: use https://host/owner/repo or git@host:owner/repo.git.' };
	const source = normalizeSource({
		url: f.url,
		branch: f.branch,
		include: lines(f.include),
		watch: lines(f.watch),
		folder: f.folder,
		list_forks: f.listForks === '' ? null : f.listForks === 'on',
	});
	return source ? { ok: true, source } : { ok: false, error: 'Not a valid source.' };
}

/** A new source; its URL must not be followed already. */
export function checkAdd(followed: readonly Source[], f: SourceForm): Checked {
	const r = formToSource(f);
	if (!r.ok) return r;
	if (followed.some((s) => s.url === r.source.url)) return { ok: false, error: `Already following ${r.source.url}.` };
	return r;
}

/** An edit of the source keyed `url`. The URL is the key, so the form's URL is ignored. */
export function checkUpdate(url: string, f: SourceForm): Checked {
	return formToSource({ ...f, url });
}
