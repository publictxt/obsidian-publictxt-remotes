// The "Links to fix" and "Links to check" sections of a follow note: the links in its source's
// forks that converting left as they were, and those it made a call on
// (docs/plans/convert-links.md → The report). Pure.

import { CHECK_TEXT, LEFT_TEXT, type CheckLink, type LeftLink } from './links.ts';

export const LINK_REPORT_HEADING = '## Links to fix';
export const LINK_CHECK_HEADING = '## Links to check';

/** A fork note's links left as they were, and those a call was made on. */
export interface NoteLinks {
	/** The note's vault path, to sort by. */
	path: string;
	/** A link to the note, as the vault writes them. */
	link: string;
	left: readonly LeftLink[];
	check: readonly CheckLink[];
}

/** The "Links to fix" section, by note path then line; `null` when no link was left. */
export function renderLinkReport(notes: readonly NoteLinks[]): string | null {
	const intro = 'Links in forks of this source that converting left as they were. Rewritten each time links are converted.';
	return section(LINK_REPORT_HEADING, intro, notes, (n) => n.left.map((l) => [l.line, l.original, LEFT_TEXT[l.why]]));
}

/** The "Links to check" section, by note path then line; `null` when no call was made. */
export function renderCheckReport(notes: readonly NoteLinks[]): string | null {
	const intro = 'Links in forks of this source that converting made a call on: they may not go where upstream meant. Rewritten each time links are converted.';
	return section(LINK_CHECK_HEADING, intro, notes, (n) => n.check.map((l) => [l.line, l.link, CHECK_TEXT[l.why]]));
}

function section(heading: string, intro: string, notes: readonly NoteLinks[], rows: (n: NoteLinks) => [number, string, string][]): string | null {
	const items = [...notes]
		.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
		.flatMap((n) => rows(n).map(([line, link, why]) => `- ${n.link} line ${line + 1}: ${code(link)} ${why}`));
	if (items.length === 0) return null;
	return [heading, '', intro, '', ...items].join('\n');
}

/** `text` as inline code, fenced with more backticks than it holds, so a link in it isn't one. */
function code(text: string): string {
	const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
	const fence = '`'.repeat(longest + 1);
	const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
	return `${fence}${pad}${text}${pad}${fence}`;
}
