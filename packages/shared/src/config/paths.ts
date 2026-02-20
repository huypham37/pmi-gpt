/**
 * Centralized path configuration for PMI Agent.
 *
 * Supports multi-instance development via CRAFT_CONFIG_DIR environment variable.
 * When running from a numbered folder (e.g., craft-tui-agent-1), the detect-instance.sh
 * script sets CRAFT_CONFIG_DIR to ~/.pmi-agent-1, allowing multiple instances to run
 * simultaneously with separate configurations.
 *
 * Default (non-numbered folders): ~/.pmi-agent/
 * Instance 1 (-1 suffix): ~/.pmi-agent-1/
 * Instance 2 (-2 suffix): ~/.pmi-agent-2/
 */

import { homedir } from 'os';
import { join } from 'path';

function defaultConfigDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env.LOCALAPPDATA || process.env.APPDATA || homedir();
    return join(appData, 'pmi-agent');
  }
  return join(homedir(), '.pmi-agent');
}

// Allow override via environment variable for multi-instance dev
export const CONFIG_DIR = process.env.CRAFT_CONFIG_DIR || defaultConfigDir();
