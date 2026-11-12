// The fork list in a follow note: the "Forked pages" section, which the plugin owns
// (docs/spec.md → Fork list); and replacing any such section. Pure.

export const FORK_LIST_HEADING = '## Forked pages';

/** The section listing these links to fork notes, sorted; `null` when there are none. */
export function renderForkList(links: readonly string[]): string | null {
	if (links.length === 0) return null;
	const items = [...new Set(links)].sort(cmp).map((l) => `- ${l}`);
	return [FORK_LIST_HEADING, '', ...items].join('\n');
}

/** `text` with its fork list replaced by `section` (`withSection`). */
export function withForkList(text: string, section: string | null): string | null {
	return withSection(text, FORK_LIST_HEADING, section);
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

function cmp(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
