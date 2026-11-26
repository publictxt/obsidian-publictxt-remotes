import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCombos, comboKey, comboText, parseCombo, readCombos } from '../src/tags/combo.ts';

test('parseCombo: tags and exclusions, # dropped, each once by match', () => {
	assert.deepEqual(parseCombo('  books   -fiction #Dev dev -#Fiction '), { tags: ['books', 'Dev'], not: ['fiction'] });
	assert.deepEqual(parseCombo('-politics'), { tags: [], not: ['politics'] });
	assert.equal(parseCombo('   '), null);
	assert.equal(parseCombo('- # -#'), null);
});

test('comboText: tags as written, then exclusions', () => {
	assert.equal(comboText({ tags: ['Dev', 'app/x'], not: ['old'] }), 'Dev app/x -old');
	const c = parseCombo('a -b c');
	assert.ok(c);
	assert.deepEqual(parseCombo(comboText(c)), c);
});

test('readCombos: a list or one string; lines without a tag and repeats dropped', () => {
	assert.deepEqual(readCombos('dev obsidian'), [{ tags: ['dev', 'obsidian'], not: [] }]);
	assert.deepEqual(readCombos(['dev obsidian', 'Obsidian DEV', '', 3, null, 'books -fiction']), [
		{ tags: ['dev', 'obsidian'], not: [] },
		{ tags: ['books'], not: ['fiction'] },
	]);
	assert.deepEqual(readCombos(undefined), []);
	assert.deepEqual(readCombos({ dev: true }), []);
});

test('comboKey: order and case don\'t count; included and left out differ', () => {
	assert.equal(comboKey({ tags: ['B', 'a'], not: [] }), comboKey({ tags: ['a', 'b'], not: [] }));
	assert.notEqual(comboKey({ tags: ['a'], not: ['b'] }), comboKey({ tags: ['a', 'b'], not: [] }));
});

test('addCombos: those not there yet, after the rest', () => {
	const [a, b, c] = ['dev obsidian', 'Obsidian dev', 'books'].map((l) => parseCombo(l)) as [NonNullable<ReturnType<typeof parseCombo>>, NonNullable<ReturnType<typeof parseCombo>>, NonNullable<ReturnType<typeof parseCombo>>];
	assert.deepEqual(addCombos([a], [b, c, c]), [a, c]);
});
