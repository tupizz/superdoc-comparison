/**
 * Diff Computation Utilities
 *
 * Functions for computing character-level diffs between documents
 * with position tracking for accurate document modifications.
 */

import { diffChars, type Change as DiffChange } from "diff";
import { extractContext } from "./text-extraction";
import type { ChangeWithPosition, DiffSummary } from "./types";

/**
 * Default context length for deletion positioning
 */
const DEFAULT_CONTEXT_LENGTH = 30;

/**
 * Minimum context length required for reliable search
 */
const MIN_CONTEXT_LENGTH = 5;

/**
 * Compute character-level changes between two texts with position tracking.
 *
 * This function performs a character-level diff and tracks:
 * - For insertions/replacements: exact character positions in modified text
 * - For deletions: position where deleted content should be inserted, plus context
 *
 * @param originalText - The original (older) text
 * @param modifiedText - The modified (newer) text
 * @returns Array of changes with position information
 */
export function computeChangesWithPositions(
  originalText: string,
  modifiedText: string
): ChangeWithPosition[] {
  const diffs = diffChars(originalText, modifiedText);
  const changes: ChangeWithPosition[] = [];
  let changeId = 0;
  let modifiedCharIndex = 0; // Track position in modified text

  for (let i = 0; i < diffs.length; i++) {
    const current = diffs[i];

    // Unchanged text - advance modified position
    if (!current.added && !current.removed) {
      modifiedCharIndex += current.value.length;
      continue;
    }

    const text = current.value.trim();

    // Skip empty changes but still advance position for added text
    if (!text || text.length < 1) {
      if (current.added) {
        modifiedCharIndex += current.value.length;
      }
      continue;
    }

    // Check for replacement (removed followed by added)
    const next = diffs[i + 1];
    if (isReplacement(current, next)) {
      const replacement = createReplacement(
        current,
        next as DiffChange,
        modifiedCharIndex,
        changeId++
      );

      if (replacement) {
        changes.push(replacement);
        modifiedCharIndex += next!.value.length;
        i++; // Skip next item since we processed it
        continue;
      }
    }

    // Handle pure insertion
    if (current.added) {
      const insertion = createInsertion(current, modifiedCharIndex, changeId++);
      changes.push(insertion);
      modifiedCharIndex += current.value.length;
      continue;
    }

    // Handle pure deletion
    if (current.removed) {
      const deletion = createDeletion(
        current,
        modifiedText,
        modifiedCharIndex,
        changeId++
      );
      changes.push(deletion);
      // Don't advance modifiedCharIndex for deletions (they're not in modified text)
    }
  }

  return changes;
}

/**
 * Check if current and next diff parts represent a replacement
 */
function isReplacement(
  current: DiffChange,
  next: DiffChange | undefined
): boolean {
  return (
    current.removed === true &&
    next !== undefined &&
    next.added === true &&
    current.value.trim().length > 0 &&
    next.value.trim().length > 0
  );
}

/**
 * Create a replacement change from a removed/added pair
 */
function createReplacement(
  removed: DiffChange,
  added: DiffChange,
  modifiedCharIndex: number,
  id: number
): ChangeWithPosition | null {
  const oldText = removed.value.trim();
  const newText = added.value.trim();

  if (!oldText || !newText) {
    return null;
  }

  // Calculate the actual start position (accounting for leading whitespace)
  const leadingWhitespace = added.value.length - added.value.trimStart().length;
  const charStart = modifiedCharIndex + leadingWhitespace;
  const charEnd = charStart + newText.length;

  return {
    id: `change-${id}`,
    type: "replacement",
    content: newText,
    oldContent: oldText,
    charStart,
    charEnd,
  };
}

/**
 * Create an insertion change
 */
function createInsertion(
  diff: DiffChange,
  modifiedCharIndex: number,
  id: number
): ChangeWithPosition {
  const text = diff.value.trim();
  const leadingWhitespace = diff.value.length - diff.value.trimStart().length;
  const charStart = modifiedCharIndex + leadingWhitespace;
  const charEnd = charStart + text.length;

  return {
    id: `change-${id}`,
    type: "insertion",
    content: text,
    charStart,
    charEnd,
  };
}

/**
 * Create a deletion change with context for positioning
 */
function createDeletion(
  diff: DiffChange,
  modifiedText: string,
  modifiedCharIndex: number,
  id: number
): ChangeWithPosition {
  const text = diff.value.trim();

  // Capture context before the deletion for finding the exact insertion point
  const contextBefore = extractContext(
    modifiedText,
    modifiedCharIndex,
    DEFAULT_CONTEXT_LENGTH
  );

  return {
    id: `change-${id}`,
    type: "deletion",
    content: text,
    insertAt: modifiedCharIndex,
    contextBefore: contextBefore,
  };
}

/**
 * Compute a summary of changes
 *
 * @param changes - Array of changes to summarize
 * @returns Summary with counts of each change type
 */
export function computeDiffSummary(changes: ChangeWithPosition[]): DiffSummary {
  let insertions = 0;
  let deletions = 0;
  let replacements = 0;

  for (const change of changes) {
    switch (change.type) {
      case "insertion":
        insertions++;
        break;
      case "deletion":
        deletions++;
        break;
      case "replacement":
        replacements++;
        break;
    }
  }

  return { insertions, deletions, replacements };
}

/**
 * Check if a deletion has sufficient context for positioning
 *
 * @param change - The deletion change to check
 * @returns True if there's enough context for reliable positioning
 */
export function hasSufficientContext(change: ChangeWithPosition): boolean {
  return (
    change.type === "deletion" &&
    change.contextBefore !== undefined &&
    change.contextBefore.length >= MIN_CONTEXT_LENGTH
  );
}

/**
 * Get the search context for finding deletion insertion point
 *
 * @param change - The deletion change
 * @param maxLength - Maximum context length to return (default 20)
 * @returns The context string to search for
 */
export function getDeletionSearchContext(
  change: ChangeWithPosition,
  maxLength: number = 20
): string | undefined {
  if (
    !change.contextBefore ||
    change.contextBefore.length < MIN_CONTEXT_LENGTH
  ) {
    return undefined;
  }

  // Use the last portion of the context for search
  const context = change.contextBefore;
  const start = Math.max(0, context.length - maxLength);
  return context.substring(start);
}

/**
 * Filter changes by type
 *
 * @param changes - Array of changes to filter
 * @param type - The type of changes to keep
 * @returns Filtered array of changes
 */
export function filterChangesByType(
  changes: ChangeWithPosition[],
  type: ChangeWithPosition["type"]
): ChangeWithPosition[] {
  return changes.filter((c) => c.type === type);
}

/**
 * Sort changes by position (descending) for safe document modification.
 * Changes should be applied from end to start to avoid position shifting.
 *
 * @param changes - Array of changes to sort
 * @returns New sorted array (does not mutate input)
 */
export function sortChangesForApplication(
  changes: ChangeWithPosition[]
): ChangeWithPosition[] {
  return [...changes].sort((a, b) => {
    const posA = a.charStart ?? a.insertAt ?? 0;
    const posB = b.charStart ?? b.insertAt ?? 0;
    return posB - posA; // Descending order
  });
}

