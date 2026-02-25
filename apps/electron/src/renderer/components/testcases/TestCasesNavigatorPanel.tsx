import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  FileText,
  FileUp,
  Trash2,
  Loader2,
  Maximize2,
} from 'lucide-react';
import { useAppShellContext } from '@/context/AppShellContext';
import { Markdown } from '@/components/markdown';
import { DescriptionEditorOverlay } from './DescriptionEditorOverlay';
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
  const [isAddingDoc, setIsAddingDoc] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

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

  const handleEditorClose = useCallback(async (updatedValue: string) => {
    setIsEditorOpen(false);
    if (!activeWorkspaceId || updatedValue === description) return;
    setDescription(updatedValue);
    try {
      const updated = await window.electronAPI.saveProjectContextDescription(
        activeWorkspaceId,
        updatedValue,
      );
      setContext(updated);
    } catch {
      // revert on failure
      setDescription(description);
    }
  }, [activeWorkspaceId, description]);

  const handleAddDocument = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const paths = await window.electronAPI.openFileDialog();
    if (!paths || paths.length === 0) return;

    setIsAddingDoc(true);
    try {
      for (const filePath of paths) {
        const ext = filePath.split('.').pop()?.toLowerCase();
        if (ext !== 'pdf' && ext !== 'docx' && ext !== 'pptx' && ext !== 'xlsx' && ext !== 'html' && ext !== 'png' && ext !== 'jpg' && ext !== 'jpeg' && ext !== 'webp' && ext !== 'md' && ext !== 'txt') continue;
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
      <div className="px-3 py-3 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Description preview + fullscreen editor */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-muted-foreground">Description</span>
                  <button
                    onClick={() => setIsEditorOpen(true)}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Maximize2 className="w-3 h-3" />
                    Edit
                  </button>
                </div>
                <button
                  onClick={() => setIsEditorOpen(true)}
                  className="w-full text-left px-2.5 py-2 rounded-md border border-border bg-muted/30 cursor-pointer hover:border-muted-foreground/40 transition-colors"
                >
                  {description ? (
                    <div className="text-xs text-foreground line-clamp-3 overflow-hidden">
                      <Markdown mode="minimal">{description}</Markdown>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">
                      Click to add project description…
                    </span>
                  )}
                </button>
                <DescriptionEditorOverlay
                  isOpen={isEditorOpen}
                  onClose={handleEditorClose}
                  initialValue={description}
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
                    Upload PDF, DOCX, MD...
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
    </div>
  );
}
