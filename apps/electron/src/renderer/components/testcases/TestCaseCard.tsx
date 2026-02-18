import React, { memo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  Trash2,
} from 'lucide-react';
import type { TestCaseMeta } from '../../../shared/types';

// ── Props ─────────────────────────────────────────────────────
interface TestCaseCardProps {
  testCase: TestCaseMeta;
  isSelected?: boolean;
  onExpand?: (testCaseId: string) => void;
  onDelete?: (testCaseId: string) => void;
}

// ── Component ─────────────────────────────────────────────────
export const TestCaseCard = memo(function TestCaseCard({
  testCase,
  isSelected,
  onExpand,
  onDelete,
}: TestCaseCardProps) {
  const handleExpand = useCallback(() => {
    onExpand?.(testCase.id);
  }, [onExpand, testCase.id]);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete?.(testCase.id);
    },
    [onDelete, testCase.id]
  );

  return (
    <div
      className={cn(
        'group relative rounded-lg border transition-all cursor-pointer',
        'bg-background hover:bg-accent/50',
        'border-border hover:border-accent',
        isSelected && 'border-primary bg-accent/30 shadow-sm'
      )}
      onClick={handleExpand}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleExpand();
        }
      }}
    >
      <div className="p-3 space-y-2">
        {/* Header: Name + actions */}
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-medium text-foreground leading-tight line-clamp-2">
            {testCase.name}
          </h4>
          <button
            onClick={handleDelete}
            className={cn(
              'flex-shrink-0 p-1 rounded transition-colors',
              'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
              'opacity-0 group-hover:opacity-100'
            )}
            title="Delete test case"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Target */}
        <p className="text-xs text-muted-foreground truncate">
          {testCase.targetComponent}
        </p>

        {/* Footer: References */}
        <div className="flex items-center justify-end gap-2">
          {testCase.referenceIds && testCase.referenceIds.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <BookOpen className="w-3 h-3" />
              <span>Refs ({testCase.referenceIds.length})</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
