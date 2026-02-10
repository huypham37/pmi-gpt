/**
 * Settings Pages - MVP Simplified
 *
 * MVP only includes minimal settings needed for core functionality.
 */

// Minimal settings for MVP - model selection and keyboard shortcuts only
export { default as AppSettingsPage, meta as AppSettingsMeta } from './AppSettingsPage'
export { default as ShortcutsPage, meta as ShortcutsMeta } from './ShortcutsPage'

// Re-export types
export type { DetailsPageMeta } from '@/lib/navigation-registry'
