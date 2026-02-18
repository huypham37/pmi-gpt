/**
 * MainContentPanel - Right panel component for displaying content
 *
 * Renders content based on the unified NavigationState:
 * - Chats navigator: ChatPage for selected session, or empty state
 * - Settings navigator: Routes to the correct settings subpage
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
  useNavigation,
  isChatsNavigation,
  isSettingsNavigation,
  isTestCasesNavigation,
  routes,
} from '@/contexts/NavigationContext'
import {
  AppSettingsPage,
  AppearanceSettingsPage,
  InputSettingsPage,
  WorkspaceSettingsPage,
  PermissionsSettingsPage,
  LabelsSettingsPage,
  ShortcutsPage,
  PreferencesPage,
  ChatPage,
} from '@/pages'
import { TestCaseGeneratorPage } from '@/pages/TestCaseGeneratorPage'

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
  const { navigate } = useNavigation()
  const { activeWorkspaceId } = useAppShellContext()

  // Wrap content with StoplightProvider so PanelHeaders auto-compensate in focused mode
  const wrapWithStoplight = (content: React.ReactNode) => (
    <StoplightProvider value={isFocusedMode}>
      {content}
    </StoplightProvider>
  )

  // Settings navigator - route to correct subpage
  if (isSettingsNavigation(navState)) {
    const renderSettingsPage = () => {
      switch (navState.subpage) {
        case 'appearance':
          return <AppearanceSettingsPage />
        case 'input':
          return <InputSettingsPage />
        case 'workspace':
          return <WorkspaceSettingsPage />
        case 'permissions':
          return <PermissionsSettingsPage />
        case 'labels':
          return <LabelsSettingsPage />
        case 'shortcuts':
          return <ShortcutsPage />
        case 'preferences':
          return <PreferencesPage />
        case 'app':
        default:
          return <AppSettingsPage />
      }
    }

    return wrapWithStoplight(
      <Panel variant="grow" className={className}>
        {renderSettingsPage()}
      </Panel>
    )
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

  // Test Cases navigator - always show test case generator with input ready
  if (isTestCasesNavigation(navState)) {
    const details = navState.details
    return wrapWithStoplight(
      <Panel variant="grow" className={className}>
        <TestCaseGeneratorPage
          generationSessionId={details?.sessionId}
          initialViewMode={details?.viewMode || 'grid'}
          initialTestCaseId={details?.testCaseId}
          onOpenChat={(input) =>
            navigate(routes.action.newChat({ input, send: input ? true : undefined }))
          }
        />
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
