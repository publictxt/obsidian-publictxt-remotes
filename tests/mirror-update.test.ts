import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addUpdated, allUpdatedText, leftOf, mirrorState, noneUpdated, oneUpdatedText, overwriteQuestion, updateOutcome, type MirrorsUpdated } from '../src/mirror/update.ts';

const result = (over: Partial<MirrorsUpdated>): MirrorsUpdated => ({ ...noneUpdated(), ...over });

test('mirrorState: clean, edited, or no telling', () => {
	const held = { front: { title: 'Git' }, body: 'text\n' };
	assert.equal(mirrorState({ front: { title: 'Git', mirror_path: 'a.md' }, body: 'text\n' }, held), 'clean');
	assert.equal(mirrorState({ front: { title: 'Git' }, body: 'mine\n' }, held), 'edited');
	assert.equal(mirrorState(held, null), 'unknown');
});

test('updateOutcome: settled only when every mirror is upstream\'s version', () => {
	assert.equal(updateOutcome(result({ updated: ['a.md'] })), 'settled');
	assert.equal(updateOutcome(result({ current: ['a.md'] })), 'settled');
	assert.equal(updateOutcome(result({ updated: ['a.md'], edited: ['b.md'] })), 'open');
	assert.equal(updateOutcome(result({ unknown: ['a.md'] })), 'open');
	assert.equal(updateOutcome(result({ updated: ['a.md'], failed: ['b.md: no'] })), 'open');
	// Nothing found to update is not an update.
	assert.equal(updateOutcome(noneUpdated()), 'gone');
});

test('addUpdated, leftOf', () => {
	const total = result({ updated: ['a.md'], edited: ['b.md'] });
	addUpdated(total, result({ updated: ['c.md'], unknown: ['d.md'], failed: ['e.md: no'] }));
	assert.deepEqual(total, { updated: ['a.md', 'c.md'], current: [], edited: ['b.md'], unknown: ['d.md'], failed: ['e.md: no'] });
	assert.deepEqual(leftOf(total), ['b.md', 'd.md']);
});

test('overwriteQuestion: edited and can\'t tell are said apart', () => {
	const edited = overwriteQuestion(result({ edited: ['a.md'] }));
	assert.equal(edited.title, 'Overwrite an edited mirror?');
	assert.match(edited.message, /^a\.md was edited since it was mirrored\. Updating replaces/);
	const unknown = overwriteQuestion(result({ unknown: ['a.md'] }));
	assert.equal(unknown.title, 'Overwrite a mirror that may be edited?');
	assert.match(unknown.message, /^Can't tell whether a\.md was edited: the version it mirrors can't be read\. Updating/);
	const both = overwriteQuestion(result({ edited: ['a.md', 'b.md'], unknown: ['c.md', 'd.md'] }));
	assert.match(both.message, /^a\.md, b\.md were edited since they were mirrored\. Can't tell whether c\.md, d\.md were edited: the versions they mirror can't be read\./);
});

test('oneUpdatedText: updated only when something was', () => {
	assert.equal(oneUpdatedText('w/a.md', result({ updated: ['a.md'] })), 'Updated the mirror of w/a.md.');
	assert.equal(oneUpdatedText('w/a.md', result({ current: ['a.md'] })), 'The mirror of w/a.md is already up to date.');
	assert.equal(oneUpdatedText('w/a.md', noneUpdated()), 'w/a.md is not mirrored any more.');
	assert.equal(oneUpdatedText('w/a.md', result({ edited: ['a.md'] })), null);
	assert.equal(oneUpdatedText('w/a.md', result({ failed: ['a.md: no'] })), 'Not updated:\na.md: no');
});

test('allUpdatedText: the count of mirrors, then what is left', () => {
	assert.deepEqual(allUpdatedText('txt', result({ updated: ['a.md'] }), []), { text: 'Updated 1 mirror from txt.', left: false });
	assert.deepEqual(allUpdatedText('txt', result({ updated: ['a.md', 'b.md'], current: ['c.md'] }), []), { text: 'Updated 2 mirrors from txt. 1 already up to date.', left: false });
	const { text, left } = allUpdatedText('txt', result({ edited: ['a.md'], unknown: ['b.md'], failed: ['c.md: no'] }), ['w/d.md']);
	assert.ok(left);
	assert.equal(text, 'Updated 0 mirrors from txt.\nEdited since mirrored, so left as they are:\na.md\nCan\'t tell whether edited, so left as they are:\nb.md\nUpdate one on its own to overwrite it, or fork it to keep the edits.\nNot mirrored any more:\nw/d.md\nNot updated:\nc.md: no');
});
