import React, { memo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Code2,
  ChevronRight,
  BookOpen,
  ShieldAlert,
} from 'lucide-react';
import type { TestCaseMeta } from '../../../shared/types';

// ── Props ─────────────────────────────────────────────────────
interface TestCaseCardProps {
  testCase: TestCaseMeta;
  isSelected?: boolean;
  onClick?: (testCaseId: string) => void;
  onExpand?: (testCaseId: string) => void;
}

// ── Component ─────────────────────────────────────────────────
export const TestCaseCard = memo(function TestCaseCard({
  testCase,
  isSelected,
  onClick,
  onExpand,
}: TestCaseCardProps) {
  const handleClick = useCallback(() => {
    onClick?.(testCase.id);
  }, [onClick, testCase.id]);

  const handleExpand = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onExpand?.(testCase.id);
    },
    [onExpand, testCase.id]
  );

  return (
    <div
      className={cn(
        'group relative rounded-lg border transition-all cursor-pointer',
        'bg-background hover:bg-accent/50',
        'border-border hover:border-accent',
        isSelected && 'border-primary bg-accent/30 shadow-sm'
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="p-3 space-y-2">
        {/* Header: Name + Code icon */}
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-medium text-foreground leading-tight line-clamp-2">
            {testCase.name}
          </h4>
          <button
            onClick={handleExpand}
            className={cn(
              'flex-shrink-0 p-1 rounded transition-colors',
              'text-muted-foreground hover:text-foreground hover:bg-accent',
              'opacity-0 group-hover:opacity-100'
            )}
            title="View report"
          >
            <Code2 className="w-4 h-4" />
          </button>
        </div>

        {/* Target */}
        <p className="text-xs text-muted-foreground truncate">
          {testCase.targetComponent}
        </p>

        {/* Footer: References */}
        <div className="flex items-center justify-end gap-2">
          {/* Reference badges */}
          {testCase.referenceIds && testCase.referenceIds.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <BookOpen className="w-3 h-3" />
              <span>Refs ({testCase.referenceIds.length})</span>
            </div>
          )}
        </div>
      </div>

      {/* Expand chevron (visible on hover) */}
      <div
        className={cn(
          'absolute right-0 top-0 bottom-0 w-8 flex items-center justify-center',
          'opacity-0 group-hover:opacity-100 transition-opacity',
          'bg-gradient-to-l from-accent/50 to-transparent rounded-r-lg'
        )}
        onClick={handleExpand}
      >
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  );
});
