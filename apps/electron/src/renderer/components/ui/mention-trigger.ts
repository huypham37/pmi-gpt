/**
 * Pure utility for @ mention trigger detection.
 * Extracted from mention-menu.tsx so it can be imported in tests
 * without pulling in React/UI dependencies.
 */

/**
 * Check if the @ character at the given position is a valid mention trigger.
 * Valid triggers are:
 * - @ at the start of input (position 0)
 * - @ preceded by whitespace (space, tab, newline)
 * - @ preceded by opening brackets or quotes: ( " '
 *
 * Invalid triggers (returns false):
 * - @ in the middle of a word (e.g., "test@example.com")
 * - @ preceded by alphanumeric or other characters
 *
 * @param textBeforeCursor - The text from start of input to cursor position
 * @param atPosition - The position of the @ character in textBeforeCursor
 * @returns true if this @ should trigger the mention menu
 */
export function isValidMentionTrigger(textBeforeCursor: string, atPosition: number): boolean {
  if (atPosition < 0) return false
  if (atPosition === 0) return true
  const charBefore = textBeforeCursor[atPosition - 1]
  if (charBefore === undefined) return false
  // Allow whitespace or opening brackets/quotes before @
  return /\s/.test(charBefore) || /[("']/.test(charBefore)
}
