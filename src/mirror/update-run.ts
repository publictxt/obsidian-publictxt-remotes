// Updating mirrors from upstream (docs/features/mirror.md): the Obsidian side of update.ts. An
// update overwrites a mirror, and asks first only when it was edited, or may have been.

import { App, Notice, type TFile } from 'obsidian';
import type PublicTxtPlugin from '../main.ts';
import type { MirrorChange } from '../check/check.ts';
import { copiesOf, isFrom, type Remote } from '../copy/copy.ts';
import type { NoteParts } from '../copy/edited.ts';
import { noteParts, overwriteWithProvenance } from '../copy/run.ts';
import type { Head, RemoteHost } from '../remote/host.ts';
import { errorText, vaultHost } from '../remote/vault-host.ts';
import { readMirrorMeta, writeMirrorMeta, type MirrorMeta } from '../sources/fork-meta.ts';
import { scanMirrors } from '../sources/forks.ts';
import { ConfirmModal } from '../ui/confirm-modal.ts';
import { updatedMirrorMeta } from './mirror.ts';
import { addUpdated, allUpdatedText, leftOf, mirrorState, noneUpdated, oneUpdatedText, overwriteQuestion, updateOutcome, type MirrorsUpdated } from './update.ts';

/** What mirrors are updated from: a source at the head its last check saw. */
interface Upstream {
	app: App;
	host: RemoteHost;
	source: Remote;
	head: Head;
}

/** A change there is a new version for: not one gone upstream. */
type NewVersion = MirrorChange & { blob: string };

function isNewVersion(change: MirrorChange): change is NewVersion {
	return change.blob !== null;
}

/**
 * The notes to update for `change`: those its check found, and those found now, since a mirror
 * moved by hand is still one. The check's too, as the metadata cache may lag a write.
 */
function notesOf(up: Upstream, change: MirrorChange): string[] {
	const now = copiesOf(scanMirrors(up.app), up.source, change.path);
	return [...new Set([...change.notes, ...now].map((m) => m.path))];
}

/** A mirror note as it is on disk now, or `null` if it is gone or no longer mirrors `path` from this source. */
async function readMirror(up: Upstream, note: string, path: string): Promise<{ file: TFile; text: string; parts: NoteParts; meta: MirrorMeta } | null> {
	const file = up.app.vault.getFileByPath(note);
	if (!file) return null;
	// From the file, not the metadata cache, which may lag a write.
	const text = await up.app.vault.read(file);
	const parts = noteParts(text);
	const meta = readMirrorMeta(parts.front);
	return meta && meta.path === path && isFrom(meta, up.source) ? { file, text, parts, meta } : null;
}

/** The version a mirror holds, as upstream has it; `null`: can't be read (history rewritten). */
async function heldVersion(up: Upstream, blob: string): Promise<NoteParts | null> {
	try {
		return noteParts(await up.host.blob(up.source.url, blob));
	} catch {
		return null;
	}
}

/**
 * Overwrites the mirrors of `change` with upstream's version. One that was edited, or may have
 * been, is left unless `agreed` has it: the notes the user said to overwrite.
 */
async function updateNotes(up: Upstream, change: NewVersion, agreed: ReadonlySet<string>): Promise<MirrorsUpdated> {
	const out = noneUpdated();
	let text: string | null = null;
	for (const path of notesOf(up, change)) {
		try {
			const mirror = await readMirror(up, path, change.path);
			if (!mirror) continue;
			if (mirror.meta.blob === change.blob) {
				out.current.push(path);
				continue;
			}
			// Before the state: with upstream out of reach that is what's wrong, not that it can't be told.
			text ??= await up.host.blob(up.source.url, change.blob);
			const state = agreed.has(path) ? 'clean' : mirrorState(mirror.parts, await heldVersion(up, mirror.meta.blob));
			if (state !== 'clean') {
				out[state].push(path);
				continue;
			}
			const next = updatedMirrorMeta(mirror.meta, up.head, change.blob, new Date());
			await overwriteWithProvenance(up.app, mirror.file, mirror.text, text, (front) => writeMirrorMeta(front, next));
			out.updated.push(path);
		} catch (e) {
			out.failed.push(`${path}: ${errorText(e)}`);
		}
	}
	return out;
}

/** Brings the last check in line with what updating each upstream file came to. Gives those not mirrored any more. */
function settle(plugin: PublicTxtPlugin, source: Remote, results: readonly (readonly [path: string, r: MirrorsUpdated])[]): string[] {
	const paths = (outcome: ReturnType<typeof updateOutcome>) => results.filter(([, r]) => updateOutcome(r) === outcome).map(([path]) => path);
	const gone = paths('gone');
	plugin.mirrorsNow(source.url, { settled: paths('settled'), drop: gone });
	return gone;
}

/** Updates one upstream file's mirrors from the last check's head. One that was edited, or may have been, is overwritten only after asking. */
export async function updateMirror(plugin: PublicTxtPlugin, source: Remote, head: Head, change: MirrorChange): Promise<void> {
	const { app, data } = plugin;
	if (!isNewVersion(change)) return;
	const update = async (agreed: ReadonlySet<string>): Promise<void> => {
		try {
			const r = await updateNotes({ app, host: vaultHost(app, data), source, head }, change, agreed);
			settle(plugin, source, [[change.path, r]]);
			const told = oneUpdatedText(change.path, r);
			if (told !== null) new Notice(told, r.failed.length ? 0 : undefined);
			const left = leftOf(r);
			if (!left.length) return;
			const { title, message } = overwriteQuestion(r);
			new ConfirmModal(app, title, message, 'Overwrite', () => update(new Set([...agreed, ...left]))).open();
		} catch (e) {
			new Notice(errorText(e));
		}
	};
	await update(new Set());
}

/** Updates every mirror the last check found changed upstream. Those edited, or that may have been, are left, and named. */
export async function updateMirrors(plugin: PublicTxtPlugin, source: Remote, head: Head, changes: readonly MirrorChange[]): Promise<void> {
	const { app, data } = plugin;
	try {
		const up: Upstream = { app, host: vaultHost(app, data), source, head };
		const todo = changes.filter(isNewVersion);
		if (todo.length > 1) await up.host.prefetch?.(source.url, todo.map((c) => c.blob));
		const results: [string, MirrorsUpdated][] = [];
		const total = noneUpdated();
		for (const change of todo) {
			const r = await updateNotes(up, change, new Set());
			results.push([change.path, r]);
			addUpdated(total, r);
		}
		const { text, left } = allUpdatedText(source.name, total, settle(plugin, source, results));
		// With anything left over it stays until dismissed: it is the only record of it.
		new Notice(text, left ? 0 : undefined);
	} catch (e) {
		new Notice(errorText(e));
	}
}
