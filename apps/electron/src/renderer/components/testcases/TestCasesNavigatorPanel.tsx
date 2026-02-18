import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  FolderOpen,
  FileText,
  FileUp,
  Trash2,
  Save,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useAppShellContext } from '@/context/AppShellContext';
import type { ProjectContext } from '../../../shared/types';

interface TestCasesNavigatorPanelProps {
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
}

export const TestCasesNavigatorPanel: React.FC<TestCasesNavigatorPanelProps> = () => {
  return (
    <div className="flex flex-col h-full">
      <ProjectContextSection />
    </div>
  );
};

// ── Project Context Section (top half of navigator) ──────────────────────

function ProjectContextSection() {
  const { activeWorkspaceId } = useAppShellContext();
  const [context, setContext] = useState<ProjectContext | null>(null);
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingDoc, setIsAddingDoc] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [expanded, setExpanded] = useState(true);

  // Load context on mount
  useEffect(() => {
    if (!activeWorkspaceId) return;
    setIsLoading(true);
    window.electronAPI
      .getProjectContext(activeWorkspaceId)
      .then((ctx) => {
        setContext(ctx);
        setDescription(ctx.description);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [activeWorkspaceId]);

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDescription(e.target.value);
      setIsDirty(true);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!activeWorkspaceId || !isDirty) return;
    setIsSaving(true);
    try {
      const updated = await window.electronAPI.saveProjectContextDescription(
        activeWorkspaceId,
        description,
      );
      setContext(updated);
      setIsDirty(false);
    } finally {
      setIsSaving(false);
    }
  }, [activeWorkspaceId, description, isDirty]);

  const handleAddDocument = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const paths = await window.electronAPI.openFileDialog();
    if (!paths || paths.length === 0) return;

    setIsAddingDoc(true);
    try {
      for (const filePath of paths) {
        const ext = filePath.split('.').pop()?.toLowerCase();
        if (ext !== 'pdf' && ext !== 'docx') continue;
        const updated = await window.electronAPI.addProjectContextDocument(
          activeWorkspaceId,
          filePath,
        );
        setContext(updated);
      }
    } finally {
      setIsAddingDoc(false);
    }
  }, [activeWorkspaceId]);

  const handleRemoveDocument = useCallback(
    async (documentId: string) => {
      if (!activeWorkspaceId) return;
      const updated = await window.electronAPI.removeProjectContextDocument(
        activeWorkspaceId,
        documentId,
      );
      setContext(updated);
    },
    [activeWorkspaceId],
  );

  const docCount = context?.documents.length ?? 0;

  return (
    <div className="flex flex-col shrink-0">
      {/* Section header — collapsible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 px-4 py-3 text-left hover:bg-accent/30 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-semibold text-foreground">Project Context</span>
        {!expanded && docCount > 0 && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            {docCount} doc{docCount !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Description textarea */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-muted-foreground">Description</span>
                  {isDirty && (
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
                    >
                      {isSaving ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Save className="w-3 h-3" />
                      )}
                      Save
                    </button>
                  )}
                </div>
                <textarea
                  value={description}
                  onChange={handleDescriptionChange}
                  onBlur={handleSave}
                  placeholder="Tech stack, architecture, auth, endpoints…"
                  rows={3}
                  className="w-full px-2.5 py-2 rounded-md border border-border bg-muted/30 text-xs text-foreground placeholder:text-muted-foreground/50 resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              {/* Documents */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Documents{docCount > 0 ? ` (${docCount})` : ''}
                  </span>
                  <button
                    onClick={handleAddDocument}
                    disabled={isAddingDoc}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isAddingDoc ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Plus className="w-3 h-3" />
                    )}
                    Add
                  </button>
                </div>

                {docCount === 0 ? (
                  <button
                    onClick={handleAddDocument}
                    disabled={isAddingDoc}
                    className="w-full py-2 rounded-md border border-dashed border-border text-[11px] text-muted-foreground/60 hover:text-muted-foreground hover:border-muted-foreground/40 transition-colors text-center"
                  >
                    <FileUp className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
                    Upload PDF / DOCX
                  </button>
                ) : (
                  <div className="space-y-1">
                    {context?.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30 group"
                      >
                        <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-foreground truncate block">
                            {doc.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {doc.type.toUpperCase()} · {(doc.size / 1024).toFixed(0)} KB
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveDocument(doc.id)}
                          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                          title="Remove"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
