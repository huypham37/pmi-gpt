import { useCallback, useEffect, useState } from 'react'
import { FullscreenOverlayBase } from '@pmi-agent/ui'
import { ShikiCodeEditor } from '@/components/shiki'

interface DescriptionEditorOverlayProps {
  isOpen: boolean
  onClose: (updatedValue: string) => void
  initialValue: string
}

export function DescriptionEditorOverlay({
  isOpen,
  onClose,
  initialValue,
}: DescriptionEditorOverlayProps) {
  const [value, setValue] = useState(initialValue)

  // Sync local state when overlay opens with new value
  useEffect(() => {
    if (isOpen) setValue(initialValue)
  }, [isOpen, initialValue])

  const handleClose = useCallback(() => {
    onClose(value)
  }, [onClose, value])

  return (
    <FullscreenOverlayBase
      isOpen={isOpen}
      onClose={handleClose}
      title="Project Description"
      copyContent={value}
      accessibleTitle="Edit project description"
    >
      <div className="min-h-full flex flex-col justify-center px-4 py-1">
        <div className="bg-background rounded-[16px] shadow-strong w-full max-w-[90vw] h-[85vh] mx-auto my-auto overflow-hidden">
          <ShikiCodeEditor
            value={value}
            onChange={setValue}
            language="markdown"
            placeholder="Describe your project — tech stack, architecture, endpoints, auth…"
          />
        </div>
      </div>
    </FullscreenOverlayBase>
  )
}
