import path from 'node:path';
import fs from 'node:fs/promises';

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function ensureInside(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  if (!resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`) && resolvedCandidate !== resolvedRoot) {
    throw new Error(`Path escapes fixture root: ${candidate}`);
  }
  return resolvedCandidate;
}

export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Sørensen–Dice coefficient using character bigrams.
 * Returns a similarity score in [0, 1] — higher means more similar.
 */
export function bigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  if (a.length === 1 && b.length === 1) return a === b ? 1 : 0;
  if (a.length === 1 || b.length === 1) return 0;

  const bigrams = (s: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bigram = s.slice(i, i + 2);
      map.set(bigram, (map.get(bigram) ?? 0) + 1);
    }
    return map;
  };

  const aBigrams = bigrams(a);
  const bBigrams = bigrams(b);

  let intersection = 0;
  for (const [bigram, count] of aBigrams) {
    intersection += Math.min(count, bBigrams.get(bigram) ?? 0);
  }

  const aSize = a.length - 1;
  const bSize = b.length - 1;

  return (2 * intersection) / (aSize + bSize);
}

/** Minimum bigram similarity score required to use a fuzzy-matched fixture. */
export const FUZZY_THRESHOLD = 0.4;

/**
 * Locate a fixture file by exact slug match first, then fuzzy (bigram) match.
 * Searches `dirs` in order so earlier entries (task-local) take priority over later ones (global).
 * Returns the absolute path to the best matching file, or null if none meets the threshold.
 */
export async function findFixtureFile(dirs: string[], slug: string, ext: string): Promise<string | null> {
  // Exact match first, in priority order
  for (const dir of dirs) {
    const filePath = path.join(dir, `${slug}${ext}`);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // not found in this dir, continue
    }
  }

  // Fuzzy match across all dirs (preserving priority order for ties)
  let bestPath: string | null = null;
  let bestScore = 0;

  for (const dir of dirs) {
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(ext)) continue;
      const candidateSlug = file.slice(0, -ext.length);
      const score = bigramSimilarity(slug, candidateSlug);
      if (score > bestScore && score >= FUZZY_THRESHOLD) {
        bestScore = score;
        bestPath = path.join(dir, file);
      }
    }
  }

  return bestPath;
}
