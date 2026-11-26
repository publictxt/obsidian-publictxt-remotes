import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTags, tagMatch } from '../src/tags/tags.ts';

/** Enough YAML for these tests: `tags: [a, "b"]` or `tags: a`. */
function yaml(s: string): unknown {
	if (s.includes('!bad')) throw new Error('bad');
	const m = /^tags:\s*(.*?)\s*$/m.exec(s);
	if (!m) return s.trim().startsWith('-') ? ['x'] : {};
	const v = m[1] ?? '';
	if (!v.startsWith('[')) return { tags: /^\d+$/.test(v) ? Number(v) : v.replace(/^"|"$/g, '') };
	return { tags: v.slice(1, -1).split(',').map((t) => t.trim().replace(/^"|"$/g, '')) };
}
const tags = (text: string) => readTags(text, yaml);

test('the spec\'s fixture 002-tags', () => {
	const text = `---
tags: [PublicTxt, "#Obsidian"]
---
# Tag edge cases

Inline #dotnet and #DotNet (duplicate by match) and #publictxt (duplicate of front matter).
Nested #lang/csharp works. Unicode #café works. Underscores #snake_case work.
Numeric #2026 is not a tag. Neither is a#b mid-word.

## Not a tag

A URL fragment https://example.com/page#section is not a tag.

\`#inline-code\` is ignored.

\`\`\`
#fenced is ignored
\`\`\`

Trailing punctuation is dropped: #end.
`;
	assert.deepEqual(tags(text), ['PublicTxt', 'Obsidian', 'dotnet', 'lang/csharp', 'café', 'snake_case', 'end']);
	assert.deepEqual(tags(text.replace(/\n/g, '\r\n')), tags(text));
	assert.deepEqual(tags(`\uFEFF${text}`), tags(text));
});

test('front matter: a list or one string; invalid or not a mapping, none, and inline tags still count', () => {
	assert.deepEqual(tags('---\ntags: "#one"\n---\n'), ['one']);
	assert.deepEqual(tags('---\ntags: 2026\n---\n#x'), ['x']);
	assert.deepEqual(tags('---\n!bad\n---\n#x'), ['x']);
	assert.deepEqual(tags('---\n- a\n---\n#x'), ['x']);
	assert.deepEqual(tags('---\n---\n#x'), ['x']);
	assert.deepEqual(tags('---\ntags: a\n---'), ['a']);
	// Not on the first line, or never closed: not front matter.
	assert.deepEqual(tags('\n---\ntags: a\n---\n#x'), ['x']);
	assert.deepEqual(tags('---\ntags: a\n#x'), ['x']);
	// A comment in front matter is no tag.
	assert.deepEqual(tags('---\n#comment\ntags: a\n---\n'), ['a']);
});

test('inline: where a tag starts and ends', () => {
	assert.deepEqual(tags('#a #b\t#c\n#d'), ['a', 'b', 'c', 'd']);
	assert.deepEqual(tags('(#a) [x](#b) [[#c]] ##d # e #f#g &#39; #h:i'), ['f', 'h']);
	assert.deepEqual(tags('#1a #a1 #1 #1-2'), ['1a', 'a1', '1-2']);
	assert.deepEqual(tags('#हिन्दी #日本語'), ['हिन्दी', '日本語']);
	assert.deepEqual(tags('- #item\n> #quote'), ['item', 'quote']);
});

test('code: fences and inline', () => {
	assert.deepEqual(tags('~~~\n#a\n```\n#b\n~~~\n#c'), ['c']);
	assert.deepEqual(tags('````\n#a\n```\n#b\n````\n#c'), ['c']);
	assert.deepEqual(tags('- ```sh\n  #a\n  ```\n- #b'), ['b']);
	assert.deepEqual(tags('> ```\n> #a\n> ```\n> #b'), ['b']);
	// Never closed: to the end.
	assert.deepEqual(tags('#a\n```\n#b\n\n#c'), ['a']);
	// Not a fence: inline code of three backticks on a line.
	assert.deepEqual(tags('```x``` #a\n#b'), ['a', 'b']);
	assert.deepEqual(tags('`` ` #a `` #b ` #c'), ['b', 'c']);
	assert.deepEqual(tags('`code\n#a` #b'), ['b']);
	// A backtick left open ends with its paragraph.
	assert.deepEqual(tags('it`s #a\n\nit`s #b'), ['a', 'b']);
	assert.deepEqual(tags('`x`#a'), []);
});

test('one tag however it is composed: the first as written stays', () => {
	assert.deepEqual(tags('#Cafe\u0301 #café'), ['Cafe\u0301']);
	assert.equal(tagMatch('Cafe\u0301'), 'café');
});

test('a long page of stray backticks is read in no time', () => {
	const start = performance.now();
	tags(`${'` '.repeat(1)}${'a`` b ``` '.repeat(20_000)}#x`);
	assert.ok(performance.now() - start < 2000);
});
