// Reading `git cat-file --batch` output. Pure.

import { isSha } from '../util/validate.ts';

/**
 * Parses `git cat-file --batch` output, given as binary text (a character per byte, since its
 * sizes are in bytes): blob SHA → its content as UTF-8 text. Objects it says are missing are left out.
 */
export function parseBatch(out: string): Map<string, string> {
	const blobs = new Map<string, string>();
	for (let at = 0; at < out.length; ) {
		const end = out.indexOf('\n', at);
		if (end < 0) break;
		const [id, type, size] = out.slice(at, end).split(' ');
		at = end + 1;
		// `<id> missing`: no content follows.
		if (size === undefined || !/^\d+$/.test(size)) continue;
		const n = Number(size);
		// Cut short: half a content is no content.
		if (at + n > out.length) break;
		if (type === 'blob' && isSha(id)) blobs.set(id, utf8(out.slice(at, at + n)));
		at += n + 1;
	}
	return blobs;
}

/** Binary text as the UTF-8 it holds. A byte order mark stays, as `RemoteHost.blob` keeps it. */
function utf8(binary: string): string {
	if (!/[\x80-\xff]/.test(binary)) return binary;
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
}
