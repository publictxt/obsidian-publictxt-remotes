// Canonical repo URL, v0 (docs/spec.md → Canonical repo URL). Pure.

const SCP = /^git@([^:/\s]+):([^\s]+)$/;
const SEGMENT = /^[A-Za-z0-9._-]+$/;
const WINDOWS_PATH = /^[A-Za-z]:[\\/]/;

/**
 * `https://<host>/<owner>/<repo>` for a hosted repo, `file:///<path>` for a local one, or `null`
 * if `input` isn't a repo URL. An absolute path (`/home/me/notes`, `C:\notes`) is a local repo.
 */
export function canonicalRepoUrl(input: string): string | null {
	let s = input.trim();
	const scp = SCP.exec(s);
	if (scp) s = `https://${scp[1] ?? ''}/${scp[2] ?? ''}`;
	else if (s.startsWith('/') || WINDOWS_PATH.test(s)) s = pathToFileUrl(s);

	let url: URL;
	try {
		url = new URL(s);
	} catch {
		return null;
	}
	if (url.protocol === 'file:') return canonicalFileUrl(url);
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
	if (url.username || url.password) return null;

	const parts = url.pathname.split('/').filter(Boolean);
	if (parts.length !== 2) return null;
	const owner = parts[0] ?? '';
	const repo = (parts[1] ?? '').replace(/\.git$/i, '');
	if (!SEGMENT.test(owner) || !SEGMENT.test(repo)) return null;

	return `https://${url.host.toLowerCase()}/${owner}/${repo}`;
}

/** Whether a canonical repo URL is a local repo. */
export function isLocalRepo(url: string): boolean {
	return url.startsWith('file:///');
}

/** A local repo's folder name, decoded, without `.git`: `file:///home/me/my%20notes.git` → `my notes`. */
export function localRepoName(url: string): string {
	const last = url.slice(url.lastIndexOf('/') + 1);
	let name = last;
	try {
		name = decodeURIComponent(last);
	} catch {
		// Malformed escape: keep it as written.
	}
	return name.replace(/\.git$/i, '');
}

/** A local repo's folder on this computer: `file:///home/me/my%20notes` → `/home/me/my notes`, `file:///C:/notes` → `C:/notes`. */
export function localRepoPath(url: string): string {
	let path = url.slice('file://'.length);
	try {
		path = decodeURIComponent(path);
	} catch {
		// Malformed escape: keep it as written.
	}
	return /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path;
}

/** An absolute path as a `file:` URL. `%`, `?` and `#` are path characters here, not URL syntax. */
function pathToFileUrl(path: string): string {
	const p = path.replace(/\\/g, '/').replace(/%/g, '%25').replace(/\?/g, '%3F').replace(/#/g, '%23');
	return `file://${p.startsWith('/') ? '' : '/'}${p}`;
}

/** `file:///<path>`: on this machine only, trailing `/` and query and fragment dropped; `.git` kept, it's part of the path. */
function canonicalFileUrl(url: URL): string | null {
	if (url.host || url.username || url.password) return null;
	const path = url.pathname.replace(/\/+$/, '');
	if (!path) return null;
	return `file://${path}`;
}
