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
  /** Called when a test case card is expanded (whole card click) */
  onExpandTestCase?: (testCaseId: string) => void;
}

export const TestCaseGrid = memo(function TestCaseGrid({
  testCaseIds,
  selectedTestCaseId,
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
            onExpand={() => handleExpand(testCase.id)}
            onDelete={() => handleDelete(testCase.id)}
          />
        ))}
      </div>
    </div>
  );
});
