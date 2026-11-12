import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORK_LIST_HEADING, renderForkList, withSection, withSections } from '../src/fork/fork-list.ts';

const withForkList = (text: string, section: string | null) => withSection(text, FORK_LIST_HEADING, section);

test('renderForkList: none is null; links sorted and deduped under the heading', () => {
	assert.equal(renderForkList([]), null);
	assert.equal(renderForkList(['[z](../z.md)', '[[x]]', '[a](../a.md)', '[[x]]']), '## Forked pages\n\n- [[x]]\n- [a](../a.md)\n- [z](../z.md)');
});

const S = '## Forked pages\n\n- x';
const S2 = '## Forked pages\n\n- y';

test('withForkList: added at the end after a blank line; nothing to add leaves text alone', () => {
	assert.equal(withForkList('---\nurl: u\n---\nWhy I follow.\n\n', S), `---\nurl: u\n---\nWhy I follow.\n\n${S}\n`);
	assert.equal(withForkList('', S), `${S}\n`);
	assert.equal(withForkList('Prose.\n', null), 'Prose.\n');
});

test('withForkList: replaced up to the next # or ## heading; text around it kept', () => {
	assert.equal(withForkList(`Before.\n\n${S}\n\n## After\n\nMore.\n`, S2), `Before.\n\n${S2}\n\n## After\n\nMore.\n`);
	// A ### heading is inside the section, so it goes with it.
	assert.equal(withForkList(`Before.\n\n${S}\n\n### Mine\n\ntext\n`, S2), `Before.\n\n${S2}\n`);
	assert.equal(withForkList(`Before.\n\n${S}\n\n# Top\n`, S2), `Before.\n\n${S2}\n\n# Top\n`);
});

test('withForkList: stable: applying the same section again changes nothing', () => {
	for (const t of [`Before.\n\n${S}\n`, `Before.\n\n${S}\n\n## After\n`, `${S}\n`]) {
		assert.equal(withForkList(t, S), t);
	}
});

test('withForkList: removed with its surrounding blank lines', () => {
	assert.equal(withForkList(`Before.\n\n${S}\n`, null), 'Before.\n');
	assert.equal(withForkList(`Before.\n\n${S}\n\n## After\n`, null), 'Before.\n\n## After\n');
	assert.equal(withForkList(`${S}\n`, null), '');
});

test('withForkList: heading matched as a whole line; trailing spaces allowed', () => {
	assert.equal(withForkList('### Forked pages\n', S), `### Forked pages\n\n${S}\n`);
	assert.equal(withForkList('## Forked pages  \n- old\n', S), `${S}\n`);
});

test('withForkList: the heading twice leaves the note alone', () => {
	assert.equal(withForkList(`${S}\n\n${S}\n`, S2), null);
});

test('withSections: each in place in one pass; a heading twice is skipped, the rest still put', () => {
	const fix = '## Links to fix\n\n- a';
	assert.deepEqual(withSections('Prose.\n', [[FORK_LIST_HEADING, S], ['## Links to fix', fix]]), { text: `Prose.\n\n${S}\n\n${fix}\n`, skipped: [] });
	assert.deepEqual(withSections(`${S}\n\n${S}\n`, [[FORK_LIST_HEADING, S2], ['## Links to fix', fix]]), { text: `${S}\n\n${S}\n\n${fix}\n`, skipped: [FORK_LIST_HEADING] });
});
