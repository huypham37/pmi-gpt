import React, { useCallback, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { Plus, FlaskConical, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sessionMetaMapAtom, sessionIdsAtom } from '@/atoms/sessions';
import type { SessionMeta } from '@/atoms/sessions';

interface TestCasesNavigatorPanelProps {
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
}

export const TestCasesNavigatorPanel: React.FC<TestCasesNavigatorPanelProps> = ({
  selectedSessionId,
  onSelectSession,
  onCreateSession,
}) => {
  const sessionMetaMap = useAtomValue(sessionMetaMapAtom);
  const sessionIds = useAtomValue(sessionIdsAtom);

  // Filter sessions with testcase profile
  const testcaseSessions = useMemo(() => {
    const sessions: SessionMeta[] = [];
    for (const id of sessionIds) {
      const meta = sessionMetaMap.get(id);
      if (meta && meta.profile === 'testcase' && !meta.hidden) {
        sessions.push(meta);
      }
    }
    return sessions;
  }, [sessionIds, sessionMetaMap]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, sessionId: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelectSession(sessionId);
      }
    },
    [onSelectSession],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <h2 className="text-sm font-semibold text-foreground">Test Cases</h2>
        <button
          onClick={onCreateSession}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          aria-label="New test generation"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Search (placeholder for now) */}
      <div className="px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/50 text-muted-foreground text-xs">
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span>Search test cases...</span>
        </div>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto">
        {testcaseSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <FlaskConical className="w-8 h-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No test sessions yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Create a new session to start generating test cases
            </p>
          </div>
        ) : (
          <div className="py-1">
            {testcaseSessions.map((session) => (
              <div
                key={session.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectSession(session.id)}
                onKeyDown={(e) => handleKeyDown(e, session.id)}
                className={cn(
                  'flex flex-col gap-0.5 px-4 py-2.5 cursor-pointer transition-colors',
                  'hover:bg-accent/50',
                  selectedSessionId === session.id && 'bg-accent',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground truncate">
                    {session.name || 'Untitled Session'}
                  </span>
                </div>
                {session.preview && (
                  <span className="text-xs text-muted-foreground truncate">
                    {session.preview}
                  </span>
                )}
                {session.lastMessageAt && (
                  <span className="text-[10px] text-muted-foreground/70">
                    {new Date(session.lastMessageAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
