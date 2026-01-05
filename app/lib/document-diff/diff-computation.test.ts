/**
 * Unit tests for diff computation utilities
 */

import { describe, it, expect } from "vitest";
import {
  computeChangesWithPositions,
  computeDiffSummary,
  hasSufficientContext,
  getDeletionSearchContext,
  filterChangesByType,
  sortChangesForApplication,
} from "./diff-computation";
import type { ChangeWithPosition } from "./types";

describe("computeChangesWithPositions", () => {
  describe("insertions", () => {
    it("should detect a simple insertion", () => {
      const original = "Hello world";
      const modified = "Hello beautiful world";

      const changes = computeChangesWithPositions(original, modified);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe("insertion");
      expect(changes[0].content).toBe("beautiful");
    });

    it("should detect insertion at the beginning", () => {
      const original = "world";
      const modified = "Hello world";

      const changes = computeChangesWithPositions(original, modified);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe("insertion");
      expect(changes[0].content).toBe("Hello");
    });

    it("should detect insertion at the end", () => {
      const original = "Hello";
      const modified = "Hello world";

      const changes = computeChangesWithPositions(original, modified);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe("insertion");
      expect(changes[0].content).toBe("world");
    });

    it("should track character positions for insertions", () => {
      const original = "Hello world";
      const modified = "Hello beautiful world";

      const changes = computeChangesWithPositions(original, modified);

      expect(changes[0].charStart).toBeDefined();
      expect(changes[0].charEnd).toBeDefined();
      expect(changes[0].charStart).toBeLessThan(changes[0].charEnd!);
    });
  });

  describe("deletions", () => {
    it("should detect a simple deletion", () => {
      const original = "Hello beautiful world";
      const modified = "Hello world";

      const changes = computeChangesWithPositions(original, modified);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe("deletion");
      expect(changes[0].content).toBe("beautiful");
    });

    it("should detect deletion at the beginning", () => {
      const original = "Hello world";
      const modified = "world";

      const changes = computeChangesWithPositions(original, modified);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe("deletion");
      expect(changes[0].content).toBe("Hello");
    });

    it("should detect deletion at the end", () => {
      const original = "Hello world";
      const modified = "Hello";

      const changes = computeChangesWithPositions(original, modified);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe("deletion");
      expect(changes[0].content).toBe("world");
    });

    it("should track insertAt position for deletions", () => {
      const original = "Hello beautiful world";
      const modified = "Hello world";

      const changes = computeChangesWithPositions(original, modified);

      expect(changes[0].insertAt).toBeDefined();
      expect(changes[0].insertAt).toBeGreaterThanOrEqual(0);
    });

    it("should capture context before deletion", () => {
      const original = "The quick brown fox jumps over the lazy dog";
      const modified = "The quick fox jumps over the lazy dog";

      const changes = computeChangesWithPositions(original, modified);

      expect(changes[0].contextBefore).toBeDefined();
      expect(changes[0].contextBefore!.length).toBeGreaterThan(0);
    });
  });

  describe("replacements", () => {
    it("should detect a simple replacement", () => {
      const original = "Hello world";
      const modified = "Hello universe";

      const changes = computeChangesWithPositions(original, modified);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe("replacement");
      expect(changes[0].oldContent).toBe("world");
      expect(changes[0].content).toBe("universe");
    });

    it("should track positions for replacements", () => {
      const original = "Hello world";
      const modified = "Hello universe";

      const changes = computeChangesWithPositions(original, modified);

      expect(changes[0].charStart).toBeDefined();
      expect(changes[0].charEnd).toBeDefined();
    });

    it("should detect multiple replacements", () => {
      const original = "The cat sat on the mat";
      const modified = "The dog stood on the rug";

      const changes = computeChangesWithPositions(original, modified);

      // Should detect: cat -> dog, sat -> stood, mat -> rug
      const replacements = changes.filter((c) => c.type === "replacement");
      expect(replacements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("multiple changes", () => {
    it("should detect multiple different change types", () => {
      const original = "Hello world, how are you?";
      const modified = "Hi world, how is everyone doing?";

      const changes = computeChangesWithPositions(original, modified);

      expect(changes.length).toBeGreaterThan(1);
    });

    it("should return empty array for identical texts", () => {
      const text = "Hello world";

      const changes = computeChangesWithPositions(text, text);

      expect(changes).toHaveLength(0);
    });

    it("should handle complete text replacement", () => {
      const original = "Original text";
      const modified = "Completely different";

      const changes = computeChangesWithPositions(original, modified);

      expect(changes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("edge cases", () => {
    it("should handle empty original text", () => {
      const original = "";
      const modified = "New content";

      const changes = computeChangesWithPositions(original, modified);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe("insertion");
    });

    it("should handle empty modified text", () => {
      const original = "Old content";
      const modified = "";

      const changes = computeChangesWithPositions(original, modified);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe("deletion");
    });

    it("should handle whitespace-only changes", () => {
      const original = "Hello world";
      const modified = "Hello  world"; // Extra space

      const changes = computeChangesWithPositions(original, modified);

      // Whitespace-only changes should be filtered out
      expect(changes.every((c) => c.content.trim().length > 0)).toBe(true);
    });

    it("should handle newlines in text", () => {
      const original = "Line 1\nLine 2\nLine 3";
      const modified = "Line 1\nNew Line\nLine 3";

      const changes = computeChangesWithPositions(original, modified);

      expect(changes.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("computeDiffSummary", () => {
  it("should count insertions correctly", () => {
    const changes: ChangeWithPosition[] = [
      { id: "1", type: "insertion", content: "test", charStart: 0, charEnd: 4 },
      { id: "2", type: "insertion", content: "test2", charStart: 10, charEnd: 15 },
    ];

    const summary = computeDiffSummary(changes);

    expect(summary.insertions).toBe(2);
    expect(summary.deletions).toBe(0);
    expect(summary.replacements).toBe(0);
  });

  it("should count deletions correctly", () => {
    const changes: ChangeWithPosition[] = [
      { id: "1", type: "deletion", content: "removed", insertAt: 0 },
    ];

    const summary = computeDiffSummary(changes);

    expect(summary.insertions).toBe(0);
    expect(summary.deletions).toBe(1);
    expect(summary.replacements).toBe(0);
  });

  it("should count replacements correctly", () => {
    const changes: ChangeWithPosition[] = [
      { id: "1", type: "replacement", content: "new", oldContent: "old", charStart: 0, charEnd: 3 },
    ];

    const summary = computeDiffSummary(changes);

    expect(summary.insertions).toBe(0);
    expect(summary.deletions).toBe(0);
    expect(summary.replacements).toBe(1);
  });

  it("should count mixed changes correctly", () => {
    const changes: ChangeWithPosition[] = [
      { id: "1", type: "insertion", content: "added", charStart: 0, charEnd: 5 },
      { id: "2", type: "deletion", content: "removed", insertAt: 10 },
      { id: "3", type: "replacement", content: "new", oldContent: "old", charStart: 20, charEnd: 23 },
      { id: "4", type: "insertion", content: "more", charStart: 30, charEnd: 34 },
    ];

    const summary = computeDiffSummary(changes);

    expect(summary.insertions).toBe(2);
    expect(summary.deletions).toBe(1);
    expect(summary.replacements).toBe(1);
  });
});

describe("hasSufficientContext", () => {
  it("should return true for deletion with sufficient context", () => {
    const change: ChangeWithPosition = {
      id: "1",
      type: "deletion",
      content: "removed",
      contextBefore: "Hello world",
    };

    expect(hasSufficientContext(change)).toBe(true);
  });

  it("should return false for deletion without context", () => {
    const change: ChangeWithPosition = {
      id: "1",
      type: "deletion",
      content: "removed",
    };

    expect(hasSufficientContext(change)).toBe(false);
  });

  it("should return false for deletion with short context", () => {
    const change: ChangeWithPosition = {
      id: "1",
      type: "deletion",
      content: "removed",
      contextBefore: "Hi",
    };

    expect(hasSufficientContext(change)).toBe(false);
  });

  it("should return false for non-deletion changes", () => {
    const change: ChangeWithPosition = {
      id: "1",
      type: "insertion",
      content: "added",
      charStart: 0,
      charEnd: 5,
      contextBefore: "Long enough context",
    };

    expect(hasSufficientContext(change)).toBe(false);
  });
});

describe("getDeletionSearchContext", () => {
  it("should return context for search", () => {
    const change: ChangeWithPosition = {
      id: "1",
      type: "deletion",
      content: "removed",
      contextBefore: "The quick brown fox",
    };

    const context = getDeletionSearchContext(change);

    expect(context).toBeDefined();
    expect(context!.length).toBeLessThanOrEqual(20);
  });

  it("should return undefined for insufficient context", () => {
    const change: ChangeWithPosition = {
      id: "1",
      type: "deletion",
      content: "removed",
      contextBefore: "Hi",
    };

    const context = getDeletionSearchContext(change);

    expect(context).toBeUndefined();
  });

  it("should truncate long context to maxLength", () => {
    const change: ChangeWithPosition = {
      id: "1",
      type: "deletion",
      content: "removed",
      contextBefore: "This is a very long context that should be truncated",
    };

    const context = getDeletionSearchContext(change, 15);

    expect(context).toBeDefined();
    expect(context!.length).toBeLessThanOrEqual(15);
  });
});

describe("filterChangesByType", () => {
  const mixedChanges: ChangeWithPosition[] = [
    { id: "1", type: "insertion", content: "added", charStart: 0, charEnd: 5 },
    { id: "2", type: "deletion", content: "removed", insertAt: 10 },
    { id: "3", type: "replacement", content: "new", oldContent: "old", charStart: 20, charEnd: 23 },
    { id: "4", type: "insertion", content: "more", charStart: 30, charEnd: 34 },
  ];

  it("should filter insertions", () => {
    const insertions = filterChangesByType(mixedChanges, "insertion");

    expect(insertions).toHaveLength(2);
    expect(insertions.every((c) => c.type === "insertion")).toBe(true);
  });

  it("should filter deletions", () => {
    const deletions = filterChangesByType(mixedChanges, "deletion");

    expect(deletions).toHaveLength(1);
    expect(deletions.every((c) => c.type === "deletion")).toBe(true);
  });

  it("should filter replacements", () => {
    const replacements = filterChangesByType(mixedChanges, "replacement");

    expect(replacements).toHaveLength(1);
    expect(replacements.every((c) => c.type === "replacement")).toBe(true);
  });
});

describe("sortChangesForApplication", () => {
  it("should sort changes in descending order by position", () => {
    const changes: ChangeWithPosition[] = [
      { id: "1", type: "insertion", content: "a", charStart: 10, charEnd: 11 },
      { id: "2", type: "insertion", content: "b", charStart: 50, charEnd: 51 },
      { id: "3", type: "insertion", content: "c", charStart: 25, charEnd: 26 },
    ];

    const sorted = sortChangesForApplication(changes);

    expect(sorted[0].charStart).toBe(50);
    expect(sorted[1].charStart).toBe(25);
    expect(sorted[2].charStart).toBe(10);
  });

  it("should use insertAt for deletions", () => {
    const changes: ChangeWithPosition[] = [
      { id: "1", type: "deletion", content: "a", insertAt: 10 },
      { id: "2", type: "deletion", content: "b", insertAt: 50 },
      { id: "3", type: "deletion", content: "c", insertAt: 25 },
    ];

    const sorted = sortChangesForApplication(changes);

    expect(sorted[0].insertAt).toBe(50);
    expect(sorted[1].insertAt).toBe(25);
    expect(sorted[2].insertAt).toBe(10);
  });

  it("should not mutate the original array", () => {
    const changes: ChangeWithPosition[] = [
      { id: "1", type: "insertion", content: "a", charStart: 10, charEnd: 11 },
      { id: "2", type: "insertion", content: "b", charStart: 50, charEnd: 51 },
    ];

    const originalFirst = changes[0];
    sortChangesForApplication(changes);

    expect(changes[0]).toBe(originalFirst);
  });
});
