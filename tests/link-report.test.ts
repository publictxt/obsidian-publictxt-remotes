import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderLinkReport } from '../src/fork/link-report.ts';

test('renderLinkReport: by note then line, the link as code, why', () => {
	const section = renderLinkReport([
		{ path: 'z.md', link: '[[z]]', left: [{ line: 0, original: '[[dup]]', why: 'unclear' }] },
		{ path: 'a.md', link: '[[a]]', left: [
			{ line: 2, original: '![p](../img/p.png)', why: 'not-note' },
			{ line: 9, original: '[x](../../out.md)', why: 'missing' },
		] },
		{ path: 'b.md', link: '[[b]]', left: [] },
	]);
	assert.equal(section, [
		'## Links to fix',
		'',
		'Links in forks of this source that converting left as they were. Rewritten each time links are converted.',
		'',
		'- [[a]] line 3: `![p](../img/p.png)` not a note',
		'- [[a]] line 10: `[x](../../out.md)` not in the source',
		'- [[z]] line 1: `[[dup]]` unclear',
	].join('\n'));
});

test('renderLinkReport: nothing left, no section; backticks in a link fenced', () => {
	assert.equal(renderLinkReport([{ path: 'a.md', link: '[[a]]', left: [] }]), null);
	assert.equal(renderLinkReport([]), null);
	const s = renderLinkReport([{ path: 'a.md', link: '[[a]]', left: [{ line: 0, original: '[`x`](y.md)', why: 'missing' }] }]);
	assert.ok(s?.endsWith('- [[a]] line 1: ``[`x`](y.md)`` not in the source'));
});
