// The mirror and fork lists in a follow note: the "Mirrored pages" and "Forked pages" sections,
// which the plugin owns (docs/spec.md → Mirror and fork lists); and replacing any such section. Pure.

export const MIRROR_LIST_HEADING = '## Mirrored pages';
export const FORK_LIST_HEADING = '## Forked pages';

/** The section listing these links to fork notes, sorted; `null` when there are none. */
export function renderForkList(links: readonly string[]): string | null {
	return renderPageList(FORK_LIST_HEADING, links);
}

/** The section listing these links to mirror notes, sorted; `null` when there are none. */
export function renderMirrorList(links: readonly string[]): string | null {
	return renderPageList(MIRROR_LIST_HEADING, links);
}

function renderPageList(heading: string, links: readonly string[]): string | null {
	if (links.length === 0) return null;
	const items = [...new Set(links)].sort(cmp).map((l) => `- ${l}`);
	return [heading, '', ...items].join('\n');
}

/**
 * `text` with the section under `heading` (a whole `## …` line) replaced by `section`: added at
 * the end if missing, removed if `section` is `null`. The section runs from its heading to the
 * next `#` or `##` heading, or the end; text outside it is kept. `null` when the heading appears
 * more than once: the note is left alone.
 */
export function withSection(text: string, heading: string, section: string | null): string | null {
	const lines = text.split('\n');
	const at = lines.flatMap((l, i) => (l.trimEnd() === heading ? [i] : []));
	if (at.length > 1) return null;

	let head = text;
	let tail = '';
	const start = at[0];
	if (start !== undefined) {
		const next = lines.findIndex((l, i) => i > start && /^#{1,2}\s/.test(l));
		head = lines.slice(0, start).join('\n');
		tail = next < 0 ? '' : lines.slice(next).join('\n');
	} else if (section === null) return text;

	const parts = [head.replace(/\s+$/, ''), section ?? '', tail.replace(/^\s+/, '')].filter(Boolean);
	if (parts.length === 0) return '';
	const out = parts.join('\n\n');
	return tail.trim() ? out : `${out}\n`;
}

/** `text` with each `[heading, section]` put in place (`withSection`); the headings that appear twice are skipped. */
export function withSections(text: string, sections: readonly (readonly [string, string | null])[]): { text: string; skipped: string[] } {
	const skipped: string[] = [];
	let out = text;
	for (const [heading, section] of sections) {
		const next = withSection(out, heading, section);
		if (next === null) skipped.push(heading);
		else out = next;
	}
	return { text: out, skipped };
}

function cmp(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
