// The tags of a page, from its text (publictext spec §7; docs/features/tags.md). Pure: the YAML
// parser is passed in.

import { isRecord } from '../util/validate.ts';

/** YAML text → its value. Throws if it isn't valid. */
export type ParseYaml = (yaml: string) => unknown;

/** A tag's form for comparing: Unicode NFC, lower case (spec §7.3). */
export function tagMatch(tag: string): string {
	return tag.normalize('NFC').toLowerCase();
}

/** A page's tags as written, without `#`: front matter's, then the body's. Each once, by `tagMatch`. */
export function readTags(text: string, parseYaml: ParseYaml): string[] {
	const { front, body } = splitFrontMatter(text);
	const tags = new Map<string, string>();
	for (const tag of [...frontTags(front, parseYaml), ...inlineTags(body)]) {
		const match = tagMatch(tag);
		if (!tags.has(match)) tags.set(match, tag);
	}
	return [...tags.values()];
}

/** A first line `---`, up to the next line `---`. */
const FRONT = /^\uFEFF?---\r?\n((?:.*\r?\n)*?)---(?:\r?\n|$)/;

function splitFrontMatter(text: string): { front: string; body: string } {
	const m = FRONT.exec(text);
	return m ? { front: m[1] ?? '', body: text.slice(m[0].length) } : { front: '', body: text };
}

/** Front matter `tags`: a list, or one string. */
function frontTags(front: string, parseYaml: ParseYaml): string[] {
	if (!front.trim()) return [];
	let yaml: unknown;
	try {
		yaml = parseYaml(front);
	} catch {
		return [];
	}
	if (!isRecord(yaml)) return [];
	const list: unknown[] = Array.isArray(yaml.tags) ? yaml.tags : [yaml.tags];
	return list
		.filter((t): t is string => typeof t === 'string')
		.map((t) => t.trim().replace(/^#/, ''))
		.filter((t) => t !== '');
}

/** `#` at the start of a line or after whitespace. A letter's combining marks go with it. */
const INLINE = /(?<!\S)#([\p{L}\p{M}\p{Nd}_/-]+)/gu;
/** Where a fenced code block starts, in a list or a quote too: the fence, then the rest of the line. */
const FENCE = /^[\s>]*(?:(?:[-*+]|\d+[.)])\s+)*(`{3,}|~{3,})(.*)$/;

function inlineTags(body: string): string[] {
	const tags: string[] = [];
	for (const paragraph of paragraphs(body)) {
		for (const m of withoutCode(paragraph).matchAll(INLINE)) {
			const tag = m[1] ?? '';
			if (!/^\p{Nd}+$/u.test(tag)) tags.push(tag);
		}
	}
	return tags;
}

/** The body's paragraphs, without its fenced code blocks. One that never ends runs to the end. */
function paragraphs(body: string): string[] {
	const out: string[] = [];
	let lines: string[] = [];
	let fence: string | null = null;
	const end = () => {
		if (lines.length) out.push(lines.join('\n'));
		lines = [];
	};
	for (const line of body.split(/\r?\n/)) {
		if (fence !== null) {
			if (closes(line, fence)) fence = null;
			continue;
		}
		const m = FENCE.exec(line);
		// A backtick fence's line has no other backticks: else it is inline code.
		if (m && !(m[1]?.startsWith('`') && m[2]?.includes('`'))) {
			end();
			fence = m[1] ?? '';
		} else if (line.trim() === '') end();
		else lines.push(line);
	}
	end();
	return out;
}

/** Whether `line` ends the code block that `fence` began: as many of the same, or more, alone. */
function closes(line: string, fence: string): boolean {
	const s = line.replace(/^[\s>]*/, '').trimEnd();
	return s.length >= fence.length && s === (fence[0] ?? '').repeat(s.length);
}

/** Inline code: as many backticks on each side, with none beside them. */
const CODE = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g;

/** `text` with each inline code as one backtick: not whitespace, so a `#` after it starts no tag. */
function withoutCode(text: string): string {
	return text.includes('`') ? text.replace(CODE, '`') : text;
}
