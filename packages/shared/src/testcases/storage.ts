/**
 * Test case persistence — flat global list stored in a single JSON file.
 *
 * File location: CONFIG_DIR/testcases.json
 * No workspace or session grouping — all test cases in one array.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { CONFIG_DIR } from '../config/paths';

// ---------------------------------------------------------------------------
// Types (duplicated here to avoid circular deps with electron shared/types)
// ---------------------------------------------------------------------------

export interface StoredTestCase {
  id: string;
  workspaceId: string;
  generationSessionId: string;
  name: string;
  
  /** The original attack vector question that generated this test case */
  attackVector?: string;
  
  // Target (simplified)
  targetComponent?: string;
  
  // Report fields
  description?: string;
  preconditions?: string;
  guidance?: string;
  expectedBehavior?: string;
  actualResult?: string;
  
  // References (generic list)
  reference?: { id: string; name: string; url?: string }[];
  
  // Traceability
  sourceMessageId?: string;
  sourceTurnId?: string;
  
  // Timestamps
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Path
// ---------------------------------------------------------------------------

const TESTCASES_FILE = join(CONFIG_DIR, 'testcases.json');

function ensureFile(): void {
  const dir = dirname(TESTCASES_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (!existsSync(TESTCASES_FILE)) {
    writeFileSync(TESTCASES_FILE, '[]', 'utf-8');
  }
}

// ---------------------------------------------------------------------------
// Read / Write helpers
// ---------------------------------------------------------------------------

function readAll(): StoredTestCase[] {
  ensureFile();
  try {
    const raw = readFileSync(TESTCASES_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeAll(testCases: StoredTestCase[]): void {
  ensureFile();
  writeFileSync(TESTCASES_FILE, JSON.stringify(testCases, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// CRUD API
// ---------------------------------------------------------------------------

/** Return all test cases (newest first). */
export function listTestCases(): StoredTestCase[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

/** Return a single test case by ID, or null. */
export function getTestCase(id: string): StoredTestCase | null {
  return readAll().find((tc) => tc.id === id) ?? null;
}

/** Save (insert or update) a test case. */
export function saveTestCase(testCase: StoredTestCase): void {
  const all = readAll();
  const idx = all.findIndex((tc) => tc.id === testCase.id);
  if (idx >= 0) {
    all[idx] = testCase;
  } else {
    all.push(testCase);
  }
  writeAll(all);
}

/** Save multiple test cases at once (batch insert/update). */
export function saveTestCases(testCases: StoredTestCase[]): void {
  const all = readAll();
  for (const tc of testCases) {
    const idx = all.findIndex((existing) => existing.id === tc.id);
    if (idx >= 0) {
      all[idx] = tc;
    } else {
      all.push(tc);
    }
  }
  writeAll(all);
}

/** Delete a test case by ID. Returns true if found and deleted. */
export function deleteTestCase(id: string): boolean {
  const all = readAll();
  const filtered = all.filter((tc) => tc.id !== id);
  if (filtered.length === all.length) return false;
  writeAll(filtered);
  return true;
}

/** Delete all test cases. */
export function deleteAllTestCases(): void {
  writeAll([]);
}
