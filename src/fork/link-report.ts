// The "Links to fix" section of a follow note: the links in its source's forks that converting
// left as they were, and why (docs/plans/convert-links.md → The report). Pure.

import { LEFT_TEXT, type LeftLink } from './links.ts';

export const LINK_REPORT_HEADING = '## Links to fix';

/** A fork note's links left as they were. */
export interface NoteLinks {
	/** The note's vault path, to sort by. */
	path: string;
	/** A link to the note, as the vault writes them. */
	link: string;
	left: readonly LeftLink[];
}

/** The section, by note path then line; `null` when no link was left. */
export function renderLinkReport(notes: readonly NoteLinks[]): string | null {
	const items = [...notes]
		.filter((n) => n.left.length > 0)
		.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
		.flatMap((n) => n.left.map((l) => `- ${n.link} line ${l.line + 1}: ${code(l.original)} ${LEFT_TEXT[l.why]}`));
	if (items.length === 0) return null;
	return [LINK_REPORT_HEADING, '', 'Links in forks of this source that converting left as they were. Rewritten each time links are converted.', '', ...items].join('\n');
}

/** `text` as inline code, fenced with more backticks than it holds, so a link in it isn't one. */
function code(text: string): string {
	const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
	const fence = '`'.repeat(longest + 1);
	const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
	return `${fence}${pad}${text}${pad}${fence}`;
}
