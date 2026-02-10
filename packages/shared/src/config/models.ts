/**
 * Centralized model definitions for the entire application.
 * Update model IDs here when new versions are released.
 */

export interface ModelDefinition {
  id: string;
  name: string;
  shortName: string;
  description: string;
  /** Known context window size in tokens (used as fallback before SDK reports usage) */
  contextWindow?: number;
}

// ============================================
// USER-SELECTABLE MODELS (shown in UI)
// ============================================

export const MODELS: ModelDefinition[] = [
  { id: 'github-copilot/gpt-5-mini', name: 'GPT-5 Mini', shortName: 'GPT-5 Mini', description: 'Fast & efficient', contextWindow: 128000 },
];

// ============================================
// PURPOSE-SPECIFIC DEFAULTS
// ============================================

/** Default model for main chat (user-facing) */
export const DEFAULT_MODEL = 'github-copilot/gpt-5-mini';

/** Model for agent definition extraction (always high quality) */
export const EXTRACTION_MODEL = 'github-copilot/gpt-5-mini';

/** Model for API response summarization (cost efficient) */
export const SUMMARIZATION_MODEL = 'github-copilot/gpt-5-mini';

/** Model for instruction updates (high quality for accurate document editing) */
export const INSTRUCTION_UPDATE_MODEL = 'github-copilot/gpt-5-mini';

// ============================================
// HELPER FUNCTIONS
// ============================================

/** Get display name for a model ID (full name with version) */
export function getModelDisplayName(modelId: string): string {
  const model = MODELS.find(m => m.id === modelId);
  if (model) return model.name;
  // For provider-prefixed IDs (e.g. "github-copilot/gpt-5-mini"), show the model part
  if (modelId.includes('/')) {
    return modelId.split('/').pop() || modelId;
  }
  return modelId;
}

/** Get short display name for a model ID (without version number) */
export function getModelShortName(modelId: string): string {
  const model = MODELS.find(m => m.id === modelId);
  if (model) return model.shortName;
  // For provider-prefixed IDs (e.g. "openai/gpt-5"), show just the model part
  if (modelId.includes('/')) {
    return modelId.split('/').pop() || modelId;
  }
  // Fallback: strip claude- prefix and date suffix
  return modelId.replace('claude-', '').replace(/-[\d.-]+$/, '');
}

/** Get known context window size for a model ID (fallback when SDK hasn't reported usage yet) */
export function getModelContextWindow(modelId: string): number | undefined {
  return MODELS.find(m => m.id === modelId)?.contextWindow;
}

/** Check if model is an Opus model (for cache TTL decisions) */
export function isOpusModel(modelId: string): boolean {
  return modelId.includes('opus');
}

/**
 * Check if a model ID refers to a Claude model.
 * Handles both direct Anthropic IDs (e.g. "claude-sonnet-4-5-20250929")
 * and provider-prefixed IDs (e.g. "anthropic/claude-sonnet-4" via OpenRouter).
 */
export function isClaudeModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return lower.startsWith('claude-') || lower.includes('/claude');
}
