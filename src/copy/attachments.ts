// A note's attachments: the files that aren't Markdown it links or embeds, as upstream has them
// (docs/features/mirror.md#attachments). Pure.

/** A link's target as written, and whether it is a wikilink (found by name) or a path. */
export interface LinkRef {
	target: string;
	wiki: boolean;
}

/** Fenced code blocks and inline code: what Obsidian finds no links in. */
const CODE = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[`~]*[ \t]*$|(?![\s\S]))|`[^`\n]+`/gm;
const WIKI = /\[\[([^[\]|#^\n]+)[^\]\n]*\]\]/g;
const MARKDOWN = /\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*\)/g;
const HTML_SRC = /<(?:img|audio|video|source|embed|iframe|object)\b[^>]*?\s(?:src|data)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
/** A URL with a scheme (`https:`, `mailto:`, `obsidian:`), or one from another host (`//x`). */
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** The targets of a note's links and embeds, front matter too, not in code. Web links and links within the note are left out. */
export function linkRefs(text: string): LinkRef[] {
	const plain = text.replace(CODE, (m) => m.replace(/[^\n]/g, ' '));
	const refs: LinkRef[] = [];
	for (const m of plain.matchAll(WIKI)) refs.push({ target: (m[1] ?? '').trim(), wiki: true });
	for (const m of plain.matchAll(MARKDOWN)) refs.push({ target: hrefPath((m[1] ?? '').replace(/^<|>$/g, '')), wiki: false });
	for (const m of plain.matchAll(HTML_SRC)) refs.push({ target: hrefPath(m[1] ?? m[2] ?? ''), wiki: false });
	return refs.filter((r) => r.target !== '' && !EXTERNAL.test(r.target));
}

/** A Markdown link's path: without `#…` or `?…`, `%20` and the like decoded. */
function hrefPath(href: string): string {
	const path = href.replace(/[#?].*$/, '');
	try {
		return decodeURIComponent(path);
	} catch {
		return path;
	}
}

/** Whether `path` names a file that isn't a note: it has an extension, and it isn't `.md`. */
export function isAttachment(path: string): boolean {
	const name = path.slice(path.lastIndexOf('/') + 1);
	const dot = name.lastIndexOf('.');
	return dot > 0 && dot < name.length - 1 && name.slice(dot + 1).toLowerCase() !== 'md';
}

/** `path` with `.` and empty parts dropped, and `..` taking off the part before; `null` when it goes above the root. */
function normalize(path: string): string | null {
	const out: string[] = [];
	for (const part of path.split('/')) {
		if (part === '' || part === '.') continue;
		if (part === '..') {
			if (out.pop() === undefined) return null;
		} else out.push(part);
	}
	return out.join('/');
}

const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));
const depth = (path: string) => path.split('/').length;

/**
 * The upstream file a link in the note at `notePath` is to, of `files` (the tree's paths), as
 * Obsidian would find it: by its path from the note or from the root, else by the end of its path
 * (a wikilink's name, say). Of several, the one in the note's folder, else the shortest path, else
 * the first in byte order. `null`: none, or not an attachment.
 */
export function resolveRef(notePath: string, ref: LinkRef, files: ReadonlySet<string> | ReadonlyMap<string, unknown>): string | null {
	if (!isAttachment(ref.target)) return null;
	const here = folderOf(notePath);
	const fromRoot = ref.target.startsWith('/');
	const tries = fromRoot ? [ref.target] : ref.wiki ? [ref.target, `${here}/${ref.target}`] : [`${here}/${ref.target}`, ref.target];
	for (const t of tries) {
		const p = normalize(t);
		if (p !== null && files.has(p)) return p;
	}
	const tail = normalize(ref.target);
	if (tail === null || tail === '' || /(^|\/)\.\.(\/|$)/.test(ref.target)) return null;
	const end = `/${tail.toLowerCase()}`;
	const found = [...files.keys()].filter((p) => `/${p.toLowerCase()}`.endsWith(end));
	found.sort((a, b) => Number(folderOf(b) === here) - Number(folderOf(a) === here) || depth(a) - depth(b) || (a < b ? -1 : a > b ? 1 : 0));
	return found[0] ?? null;
}

/** The attachments of notes, each given by its upstream path and text: upstream path → blob, in the order found. */
export function attachmentsOf(notes: readonly { path: string; text: string }[], files: ReadonlyMap<string, string>): Map<string, string> {
	const out = new Map<string, string>();
	for (const note of notes) {
		for (const ref of linkRefs(note.text)) {
			const path = resolveRef(note.path, ref, files);
			const blob = path === null ? undefined : files.get(path);
			if (path !== null && blob !== undefined) out.set(path, blob);
		}
	}
	return out;
}

/** The git blob SHA of `bytes`: SHA-1, or SHA-256 when `like` (a SHA of the same repo) is that long. */
export async function gitBlobSha(bytes: Uint8Array, like = ''): Promise<string> {
	const head = new TextEncoder().encode(`blob ${bytes.length}\0`);
	const all = new Uint8Array(head.length + bytes.length);
	all.set(head);
	all.set(bytes, head.length);
	const digest = await crypto.subtle.digest(like.length === 64 ? 'SHA-256' : 'SHA-1', all);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * What to do with an attachment the vault has at its mirror's path, given its blob there (`held`)
 * and upstream's (`blob`): `current`, the same; `stale`, an earlier version from upstream (the
 * clone has it), to overwrite; `mine`, anything else: edited, or never upstream's. Left.
 */
export function attachmentState(held: string, blob: string, upstreamHas: boolean): 'current' | 'stale' | 'mine' {
	if (held === blob) return 'current';
	return upstreamHas ? 'stale' : 'mine';
}

/** How copying attachments went. Vault paths, but `failed`: one line each. */
export interface AttachmentsCopied {
	written: string[];
	updated: string[];
	/** Edited in the vault, or never upstream's: left as they are. */
	left: string[];
	failed: string[];
}

export function noAttachments(): AttachmentsCopied {
	return { written: [], updated: [], left: [], failed: [] };
}

/** Whether copying attachments left or failed any: a notice saying so stays until dismissed. */
export function troubled(r: AttachmentsCopied): boolean {
	return r.left.length > 0 || r.failed.length > 0;
}

/** How copying attachments went, as lines for a notice; none when nothing was copied or left. */
export function attachmentsText(r: AttachmentsCopied): string[] {
	const files = (n: number) => `${n} ${n === 1 ? 'attachment' : 'attachments'}`;
	const lines: string[] = [];
	const done = [r.written.length ? `${files(r.written.length)} copied` : '', r.updated.length ? `${files(r.updated.length)} updated` : ''].filter(Boolean);
	if (done.length) lines.push(`${done.join(', ')}.`.replace(/^./, (c) => c.toUpperCase()));
	if (r.left.length) lines.push('Left, as they differ from upstream:', ...r.left);
	if (r.failed.length) lines.push('Attachments not copied:', ...r.failed);
	return lines;
}

/**
 * The attachments to trash with the mirror notes `notes`: the files that aren't notes, in the
 * mirror folder `folder`, that they link to and no other note does. `links`: Obsidian's resolved
 * links, note → file linked → count.
 */
export function unusedAttachments(notes: readonly string[], folder: string, links: Readonly<Record<string, Readonly<Record<string, number>>>>): string[] {
	const going = new Set(notes);
	const inFolder = (p: string) => folder === '' || p.startsWith(`${folder}/`);
	const used = new Set<string>();
	for (const [from, to] of Object.entries(links)) {
		if (!going.has(from)) for (const p of Object.keys(to)) used.add(p);
	}
	const out = new Set<string>();
	for (const n of notes) {
		for (const p of Object.keys(links[n] ?? {})) {
			if (isAttachment(p) && inFolder(p) && !used.has(p)) out.add(p);
		}
	}
	return [...out].sort();
}
