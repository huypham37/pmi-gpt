import React, { memo, useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft,
  FileText,
  Plus,
  Trash2,
  Save,
  Loader2,
  FileUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppShellContext } from '@/context/AppShellContext'
import type { ProjectContext, ContextDocument } from '../../../shared/types'

interface ProjectContextPanelProps {
  onBack: () => void
}

export const ProjectContextPanel = memo(function ProjectContextPanel({
  onBack,
}: ProjectContextPanelProps) {
  const { activeWorkspaceId } = useAppShellContext()
  const [context, setContext] = useState<ProjectContext | null>(null)
  const [description, setDescription] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isAddingDoc, setIsAddingDoc] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [docError, setDocError] = useState<string | null>(null)

  // Load context on mount
  useEffect(() => {
    if (!activeWorkspaceId) return
    setIsLoading(true)
    window.electronAPI.getProjectContext(activeWorkspaceId).then((ctx) => {
      setContext(ctx)
      setDescription(ctx.description)
      setIsLoading(false)
    }).catch(() => setIsLoading(false))
  }, [activeWorkspaceId])

  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value)
    setIsDirty(true)
  }, [])

  const handleSaveDescription = useCallback(async () => {
    if (!activeWorkspaceId || !isDirty) return
    setIsSaving(true)
    try {
      const updated = await window.electronAPI.saveProjectContextDescription(activeWorkspaceId, description)
      setContext(updated)
      setIsDirty(false)
    } finally {
      setIsSaving(false)
    }
  }, [activeWorkspaceId, description, isDirty])

  const SUPPORTED_EXTS = ['pdf', 'docx', 'pptx', 'xlsx', 'html', 'png', 'jpg', 'jpeg', 'webp', 'md', 'txt']

  const handleAddDocument = useCallback(async () => {
    if (!activeWorkspaceId) return
    const paths = await window.electronAPI.openFileDialog()
    if (!paths || paths.length === 0) return

    setDocError(null)
    setIsAddingDoc(true)
    try {
      for (const filePath of paths) {
        const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
        if (!SUPPORTED_EXTS.includes(ext)) continue
        const updated = await window.electronAPI.addProjectContextDocument(activeWorkspaceId, filePath)
        setContext(updated)
      }
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Failed to add document')
    } finally {
      setIsAddingDoc(false)
    }
  }, [activeWorkspaceId])

  const handleRemoveDocument = useCallback(async (documentId: string) => {
    if (!activeWorkspaceId) return
    const updated = await window.electronAPI.removeProjectContextDocument(activeWorkspaceId, documentId)
    setContext(updated)
  }, [activeWorkspaceId])

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
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
          <h2 className="text-sm font-medium text-foreground">Project Context</h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Description */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-medium text-foreground">Project Description</h3>
            </div>
            <button
              onClick={handleSaveDescription}
              disabled={!isDirty || isSaving}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors',
                isDirty
                  ? 'text-foreground bg-primary/10 hover:bg-primary/20'
                  : 'text-muted-foreground cursor-not-allowed',
              )}
            >
              {isSaving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              Save
            </button>
          </div>
          <textarea
            value={description}
            onChange={handleDescriptionChange}
            placeholder="Describe your application: tech stack, architecture, authentication methods, key endpoints, sensitive data flows..."
            className="w-full min-h-[120px] p-3 rounded-lg border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground/50 resize-y focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Documents */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FileUp className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-medium text-foreground">Documents</h3>
            </div>
            <button
              onClick={handleAddDocument}
              disabled={isAddingDoc}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
            >
              {isAddingDoc ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
              Add Document
            </button>
          </div>
          {docError && (
            <p className="text-destructive text-xs mb-2">{docError}</p>
          )}

          {context?.documents.length === 0 ? (
            <div className="text-xs text-muted-foreground/70 p-3 rounded-lg border border-dashed border-border text-center">
              No documents added yet. Upload PDF, DOCX, PPTX, XLSX, HTML, images, or Markdown/Text files to provide additional context.
            </div>
          ) : (
            <div className="space-y-2">
              {context?.documents.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  document={doc}
                  onRemove={handleRemoveDocument}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

function DocumentRow({
  document,
  onRemove,
}: {
  document: ContextDocument
  onRemove: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-border bg-muted/30">
      <div className="flex items-center gap-2 px-3 py-2">
        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-foreground hover:underline truncate block text-left w-full"
          >
            {document.name}
          </button>
          <span className="text-[10px] text-muted-foreground">
            {document.type.toUpperCase()} · {(document.size / 1024).toFixed(0)} KB · {new Date(document.addedAt).toLocaleDateString()}
          </span>
        </div>
        <button
          onClick={() => onRemove(document.id)}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          title="Remove document"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
