import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { ArrowLeft, MessageSquare, Loader2 } from 'lucide-react';
import { PanelHeader } from '@/components/app-shell/PanelHeader';
import { InputContainer } from '@/components/app-shell/input/InputContainer';
import { TestCaseGrid } from '@/components/testcases/TestCaseGrid';
import { TestCaseReportView } from '@/components/testcases/TestCaseReportView';
import { testCaseIdsForSessionAtomFamily, addTestCaseAtom, loadAllTestCasesAtom, allTestCaseIdsAtom } from '@/atoms/testcases';
import { MOCK_SESSION_ID_VALUE } from '@/components/testcases/mockTestCases';
import { useAppShellContext } from '@/context/AppShellContext';
import type { TestCase, TestCaseViewMode } from '../../shared/types';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TestCaseGeneratorPageProps {
  generationSessionId?: string;
  initialViewMode?: TestCaseViewMode;
  initialTestCaseId?: string;
  onOpenChat?: (sessionId: string) => void;
  onBack?: () => void;
}

export function TestCaseGeneratorPage({
  generationSessionId,
  initialViewMode = 'grid',
  initialTestCaseId,
  onOpenChat,
  onBack,
}: TestCaseGeneratorPageProps) {
  const [viewMode, setViewMode] = useState<TestCaseViewMode>(initialViewMode);
  const [selectedTestCaseId, setSelectedTestCaseId] = useState<string | undefined>(initialTestCaseId);
  const [inputValue, setInputValue] = useState('');
  const [sessionId, setSessionId] = useState<string | undefined>(generationSessionId);
  const textareaRef = useRef<any>(null);

  const { activeWorkspaceId, onCreateSession, onSendMessage } = useAppShellContext();

  const addTestCase = useSetAtom(addTestCaseAtom);
  const loadAllTestCases = useSetAtom(loadAllTestCasesAtom);
  const [isGenerating, setIsGenerating] = useState(false);

  const effectiveSessionId = sessionId ?? generationSessionId ?? MOCK_SESSION_ID_VALUE;
  const testCaseIds = useAtomValue(allTestCaseIdsAtom);

  // Load persisted test cases from disk on mount
  useEffect(() => {
    loadAllTestCases();
  }, [loadAllTestCases]);

  const handleSelectTestCase = useCallback((testCaseId: string) => {
    setSelectedTestCaseId(testCaseId);
  }, []);

  const handleExpandTestCase = useCallback((testCaseId: string) => {
    setSelectedTestCaseId(testCaseId);
    setViewMode('report');
  }, []);

  const handleBackToGrid = useCallback(() => {
    setViewMode('grid');
  }, []);

  const handleOpenChat = useCallback(() => {
    const chatSessionId = sessionId ?? generationSessionId;
    if (chatSessionId) {
      onOpenChat?.(chatSessionId);
    }
  }, [onOpenChat, sessionId, generationSessionId]);

  const handleSubmit = useCallback(async (message: string) => {
    if (!message.trim() || isGenerating) return;

    setIsGenerating(true);
    setInputValue('');

    try {
      // Call the main process to run RAG + ACP generation
      const testCases = await window.electronAPI.generateTestCases(
        activeWorkspaceId,
        message.trim(),
      );

      // Update session ID from the first generated test case
      if (testCases.length > 0 && !sessionId) {
        setSessionId(testCases[0].generationSessionId);
      }

      // Add each test case to atoms
      for (const tc of testCases) {
        addTestCase(tc);
      }
    } catch (error) {
      console.error('[TestCaseGen] Generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [activeWorkspaceId, sessionId, isGenerating, addTestCase]);

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
  }, []);

  const isReportView = viewMode === 'report' && selectedTestCaseId;

  return (
    <div className="flex flex-col h-full">
      {isReportView ? (
        <TestCaseReportView
          testCaseId={selectedTestCaseId}
          onBack={handleBackToGrid}
          onOpenChat={handleOpenChat}
        />
      ) : (
        <>
          <PanelHeader
            title="Test Case Generator"
            actions={
              <button
                onClick={handleOpenChat}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium
                  text-muted-foreground hover:text-foreground rounded-md
                  hover:bg-muted/50 transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Chat
              </button>
            }
          />

          {/* Compact Input at Top */}
          <div className="px-4 pt-3 pb-2 border-b border-border/50">
            <InputContainer
              compactMode
              onSubmit={handleSubmit}
              inputValue={inputValue}
              onInputChange={handleInputChange}
              textareaRef={textareaRef}
              isEmptySession={testCaseIds.length === 0}
            />
          </div>

          {/* Generating indicator */}
          {isGenerating && (
            <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground border-b border-border/50">
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating test cases...
            </div>
          )}

          {/* Scrollable Test Case Grid */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <TestCaseGrid
              testCaseIds={testCaseIds}
              selectedTestCaseId={selectedTestCaseId}
              onSelectTestCase={handleSelectTestCase}
              onExpandTestCase={handleExpandTestCase}
            />
          </div>
        </>
      )}
    </div>
  );
}
