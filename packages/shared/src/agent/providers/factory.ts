/**
 * Provider Factory
 *
 * Creates the appropriate agent provider based on configuration.
 * Internal use only - OpenCode provider.
 */

import type { AgentProvider, ProviderName, ProviderDependencies } from './types.ts';
import { createOpenCodeProvider } from './opencode-provider.ts';

/**
 * Create an agent provider based on the provider name
 */
export function createProvider(
  name: ProviderName,
  deps: ProviderDependencies
): AgentProvider {
  switch (name) {
    case 'opencode':
      return createOpenCodeProvider(deps);

    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

/**
 * Check if a provider is available (SDK installed and working)
 */
export async function isProviderAvailable(name: ProviderName): Promise<boolean> {
  switch (name) {
    case 'opencode':
      try {
        await import('@opencode-ai/sdk');
        return true;
      } catch {
        return false;
      }

    default:
      return false;
  }
}

/**
 * Get available providers
 */
export async function getAvailableProviders(): Promise<ProviderName[]> {
  const providers: ProviderName[] = [];

  if (await isProviderAvailable('opencode')) {
    providers.push('opencode');
  }

  return providers;
}
