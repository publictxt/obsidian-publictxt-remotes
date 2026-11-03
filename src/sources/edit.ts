// Adding, editing and removing sources (docs/spec.md → Sources settings).
// Pure: the settings UI calls these, tests run them under plain Node.

import { normalizeSource, type PublicTxtData, type Source } from './schema.ts';
import { canonicalRepoUrl } from './repo-url.ts';

/** What the source form holds: raw text, one path per line for lists. */
export interface SourceForm {
	url: string;
	branch: string;
	include: string;
	watch: string;
	folder: string;
}

export type EditResult = { ok: true; data: PublicTxtData } | { ok: false; error: string };

const lines = (s: string): string[] => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** A source as form text, for editing. */
export function sourceToForm(s: Source): SourceForm {
	return {
		url: s.url,
		branch: s.branch ?? '',
		include: s.include.join('\n'),
		watch: s.watch.join('\n'),
		folder: s.folder ?? '',
	};
}

/** Form text → a normalized source, or why not. */
export function formToSource(f: SourceForm): { ok: true; source: Source } | { ok: false; error: string } {
	if (!canonicalRepoUrl(f.url)) return { ok: false, error: 'Not a repo URL: use https://host/owner/repo or git@host:owner/repo.git.' };
	const source = normalizeSource({
		url: f.url,
		branch: f.branch,
		include: lines(f.include),
		watch: lines(f.watch),
		folder: f.folder,
	});
	return source ? { ok: true, source } : { ok: false, error: 'Not a valid source.' };
}

/** Appends a new source. Its URL must not be followed already. */
export function addSource(data: PublicTxtData, f: SourceForm): EditResult {
	const r = formToSource(f);
	if (!r.ok) return r;
	if (data.sources.some((s) => s.url === r.source.url)) return { ok: false, error: `Already following ${r.source.url}.` };
	return { ok: true, data: { ...data, sources: [...data.sources, r.source] } };
}

/**
 * Replaces the source keyed `url`, in place. The URL is the key, so it can't change here:
 * a different URL is a different source (remove and add). State is kept.
 */
export function updateSource(data: PublicTxtData, url: string, f: SourceForm): EditResult {
	const i = data.sources.findIndex((s) => s.url === url);
	if (i < 0) return { ok: false, error: `Not following ${url}.` };
	const r = formToSource({ ...f, url });
	if (!r.ok) return r;
	const sources = data.sources.slice();
	sources[i] = r.source;
	return { ok: true, data: { ...data, sources } };
}

/** Drops the source and its state. Its clone stays on disk. */
export function removeSource(data: PublicTxtData, url: string): PublicTxtData {
	const state = { ...data.state };
	delete state[url];
	return { ...data, sources: data.sources.filter((s) => s.url !== url), state };
}
