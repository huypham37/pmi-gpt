/**
 * Agent Providers
 *
 * This module provides the abstraction layer for AI agent backends.
 * Internal use only - OpenCode SDK provider.
 */

// Types
export type {
  ProviderName,
  ProviderSessionState,
  ProviderConfig,
  ProviderTurnRequest,
  ProviderCallbacks,
  ProviderDependencies,
  ToolPermissionCheck,
  AgentProvider,
  ProviderFactory,
} from './types.ts';

export { AbortReason } from './types.ts';

// Provider implementation
export { OpenCodeProvider, createOpenCodeProvider } from './opencode-provider.ts';

// Factory
export { createProvider, isProviderAvailable, getAvailableProviders } from './factory.ts';
