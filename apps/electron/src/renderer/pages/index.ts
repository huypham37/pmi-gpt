/**
 * Pages Index
 *
 * Export all page components for use in MainContentPanel.
 * MVP: Simplified to only core pages.
 */

// Core pages
export { default as ChatPage } from './ChatPage'

// Settings pages - MVP: Only AppSettingsPage and ShortcutsPage
export {
  AppSettingsPage,
  ShortcutsPage,
} from './settings'
