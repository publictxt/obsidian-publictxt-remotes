// Updating mirrors from upstream (docs/features/mirror.md): whether a mirror may be overwritten,
// what an update came to, and how it is told. Pure.

import { isEdited, type NoteParts } from '../copy/edited.ts';

/** A mirror that isn't upstream's version: overwritten unasked (`clean`), or only after asking. */
export type MirrorState = 'clean' | 'edited' | 'unknown';

/** The state of the mirror `note`. `held`: the version it mirrors; `null`: it can't be read, so there is no telling. */
export function mirrorState(note: NoteParts, held: NoteParts | null): MirrorState {
	if (held === null) return 'unknown';
	return isEdited(note, held) ? 'edited' : 'clean';
}

/** What updating mirrors came to: each note's vault path, under what happened to it. */
export interface MirrorsUpdated {
	/** Overwritten with upstream's version. */
	updated: string[];
	/** That version already. */
	current: string[];
	/** Left: edited since mirrored. */
	edited: string[];
	/** Left: can't tell whether it was edited. */
	unknown: string[];
	/** Left: it went wrong. One line each, with the reason. */
	failed: string[];
}

export function noneUpdated(): MirrorsUpdated {
	return { updated: [], current: [], edited: [], unknown: [], failed: [] };
}

/** Adds `r` to `total`, in place. */
export function addUpdated(total: MirrorsUpdated, r: MirrorsUpdated): void {
	total.updated.push(...r.updated);
	total.current.push(...r.current);
	total.edited.push(...r.edited);
	total.unknown.push(...r.unknown);
	total.failed.push(...r.failed);
}

/** The notes an update left until the user says to overwrite them. */
export function leftOf(r: MirrorsUpdated): string[] {
	return [...r.edited, ...r.unknown];
}

/**
 * What one upstream file's update means for the check's list: `settled`, every mirror of it is
 * upstream's version; `gone`, nothing mirrors it any more; `open`, there is still something to do.
 */
export function updateOutcome(r: MirrorsUpdated): 'settled' | 'gone' | 'open' {
	if (leftOf(r).length || r.failed.length) return 'open';
	return r.updated.length || r.current.length ? 'settled' : 'gone';
}

/** What overwriting the mirrors an update left does, before it is done. */
export function overwriteQuestion(r: MirrorsUpdated): { title: string; message: string } {
	const parts: string[] = [];
	const list = (notes: readonly string[]) => notes.join(', ');
	if (r.edited.length === 1) parts.push(`${list(r.edited)} was edited since it was mirrored.`);
	else if (r.edited.length) parts.push(`${list(r.edited)} were edited since they were mirrored.`);
	if (r.unknown.length === 1) parts.push(`Can't tell whether ${list(r.unknown)} was edited: the version it mirrors can't be read.`);
	else if (r.unknown.length) parts.push(`Can't tell whether ${list(r.unknown)} were edited: the versions they mirror can't be read.`);
	parts.push('Updating replaces the text with upstream\'s, and any edits are lost. To keep them, fork it instead: it becomes your note.');
	return { title: r.edited.length ? 'Overwrite an edited mirror?' : 'Overwrite a mirror that may be edited?', message: parts.join(' ') };
}

/** How updating the mirrors of the one file `path` went, as a notice. `null`: nothing to tell yet, what is left is asked about. */
export function oneUpdatedText(path: string, r: MirrorsUpdated): string | null {
	const lines: string[] = [];
	const outcome = updateOutcome(r);
	if (outcome === 'gone') lines.push(`${path} is not mirrored any more.`);
	else if (outcome === 'settled') lines.push(r.updated.length ? `Updated the mirror of ${path}.` : `The mirror of ${path} is already up to date.`);
	if (r.failed.length) lines.push('Not updated:', ...r.failed);
	return lines.length ? lines.join('\n') : null;
}

/** How updating every changed mirror of the source `from` went, as a notice: its first line, then what is left. `gone`: upstream files not mirrored any more. */
export function allUpdatedText(from: string, r: MirrorsUpdated, gone: readonly string[]): { text: string; left: boolean } {
	const n = r.updated.length;
	const lines = [`Updated ${n} ${n === 1 ? 'mirror' : 'mirrors'} from ${from}.${r.current.length ? ` ${r.current.length} already up to date.` : ''}`];
	if (r.edited.length) lines.push('Edited since mirrored, so left as they are:', ...r.edited);
	if (r.unknown.length) lines.push('Can\'t tell whether edited, so left as they are:', ...r.unknown);
	if (leftOf(r).length) lines.push('Update one on its own to overwrite it, or fork it to keep the edits.');
	if (gone.length) lines.push('Not mirrored any more:', ...gone);
	if (r.failed.length) lines.push('Not updated:', ...r.failed);
	return { text: lines.join('\n'), left: lines.length > 1 };
}
