import React, { memo, useCallback } from 'react'
import { useAtomValue } from 'jotai'
import {
  ArrowLeft,
  MessageSquare,
  Shield,
  Target,
  CheckCircle,
  FileText,
  Copy,
  ExternalLink,
  BookOpen,
  ShieldAlert,
  ListOrdered,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { testCaseAtomFamily } from '@/atoms/testcases'
import type { TestCase } from '../../../shared/types'

interface TestCaseReportViewProps {
  testCaseId: string
  onBack: () => void
  onOpenChat?: () => void
}

function CopyButton({ text }: { text: string }) {
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text)
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
      title="Copy to clipboard"
    >
      <Copy className="w-3.5 h-3.5" />
    </button>
  )
}

function SectionHeader({ title, icon: Icon }: { title: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
    </div>
  )
}

function ReportContent({ testCase }: { testCase: TestCase }) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {/* Target Banner */}
      <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {testCase.targetComponent || 'Target not specified'}
            </span>
          </div>
        </div>
      </div>

      {/* References */}
      {testCase.reference && testCase.reference.length > 0 && (
        <div>
          <SectionHeader title="References" icon={BookOpen} />
          <div className="space-y-1.5">
            {testCase.reference.map((ref) => (
              <div
                key={ref.id}
                className="flex items-center gap-2 text-xs rounded-lg border border-border bg-muted/30 px-3 py-2"
              >
                <code className="text-foreground font-mono px-1.5 py-0.5 rounded bg-muted">
                  {ref.id}
                </code>
                <span className="text-foreground/80 flex-1">{ref.name}</span>
                {ref.url && (
                  <a
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      {testCase.description && (
        <div>
          <SectionHeader title="Description" icon={FileText} />
          <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
            {testCase.description}
          </div>
        </div>
      )}

      {/* Preconditions */}
      {testCase.preconditions && (
        <div>
          <SectionHeader title="Preconditions" icon={CheckCircle} />
          <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3">
            {testCase.preconditions}
          </div>
        </div>
      )}

      {/* Guidance */}
      {testCase.guidance && (
        <div>
          <SectionHeader title="Guidance" icon={ListOrdered} />
          <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap rounded-lg border border-border bg-blue-500/5 p-3">
            {testCase.guidance}
          </div>
        </div>
      )}

      {/* Timestamps */}
      <div className="border-t border-border pt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span>Created: {new Date(testCase.createdAt).toLocaleString()}</span>
        <span>Updated: {new Date(testCase.updatedAt).toLocaleString()}</span>
      </div>
    </div>
  )
}

export const TestCaseReportView = memo(function TestCaseReportView({
  testCaseId,
  onBack,
  onOpenChat,
}: TestCaseReportViewProps) {
  const testCase = useAtomValue(testCaseAtomFamily(testCaseId))

  if (!testCase) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <span className="text-sm">Test case not found</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header - relative z-panel lifts above titlebar drag region (z-40) so clicks work */}
      <div className="relative z-panel titlebar-no-drag flex items-center gap-2 px-4 py-2 border-b border-border bg-background shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="titlebar-no-drag flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-medium text-foreground truncate">{testCase.name}</h2>
        </div>
        {onOpenChat && (
          <button
            onClick={onOpenChat}
            className="titlebar-no-drag flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>
        )}
      </div>

      {/* Report Body */}
      <ReportContent testCase={testCase} />
    </div>
  )
})
