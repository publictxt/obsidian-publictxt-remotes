import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalRepoUrl, isLocalRepo, localRepoName } from '../src/sources/repo-url.ts';

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
		'file://server/share/notes',
		'file:///',
		'/',
		'notes',
		'./notes',
		'~/notes',
	]) {
		assert.equal(canonicalRepoUrl(input), null, input);
	}
});

test('local repo: a file URL or an absolute path', () => {
	for (const input of [
		'file:///home/me/my%20notes',
		'file:///home/me/my notes/',
		'file://localhost/home/me/my%20notes?x#y',
		'/home/me/my notes',
		' /home/me/my notes// ',
	]) {
		assert.equal(canonicalRepoUrl(input), 'file:///home/me/my%20notes', input);
	}
	assert.equal(canonicalRepoUrl('file:///srv/notes.git'), 'file:///srv/notes.git');
	assert.equal(canonicalRepoUrl('C:\\Users\\me\\notes'), 'file:///C:/Users/me/notes');
	assert.equal(canonicalRepoUrl('/a/50%#1?'), 'file:///a/50%25%231%3F');
});

test('canonical URLs are fixed points', () => {
	for (const url of ['https://github.com/Owner/Repo', 'file:///home/me/my%20notes', 'file:///a/50%25%231%3F', 'file:///C:/Users/me/notes']) {
		assert.equal(canonicalRepoUrl(url), url);
	}
});

test('isLocalRepo, localRepoName', () => {
	assert.ok(isLocalRepo('file:///home/me/notes'));
	assert.ok(!isLocalRepo('https://github.com/a/b'));
	assert.equal(localRepoName('file:///home/me/my%20notes.git'), 'my notes');
	assert.equal(localRepoName('file:///home/me/100%25'), '100%');
	assert.equal(localRepoName('file:///home/me/bad%zz'), 'bad%zz');
});
