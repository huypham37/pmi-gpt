/**
 * MainContentPanel - Right panel component for displaying content
 *
 * Renders content based on the unified NavigationState:
 * - Chats navigator: ChatPage for selected session, or empty state
 * - Settings navigator: AppSettingsPage only (MVP simplified)
 *
 * The NavigationState is the single source of truth for what to display.
 *
 * In focused mode (single window), wraps content with StoplightProvider
 * so PanelHeader components automatically compensate for macOS traffic lights.
 */

import * as React from 'react'
import { Panel } from './Panel'
import { cn } from '@/lib/utils'
import { useAppShellContext } from '@/context/AppShellContext'
import { StoplightProvider } from '@/context/StoplightContext'
import {
  useNavigationState,
  isChatsNavigation,
  isSettingsNavigation,
} from '@/contexts/NavigationContext'
// MVP: Simplified page imports - only core pages
import { AppSettingsPage, ShortcutsPage, ChatPage } from '@/pages'

export interface MainContentPanelProps {
  /** Whether the app is in focused mode (single chat, no sidebar) */
  isFocusedMode?: boolean
  /** Optional className for the container */
  className?: string
}

export function MainContentPanel({
  isFocusedMode = false,
  className,
}: MainContentPanelProps) {
  const navState = useNavigationState()
  const { activeWorkspaceId } = useAppShellContext()

  // Wrap content with StoplightProvider so PanelHeaders auto-compensate in focused mode
  const wrapWithStoplight = (content: React.ReactNode) => (
    <StoplightProvider value={isFocusedMode}>
      {content}
    </StoplightProvider>
  )

  // Settings navigator - MVP: only app settings and shortcuts
  if (isSettingsNavigation(navState)) {
    switch (navState.subpage) {
      case 'shortcuts':
        return wrapWithStoplight(
          <Panel variant="grow" className={className}>
            <ShortcutsPage />
          </Panel>
        )
      case 'app':
      default:
        return wrapWithStoplight(
          <Panel variant="grow" className={className}>
            <AppSettingsPage />
          </Panel>
        )
    }
  }

  // Chats navigator - show chat or empty state
  if (isChatsNavigation(navState)) {
    if (navState.details) {
      return wrapWithStoplight(
        <Panel variant="grow" className={className}>
          <ChatPage sessionId={navState.details.sessionId} />
        </Panel>
      )
    }
    // No session selected - empty state
    return wrapWithStoplight(
      <Panel variant="grow" className={className}>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p className="text-sm">
            {navState.filter.kind === 'flagged'
              ? 'No flagged conversations'
              : 'No conversations yet'}
          </p>
        </div>
      </Panel>
    )
  }

  // Fallback - redirect to chats
  return wrapWithStoplight(
    <Panel variant="grow" className={className}>
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Select a conversation to get started</p>
      </div>
    </Panel>
  )
}
