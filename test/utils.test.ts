import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureInside, normalizeText, slugify } from '../src/utils.js';

test('slugify converts spaces and special chars to underscores', () => {
  assert.equal(slugify('Hello World'), 'hello_world');
  assert.equal(slugify('Prisma Relation Mode'), 'prisma_relation_mode');
  assert.equal(slugify('  leading and trailing  '), 'leading_and_trailing');
  assert.equal(slugify('multiple---hyphens'), 'multiple_hyphens');
});

test('slugify strips leading and trailing underscores', () => {
  assert.equal(slugify('___foo___'), 'foo');
  assert.equal(slugify('!hello!'), 'hello');
});

test('slugify handles empty string', () => {
  assert.equal(slugify(''), '');
});

test('normalizeText lowercases and collapses whitespace', () => {
  assert.equal(normalizeText('Hello  World'), 'hello world');
  assert.equal(normalizeText('  TRIM  '), 'trim');
  assert.equal(normalizeText('multiple\t\nspaces'), 'multiple spaces');
});

test('ensureInside returns resolved path for valid child', () => {
  const root = '/tmp/fixture';
  const resolved = ensureInside(root, `${root}/src/file.ts`);
  assert.equal(resolved, `${root}/src/file.ts`);
});

test('ensureInside returns path equal to root itself', () => {
  const root = '/tmp/fixture';
  const resolved = ensureInside(root, root);
  assert.equal(resolved, root);
});

test('ensureInside throws for path traversal outside root', () => {
  const root = '/tmp/fixture';
  assert.throws(
    () => ensureInside(root, '/tmp/other'),
    /Path escapes fixture root/
  );
});

test('ensureInside throws for dotdot traversal', () => {
  const root = '/tmp/fixture';
  assert.throws(
    () => ensureInside(root, '/tmp/fixture/../etc/passwd'),
    /Path escapes fixture root/
  );
});
