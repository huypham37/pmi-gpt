import React, { memo, useCallback, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { TestCaseMeta } from '../../../shared/types';
import {
  testCaseMetaMapAtom,
  removeTestCaseAtom,
} from '@/atoms/testcases';
import { TestCaseCard } from './TestCaseCard';

interface TestCaseGridProps {
  /** LIFO-ordered test case IDs to display */
  testCaseIds: string[];
  /** Currently selected test case ID */
  selectedTestCaseId?: string;
  /** Called when a test case card is clicked */
  onSelectTestCase?: (testCaseId: string) => void;
  /** Called when the expand/report button is clicked on a card */
  onExpandTestCase?: (testCaseId: string) => void;
}

export const TestCaseGrid = memo(function TestCaseGrid({
  testCaseIds,
  selectedTestCaseId,
  onSelectTestCase,
  onExpandTestCase,
}: TestCaseGridProps) {
  const metaMap = useAtomValue(testCaseMetaMapAtom);
  const removeTestCase = useSetAtom(removeTestCaseAtom);

  // Resolve metas from IDs (already LIFO ordered)
  const testCases = useMemo(() => {
    const result: TestCaseMeta[] = [];
    for (const id of testCaseIds) {
      const meta = metaMap.get(id);
      if (meta) {
        result.push(meta);
      }
    }
    return result;
  }, [testCaseIds, metaMap]);

  const handleSelect = useCallback(
    (testCaseId: string) => {
      onSelectTestCase?.(testCaseId);
    },
    [onSelectTestCase]
  );

  const handleExpand = useCallback(
    (testCaseId: string) => {
      onExpandTestCase?.(testCaseId);
    },
    [onExpandTestCase]
  );

  const handleDelete = useCallback(
    (testCaseId: string) => {
      removeTestCase(testCaseId);
    },
    [removeTestCase]
  );

  if (testCases.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-medium text-muted-foreground px-1">
        Generated Test Cases ({testCases.length})
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {testCases.map((testCase) => (
          <TestCaseCard
            key={testCase.id}
            testCase={testCase}
            isSelected={testCase.id === selectedTestCaseId}
            onClick={() => handleSelect(testCase.id)}
            onExpand={() => handleExpand(testCase.id)}
            onDelete={() => handleDelete(testCase.id)}
          />
        ))}
      </div>
    </div>
  );
});
