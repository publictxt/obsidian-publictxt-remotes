import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCheckReport, renderLinkReport } from '../src/fork/link-report.ts';

test('renderLinkReport: by note then line, the link as code, why', () => {
	const section = renderLinkReport([
		{ path: 'z.md', link: '[[z]]', left: [{ line: 0, original: '[[dup]]', why: 'unconvertible' }], check: [] },
		{ path: 'a.md', link: '[[a]]', left: [
			{ line: 2, original: '![p](../img/p.png)', why: 'not-note' },
			{ line: 9, original: '[x](../../out.md)', why: 'unconvertible' },
		], check: [] },
		{ path: 'b.md', link: '[[b]]', left: [], check: [] },
	]);
	assert.equal(section, [
		'## Links to fix',
		'',
		'Links in forks of this source that converting left as they were. Rewritten each time links are converted.',
		'',
		'- [[a]] line 3: `![p](../img/p.png)` not a note',
		'- [[a]] line 10: `[x](../../out.md)` cannot be converted',
		'- [[z]] line 1: `[[dup]]` cannot be converted',
	].join('\n'));
});

test('renderLinkReport: nothing left, no section; backticks in a link fenced', () => {
	assert.equal(renderLinkReport([{ path: 'a.md', link: '[[a]]', left: [], check: [] }]), null);
	assert.equal(renderLinkReport([]), null);
	const s = renderLinkReport([{ path: 'a.md', link: '[[a]]', left: [{ line: 0, original: '[`x`](y.md)', why: 'unconvertible' }], check: [] }]);
	assert.ok(s?.endsWith('- [[a]] line 1: ``[`x`](y.md)`` cannot be converted'));
});

test('renderCheckReport: the calls made, by note then line, the link as it is now', () => {
	const notes = [
		{ path: 'z.md', link: '[[z]]', left: [], check: [{ line: 4, link: '[[x]]', why: 'kept' as const }] },
		{ path: 'a.md', link: '[[a]]', left: [{ line: 0, original: '![p](p.png)', why: 'not-note' as const }], check: [{ line: 1, link: '[[dup]]', why: 'several' as const }] },
	];
	assert.equal(renderCheckReport(notes), [
		'## Links to check',
		'',
		'Links in forks of this source that converting made a call on: they may not go where upstream meant. Rewritten each time links are converted.',
		'',
		'- [[a]] line 2: `[[dup]]` several by name',
		'- [[z]] line 5: `[[x]]` kept on your copy',
	].join('\n'));
	assert.equal(renderCheckReport([{ ...notes[1]!, check: [] }]), null);
});
