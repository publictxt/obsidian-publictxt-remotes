// Source keys: the canonical repo URL v0 (docs/spec.md → Canonical repo URL), the `local:<name>`
// key of a local source, remote names, and local paths. Pure.

const SCP = /^git@([^:/\s]+):([^\s]+)$/;
const SEGMENT = /^[A-Za-z0-9._-]+$/;
const WINDOWS_PATH = /^[A-Za-z]:[\\/]/;
const LOCAL = 'local:';

/** `https://<host>/<owner>/<repo>`, or `null` if `input` isn't a hosted repo URL. */
export function canonicalRepoUrl(input: string): string | null {
	let s = input.trim();
	const scp = SCP.exec(s);
	if (scp) s = `https://${scp[1] ?? ''}/${scp[2] ?? ''}`;

	let url: URL;
	try {
		url = new URL(s);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
	if (url.username || url.password) return null;

	const parts = url.pathname.split('/').filter(Boolean);
	if (parts.length !== 2) return null;
	const owner = parts[0] ?? '';
	const repo = (parts[1] ?? '').replace(/\.git$/i, '');
	if (!SEGMENT.test(owner) || !SEGMENT.test(repo)) return null;

	return `https://${url.host.toLowerCase()}/${owner}/${repo}`;
}

/** Why `name` can't be a remote name (it is a follow note's file name), or `null`. */
export function remoteNameProblem(name: string): string | null {
	if (!name) return 'Enter a name.';
	if (name !== name.trim()) return 'A name can\'t start or end with a space.';
	if (name.startsWith('.')) return 'A name can\'t start with a dot.';
	if (/[\\/:*?"<>|#^[\]]/.test(name)) return 'A name can\'t contain \\ / : * ? " < > | # ^ [ ].';
	return null;
}

/** The key of the local source named `name`: what state, clones and checks use. */
export function localKey(name: string): string {
	return `${LOCAL}${name}`;
}

/** Whether a source key is a local source's. */
export function isLocalRepo(key: string): boolean {
	return key.startsWith(LOCAL);
}

/** The remote name in a local key. */
export function localName(key: string): string {
	return key.slice(LOCAL.length);
}

/** A source key from data.json: a canonical repo URL or a local key, or `null`. */
export function sourceKey(k: string): string | null {
	if (isLocalRepo(k)) return remoteNameProblem(localName(k)) ? null : k;
	return canonicalRepoUrl(k);
}

/**
 * The absolute folder a user typed, as a path or a `file:///` URL; `null` if it is neither.
 * `file:///home/me/my%20notes/` → `/home/me/my notes`; `C:\notes` → `C:/notes`.
 */
export function localPathInput(input: string): string | null {
	const s = input.trim();
	let path: string;
	if (s.startsWith('/') || WINDOWS_PATH.test(s)) path = s.replace(/\\/g, '/');
	else if (/^file:/i.test(s)) {
		let url: URL;
		try {
			url = new URL(s);
		} catch {
			return null;
		}
		if (url.host || url.username || url.password) return null;
		try {
			path = decodeURIComponent(url.pathname);
		} catch {
			return null;
		}
		if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
	} else return null;
	path = path.replace(/\/+$/, '');
	if (!path || /^[A-Za-z]:$/.test(path)) return null;
	return path;
}

/** An absolute path as a `file:///` URL for git: `%`, `?`, `#` and spaces escaped. */
export function fileUrl(path: string): string {
	const p = path.replace(/%/g, '%25').replace(/\?/g, '%3F').replace(/#/g, '%23').replace(/ /g, '%20');
	return `file://${p.startsWith('/') ? '' : '/'}${p}`;
}

/** The suggested remote name for a repo URL or a local path: `owner-repo`, or the folder's name. */
export function defaultRemoteName(input: string): string {
	const url = canonicalRepoUrl(input);
	if (url) {
		const [owner = '', repo = ''] = new URL(url).pathname.split('/').filter(Boolean);
		return `${owner}-${repo}`;
	}
	const path = localPathInput(input);
	if (!path) return '';
	const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.git$/i, '');
	return name.replace(/[\\/:*?"<>|#^[\]]+/g, '-').replace(/^[.\s]+|\s+$/g, '');
}
