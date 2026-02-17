/**
 * TestCase Atoms
 *
 * State management for test case generator mode.
 * Mirrors the session atom patterns (atomFamily + metaMap + ordered IDs)
 * for performance isolation and lazy loading.
 *
 * TestCase is a first-class entity — not derived from session messages.
 * Each test generation session produces multiple test cases stored here.
 */

import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';

import type { TestCase, TestCaseMeta } from '../../shared/types';
import { extractTestCaseMeta } from '../../shared/types';

// ---------------------------------------------------------------------------
// Core atoms
// ---------------------------------------------------------------------------

/** Per-testcase isolated atom. Holds full report data, lazily loaded. */
export const testCaseAtomFamily = atomFamily((_testCaseId: string) =>
  atom<TestCase | null>(null),
);

/** Lightweight metadata map for grid/card display. Keyed by testCaseId. */
export const testCaseMetaMapAtom = atom<Map<string, TestCaseMeta>>(new Map());

/**
 * Ordered test case IDs grouped by generationSessionId.
 * Each entry is sorted by createdAt descending (LIFO — newest first).
 */
export const testCaseIdsBySessionAtom = atom<Map<string, string[]>>(new Map());

/** All test case IDs across all sessions, sorted LIFO. */
export const allTestCaseIdsAtom = atom<string[]>([]);

/** Currently selected test case ID (for report view). */
export const activeTestCaseIdAtom = atom<string | null>(null);

/** Set of test case IDs whose full data has been loaded. */
export const loadedTestCasesAtom = atom<Set<string>>(new Set<string>());

// ---------------------------------------------------------------------------
// Deduplication cache (module-level, not atom — same pattern as sessions)
// ---------------------------------------------------------------------------

const testCaseLoadingPromises = new Map<string, Promise<void>>();

// ---------------------------------------------------------------------------
// Action atoms
// ---------------------------------------------------------------------------

/**
 * Initialize test cases from a bulk load (e.g. app startup or session switch).
 * Builds metaMap, per-session ID lists, and all-IDs list.
 */
export const initializeTestCasesAtom = atom(
  null,
  (get, set, testCases: TestCase[]) => {
    const metaMap = new Map<string, TestCaseMeta>();
    const bySession = new Map<string, string[]>();

    // Sort LIFO globally
    const sorted = [...testCases].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    for (const tc of sorted) {
      // Populate atomFamily
      set(testCaseAtomFamily(tc.id), tc);

      // Build meta map
      metaMap.set(tc.id, extractTestCaseMeta(tc));

      // Group by session
      const sessionIds = bySession.get(tc.generationSessionId) ?? [];
      sessionIds.push(tc.id);
      bySession.set(tc.generationSessionId, sessionIds);
    }

    set(testCaseMetaMapAtom, metaMap);
    set(testCaseIdsBySessionAtom, bySession);
    set(
      allTestCaseIdsAtom,
      sorted.map((tc) => tc.id),
    );

    // Mark all as loaded
    set(loadedTestCasesAtom, new Set(sorted.map((tc) => tc.id)));
  },
);

/**
 * Add a single new test case (e.g. from streaming generation).
 * Prepends to ID lists (LIFO) and updates metaMap.
 * Persists to disk via IPC.
 */
export const addTestCaseAtom = atom(
  null,
  (get, set, testCase: TestCase) => {
    // Set full data
    set(testCaseAtomFamily(testCase.id), testCase);

    // Update meta map
    const metaMap = new Map(get(testCaseMetaMapAtom));
    metaMap.set(testCase.id, extractTestCaseMeta(testCase));
    set(testCaseMetaMapAtom, metaMap);

    // Prepend to per-session list (LIFO)
    const bySession = new Map(get(testCaseIdsBySessionAtom));
    const sessionIds = bySession.get(testCase.generationSessionId) ?? [];
    bySession.set(testCase.generationSessionId, [
      testCase.id,
      ...sessionIds,
    ]);
    set(testCaseIdsBySessionAtom, bySession);

    // Prepend to global list
    const allIds = get(allTestCaseIdsAtom);
    set(allTestCaseIdsAtom, [testCase.id, ...allIds]);

    // Mark loaded
    const loaded = new Set(get(loadedTestCasesAtom));
    loaded.add(testCase.id);
    set(loadedTestCasesAtom, loaded);

    // Persist to disk
    window.electronAPI.saveTestCase(testCase).catch((err) => {
      console.error('[testcases] Failed to persist test case:', err);
    });
  },
);

/**
 * Update an existing test case (e.g. results filled in).
 * Syncs both the full atom and the meta map.
 * Persists to disk via IPC.
 */
export const updateTestCaseAtom = atom(
  null,
  (
    get,
    set,
    testCaseId: string,
    updater: (prev: TestCase) => TestCase,
  ) => {
    const current = get(testCaseAtomFamily(testCaseId));
    if (!current) return;

    const updated = updater(current);
    set(testCaseAtomFamily(testCaseId), updated);

    // Sync meta
    const metaMap = new Map(get(testCaseMetaMapAtom));
    metaMap.set(testCaseId, extractTestCaseMeta(updated));
    set(testCaseMetaMapAtom, metaMap);

    // Persist to disk
    window.electronAPI.saveTestCase(updated).catch((err) => {
      console.error('[testcases] Failed to persist updated test case:', err);
    });
  },
);

/**
 * Update only the meta for a test case (lightweight, no full data needed).
 */
export const updateTestCaseMetaAtom = atom(
  null,
  (get, set, testCaseId: string, partial: Partial<TestCaseMeta>) => {
    const metaMap = new Map(get(testCaseMetaMapAtom));
    const existing = metaMap.get(testCaseId);
    if (!existing) return;

    metaMap.set(testCaseId, { ...existing, ...partial });
    set(testCaseMetaMapAtom, metaMap);
  },
);

/**
 * Remove a test case from all state.
 * Deletes from disk via IPC.
 */
export const removeTestCaseAtom = atom(
  null,
  (get, set, testCaseId: string) => {
    const meta = get(testCaseMetaMapAtom).get(testCaseId);

    // Clear full data
    set(testCaseAtomFamily(testCaseId), null);

    // Remove from meta map
    const metaMap = new Map(get(testCaseMetaMapAtom));
    metaMap.delete(testCaseId);
    set(testCaseMetaMapAtom, metaMap);

    // Remove from per-session list
    if (meta) {
      const bySession = new Map(get(testCaseIdsBySessionAtom));
      const sessionIds = bySession.get(meta.generationSessionId);
      if (sessionIds) {
        const filtered = sessionIds.filter((id) => id !== testCaseId);
        if (filtered.length === 0) {
          bySession.delete(meta.generationSessionId);
        } else {
          bySession.set(meta.generationSessionId, filtered);
        }
        set(testCaseIdsBySessionAtom, bySession);
      }
    }

    // Remove from global list
    const allIds = get(allTestCaseIdsAtom);
    set(
      allTestCaseIdsAtom,
      allIds.filter((id) => id !== testCaseId),
    );

    // Remove from loaded set
    const loaded = new Set(get(loadedTestCasesAtom));
    loaded.delete(testCaseId);
    set(loadedTestCasesAtom, loaded);

    // Delete from disk
    window.electronAPI.deleteTestCase(testCaseId).catch((err) => {
      console.error('[testcases] Failed to delete test case from disk:', err);
    });
  },
);

/**
 * Lazy-load a test case's full data with promise deduplication.
 * Mirrors ensureSessionMessagesLoadedAtom pattern.
 */
export const ensureTestCaseLoadedAtom = atom(
  null,
  async (get, set, testCaseId: string) => {
    // Already loaded?
    if (get(loadedTestCasesAtom).has(testCaseId)) return;

    // Dedup in-flight requests
    const existing = testCaseLoadingPromises.get(testCaseId);
    if (existing) {
      await existing;
      return;
    }

    const promise = (async () => {
      try {
        const testCase = await window.electronAPI.getTestCase(testCaseId);
        if (testCase) {
          set(testCaseAtomFamily(testCaseId), testCase);
          const loaded = new Set(get(loadedTestCasesAtom));
          loaded.add(testCaseId);
          set(loadedTestCasesAtom, loaded);
        }
      } finally {
        testCaseLoadingPromises.delete(testCaseId);
      }
    })();

    testCaseLoadingPromises.set(testCaseId, promise);
    await promise;
  },
);

// ---------------------------------------------------------------------------
// Derived / selector atoms
// ---------------------------------------------------------------------------

/**
 * Load all test cases from disk on app startup.
 * Populates atomFamily, metaMap, and ID lists via initializeTestCasesAtom.
 */
export const loadAllTestCasesAtom = atom(null, async (_get, set) => {
  try {
    const testCases = await window.electronAPI.listTestCases();
    if (testCases.length > 0) {
      set(initializeTestCasesAtom, testCases);
    }
  } catch (err) {
    console.error('[testcases] Failed to load test cases from disk:', err);
  }
});

/**
 * Get test case IDs for a specific generation session, ordered LIFO.
 */
export const testCaseIdsForSessionAtomFamily = atomFamily(
  (sessionId: string) =>
    atom<string[]>((get) => {
      const bySession = get(testCaseIdsBySessionAtom);
      return bySession.get(sessionId) ?? [];
    }),
);

/**
 * Get test case count for a specific generation session.
 */
export const testCaseCountForSessionAtomFamily = atomFamily(
  (sessionId: string) =>
    atom<number>((get) => {
      const ids = get(testCaseIdsForSessionAtomFamily(sessionId));
      return ids.length;
    }),
);
