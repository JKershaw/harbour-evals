import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { bigramSimilarity, ensureInside, findFixtureFile, normalizeText, slugify } from '../src/utils.js';

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

// bigramSimilarity

test('bigramSimilarity returns 1 for identical strings', () => {
  assert.equal(bigramSimilarity('hello', 'hello'), 1);
});

test('bigramSimilarity returns 0 for completely different strings', () => {
  assert.equal(bigramSimilarity('xyz', 'abc'), 0);
});

test('bigramSimilarity returns high score for close strings', () => {
  const score = bigramSimilarity('async_handler', 'async_handler_patterns');
  assert.ok(score >= 0.7, `expected >= 0.7, got ${score}`);
});

test('bigramSimilarity returns low score for unrelated strings', () => {
  const score = bigramSimilarity('quantum_blockchain', 'async_handler_patterns');
  assert.ok(score < 0.3, `expected < 0.3, got ${score}`);
});

test('bigramSimilarity is symmetric', () => {
  const ab = bigramSimilarity('prisma_relation', 'prisma_relation_mode');
  const ba = bigramSimilarity('prisma_relation_mode', 'prisma_relation');
  assert.equal(ab, ba);
});

test('bigramSimilarity handles strings shorter than 2 characters', () => {
  assert.equal(bigramSimilarity('a', 'a'), 1);
  assert.equal(bigramSimilarity('a', 'b'), 0);
  assert.equal(bigramSimilarity('', ''), 1);
  assert.equal(bigramSimilarity('a', ''), 0);
});

// findFixtureFile

test('findFixtureFile returns exact match path when fixture exists', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harbour-util-test-'));
  try {
    await fs.writeFile(path.join(tmpDir, 'my_slug.json'), '{}');
    const result = await findFixtureFile([tmpDir], 'my_slug', '.json');
    assert.equal(result, path.join(tmpDir, 'my_slug.json'));
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

test('findFixtureFile returns null when no match and no fuzzy candidate', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harbour-util-test-'));
  try {
    await fs.writeFile(path.join(tmpDir, 'totally_unrelated.json'), '{}');
    const result = await findFixtureFile([tmpDir], 'quantum_blockchain_nft', '.json');
    assert.equal(result, null);
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

test('findFixtureFile returns fuzzy match when no exact match exists', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harbour-util-test-'));
  try {
    await fs.writeFile(path.join(tmpDir, 'async_handler_patterns.json'), '{}');
    // "async_handlers" is close to "async_handler_patterns"
    const result = await findFixtureFile([tmpDir], 'async_handlers', '.json');
    assert.equal(result, path.join(tmpDir, 'async_handler_patterns.json'));
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
});

test('findFixtureFile prefers earlier directory when both contain a match', async () => {
  const dir1 = await fs.mkdtemp(path.join(os.tmpdir(), 'harbour-util-test-'));
  const dir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'harbour-util-test-'));
  try {
    await fs.writeFile(path.join(dir1, 'my_slug.json'), '"from-dir1"');
    await fs.writeFile(path.join(dir2, 'my_slug.json'), '"from-dir2"');
    const result = await findFixtureFile([dir1, dir2], 'my_slug', '.json');
    assert.equal(result, path.join(dir1, 'my_slug.json'));
  } finally {
    await fs.rm(dir1, { recursive: true });
    await fs.rm(dir2, { recursive: true });
  }
});
