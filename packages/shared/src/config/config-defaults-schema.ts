/**
 * Schema for config-defaults.json
 * This file contains the default values for all configuration options.
 */

import type { PermissionMode } from '../agent/mode-manager.ts';
import type { ThinkingLevel } from '../agent/thinking-levels.ts';

export interface ConfigDefaults {
  version: string;
  description: string;
  defaults: {
    notificationsEnabled: boolean;
    colorTheme: string;
    autoCapitalisation: boolean;
    sendMessageKey: 'enter' | 'cmd-enter';
    spellCheck: boolean;
  };
  workspaceDefaults: {
    thinkingLevel: ThinkingLevel;
    permissionMode: PermissionMode;
    cyclablePermissionModes: PermissionMode[];
    localMcpServers: {
      enabled: boolean;
    };
  };
}

/**
 * Bundled defaults (shipped with the app)
 * This is the source of truth for default values.
 */
export const BUNDLED_CONFIG_DEFAULTS: ConfigDefaults = {
  version: '1.0',
  description: 'Default configuration values for PMI-Agent',
  defaults: {
    notificationsEnabled: true,
    colorTheme: 'default',
    autoCapitalisation: true,
    sendMessageKey: 'enter',
    spellCheck: false,
  },
  workspaceDefaults: {
    thinkingLevel: 'think',
    permissionMode: 'safe',
    cyclablePermissionModes: ['safe', 'ask', 'allow-all'],
    localMcpServers: {
      enabled: true,
    },
  },
};
