/**
 * Track Changes Utilities - Tests
 *
 * Unit tests for the track changes utilities. These functions apply diff results
 * as track change marks in ProseMirror documents.
 *
 * Note: Most functions in track-changes.ts require a live ProseMirror editor instance
 * and are tested through integration tests. Only pure functions are unit tested here:
 * - COMPARISON_USER (constant)
 * - sortModificationsForApplication (pure function)
 *
 * @module track-changes
 */

import { describe, it, expect } from "vitest";
import {
  COMPARISON_USER,
  sortModificationsForApplication,
} from "./track-changes";
import type { DocumentModification, TrackChangeUser } from "./types";

// =============================================================================
// COMPARISON_USER
// =============================================================================

describe("COMPARISON_USER", () => {
  it("has required user properties", () => {
    expect(COMPARISON_USER).toHaveProperty("name");
    expect(COMPARISON_USER).toHaveProperty("email");
    expect(typeof COMPARISON_USER.name).toBe("string");
    expect(typeof COMPARISON_USER.email).toBe("string");
  });

  it("has the expected name value", () => {
    expect(COMPARISON_USER.name).toBe("Comparison");
  });

  it("has a valid email format", () => {
    expect(COMPARISON_USER.email).toBe("comparison@superdoc.diff");
  });

  it("satisfies TrackChangeUser type", () => {
    const user: TrackChangeUser = COMPARISON_USER;
    expect(user.name).toBeDefined();
    expect(user.email).toBeDefined();
  });
});

// =============================================================================
// sortModificationsForApplication
// =============================================================================

describe("sortModificationsForApplication", () => {
  it("sorts modifications by pmFrom in descending order", () => {
    const modifications: DocumentModification[] = [
      {
        change: {
          id: "1",
          type: "insertion",
          content: "a",
          charStart: 5,
          charEnd: 6,
        },
        pmFrom: 10,
        pmTo: 11,
      },
      {
        change: {
          id: "2",
          type: "insertion",
          content: "b",
          charStart: 25,
          charEnd: 26,
        },
        pmFrom: 50,
        pmTo: 51,
      },
      {
        change: {
          id: "3",
          type: "insertion",
          content: "c",
          charStart: 15,
          charEnd: 16,
        },
        pmFrom: 25,
        pmTo: 26,
      },
    ];

    const sorted = sortModificationsForApplication(modifications);

    expect(sorted[0].pmFrom).toBe(50);
    expect(sorted[1].pmFrom).toBe(25);
    expect(sorted[2].pmFrom).toBe(10);
  });

  it("does not mutate the original array", () => {
    const modifications: DocumentModification[] = [
      {
        change: {
          id: "1",
          type: "insertion",
          content: "a",
          charStart: 5,
          charEnd: 6,
        },
        pmFrom: 10,
        pmTo: 11,
      },
      {
        change: {
          id: "2",
          type: "insertion",
          content: "b",
          charStart: 25,
          charEnd: 26,
        },
        pmFrom: 50,
        pmTo: 51,
      },
    ];

    const originalFirst = modifications[0];
    const sorted = sortModificationsForApplication(modifications);

    expect(modifications[0]).toBe(originalFirst);
    expect(modifications[0].pmFrom).toBe(10);
    expect(sorted[0].pmFrom).toBe(50);
  });

  it("handles empty array", () => {
    const sorted = sortModificationsForApplication([]);
    expect(sorted).toHaveLength(0);
  });

  it("handles single modification", () => {
    const modifications: DocumentModification[] = [
      {
        change: { id: "1", type: "deletion", content: "x", insertAt: 10 },
        pmFrom: 15,
        pmTo: 15,
        isDeletion: true,
      },
    ];

    const sorted = sortModificationsForApplication(modifications);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].pmFrom).toBe(15);
  });

  it("handles modifications with same position (stable sort)", () => {
    const modifications: DocumentModification[] = [
      {
        change: {
          id: "1",
          type: "insertion",
          content: "a",
          charStart: 5,
          charEnd: 6,
        },
        pmFrom: 20,
        pmTo: 21,
      },
      {
        change: { id: "2", type: "deletion", content: "b", insertAt: 5 },
        pmFrom: 20,
        pmTo: 20,
        isDeletion: true,
      },
    ];

    const sorted = sortModificationsForApplication(modifications);

    expect(sorted).toHaveLength(2);
    expect(sorted[0].pmFrom).toBe(20);
    expect(sorted[1].pmFrom).toBe(20);
  });

  it("sorts correctly for position-shift-safe application", () => {
    // When applying changes to a document, applying from end to start
    // prevents earlier changes from shifting positions of later changes.
    // This test verifies the sorting enables that pattern.

    const modifications: DocumentModification[] = [
      {
        change: {
          id: "1",
          type: "insertion",
          content: "big ",
          charStart: 0,
          charEnd: 4,
        },
        pmFrom: 1,
        pmTo: 1,
      },
      {
        change: {
          id: "2",
          type: "insertion",
          content: "beautiful ",
          charStart: 6,
          charEnd: 16,
        },
        pmFrom: 7,
        pmTo: 7,
      },
    ];

    const sorted = sortModificationsForApplication(modifications);

    // Higher position (7) should come first for safe application
    expect(sorted[0].pmFrom).toBe(7);
    expect(sorted[0].change.content).toBe("beautiful ");

    // Lower position (1) should come second
    expect(sorted[1].pmFrom).toBe(1);
    expect(sorted[1].change.content).toBe("big ");
  });

  it("preserves all modification properties during sort", () => {
    const modifications: DocumentModification[] = [
      {
        change: {
          id: "del-1",
          type: "deletion",
          content: "removed",
          insertAt: 10,
          contextBefore: "prefix ",
        },
        pmFrom: 30,
        pmTo: 30,
        isDeletion: true,
        contextRange: { from: 23, to: 30 },
      },
      {
        change: {
          id: "ins-1",
          type: "insertion",
          content: "added",
          charStart: 5,
          charEnd: 10,
        },
        pmFrom: 6,
        pmTo: 11,
      },
    ];

    const sorted = sortModificationsForApplication(modifications);

    // First should be the deletion (higher pmFrom)
    expect(sorted[0].pmFrom).toBe(30);
    expect(sorted[0].isDeletion).toBe(true);
    expect(sorted[0].contextRange).toEqual({ from: 23, to: 30 });
    expect(sorted[0].change.id).toBe("del-1");
    expect(sorted[0].change.contextBefore).toBe("prefix ");

    // Second should be the insertion
    expect(sorted[1].pmFrom).toBe(6);
    expect(sorted[1].pmTo).toBe(11);
    expect(sorted[1].change.id).toBe("ins-1");
  });
});
