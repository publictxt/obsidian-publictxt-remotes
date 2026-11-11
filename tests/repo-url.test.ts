import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalRepoUrl, defaultRemoteName, fileUrl, isLocalRepo, localKey, localName, localPathInput, remoteNameProblem, sourceKey } from '../src/sources/repo-url.ts';

test('canonical form: host lower-cased, .git and trailing slash dropped, case kept', () => {
	for (const input of [
		'https://github.com/Owner/Repo',
		'https://GitHub.com/Owner/Repo.git',
		'https://github.com/Owner/Repo/',
		'https://github.com/Owner/Repo?tab=x#y',
		'  git@github.com:Owner/Repo.git ',
	]) {
		assert.equal(canonicalRepoUrl(input), 'https://github.com/Owner/Repo', input);
	}
});

test('not a repo URL', () => {
	for (const input of [
		'',
		'github.com/a/b',
		'ftp://github.com/a/b',
		'https://github.com/a',
		'https://github.com/a/b/tree/main',
		'https://user:pw@github.com/a/b',
		'file:///home/me/notes',
		'/home/me/notes',
		'notes',
		'./notes',
		'~/notes',
	]) {
		assert.equal(canonicalRepoUrl(input), null, input);
	}
});

test('remote names: file names without the characters a vault link or path breaks on', () => {
	for (const ok of ['a-b', 'My Vault', 'notes.v2', 'ünïcode']) assert.equal(remoteNameProblem(ok), null, ok);
	for (const bad of ['', ' a', 'a ', '.hidden', 'a/b', 'a\\b', 'a:b', 'a#b', 'a[b]', 'a|b']) assert.ok(remoteNameProblem(bad), bad);
});

test('local keys', () => {
	assert.equal(localKey('My Vault'), 'local:My Vault');
	assert.ok(isLocalRepo('local:x'));
	assert.ok(!isLocalRepo('https://github.com/a/b'));
	assert.equal(localName('local:My Vault'), 'My Vault');
	assert.equal(sourceKey('local:My Vault'), 'local:My Vault');
	assert.equal(sourceKey('local:a/b'), null);
	assert.equal(sourceKey('https://GITHUB.com/a/b.git'), 'https://github.com/a/b');
});

test('localPathInput: a typed folder or file URL, as an absolute path', () => {
	for (const input of ['/home/me/my notes', ' /home/me/my notes// ', 'file:///home/me/my%20notes/', 'file://localhost/home/me/my%20notes']) {
		assert.equal(localPathInput(input), '/home/me/my notes', input);
	}
	assert.equal(localPathInput('C:\\Users\\me\\notes'), 'C:/Users/me/notes');
	assert.equal(localPathInput('file:///C:/Users/me/notes'), 'C:/Users/me/notes');
	for (const bad of ['', 'notes', './notes', '~/notes', '/', 'C:\\', 'file://server/x', 'https://github.com/a/b']) {
		assert.equal(localPathInput(bad), null, bad);
	}
});

test('fileUrl round-trips through localPathInput, special characters escaped', () => {
	for (const p of ['/home/me/my notes', '/a/50%#1?', 'C:/Users/me/notes']) assert.equal(localPathInput(fileUrl(p)), p, p);
	assert.equal(fileUrl('/a/b c'), 'file:///a/b%20c');
	assert.equal(fileUrl('C:/x'), 'file:///C:/x');
});

test('defaultRemoteName: owner-repo, or the folder name', () => {
	assert.equal(defaultRemoteName('git@github.com:Ann/notes.git'), 'Ann-notes');
	assert.equal(defaultRemoteName('/home/me/My Vault/'), 'My Vault');
	assert.equal(defaultRemoteName('/srv/notes.git'), 'notes');
	assert.equal(defaultRemoteName('/srv/a#b'), 'a-b');
	assert.equal(defaultRemoteName('nope'), '');
});
