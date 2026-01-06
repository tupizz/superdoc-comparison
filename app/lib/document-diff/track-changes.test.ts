/**
 * Track Changes Utilities - Tests
 *
 * Unit tests for the track changes utilities. These functions apply diff results
 * as track change marks in ProseMirror documents.
 *
 * @module track-changes
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  COMPARISON_USER,
  sortModificationsForApplication,
  buildModifications,
  applyFormattingTrackChanges,
} from "./track-changes";
import type {
  ChangeWithPosition,
  DocumentModification,
  FormattingChangeWithPosition,
  PositionMap,
  SuperDocEditor,
  TrackChangeUser,
} from "./types";

// =============================================================================
// Test Schema with Track Change Marks
// =============================================================================

/**
 * Creates a ProseMirror schema with track change marks for testing
 */
function createTestSchema() {
  return new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: {
        group: "block",
        content: "inline*",
        toDOM: () => ["p", 0],
        parseDOM: [{ tag: "p" }],
      },
      text: { group: "inline" },
    },
    marks: {
      trackInsert: {
        attrs: {
          id: { default: "" },
          author: { default: "" },
          authorEmail: { default: "" },
          authorImage: { default: "" },
          date: { default: "" },
        },
        toDOM: () => ["ins", 0],
        parseDOM: [{ tag: "ins" }],
      },
      trackDelete: {
        attrs: {
          id: { default: "" },
          author: { default: "" },
          authorEmail: { default: "" },
          authorImage: { default: "" },
          date: { default: "" },
        },
        toDOM: () => ["del", 0],
        parseDOM: [{ tag: "del" }],
      },
      trackFormat: {
        attrs: {
          id: { default: "" },
          author: { default: "" },
          authorEmail: { default: "" },
          authorImage: { default: "" },
          date: { default: "" },
          changeType: { default: "" },
          markType: { default: "" },
          oldAttrs: { default: undefined },
          newAttrs: { default: undefined },
        },
        toDOM: () => ["span", { class: "track-format" }, 0],
        parseDOM: [{ tag: "span.track-format" }],
      },
      bold: {
        toDOM: () => ["strong", 0],
        parseDOM: [{ tag: "strong" }],
      },
      italic: {
        toDOM: () => ["em", 0],
        parseDOM: [{ tag: "em" }],
      },
    },
  });
}

/**
 * Creates a real ProseMirror-based editor for testing
 */
function createTestEditor(content: string): SuperDocEditor {
  const schema = createTestSchema();

  // Create document from text content
  const paragraphs = content.split("\n").map((text) =>
    schema.nodes.paragraph.create(null, text ? schema.text(text) : null)
  );
  const doc = schema.nodes.doc.create(null, paragraphs);

  const state = EditorState.create({ doc, schema });

  // Create a container element for the editor
  const container = document.createElement("div");
  document.body.appendChild(container);

  const view = new EditorView(container, { state });

  // Create a wrapper that matches SuperDocEditor interface
  const editor: SuperDocEditor = {
    view,
    state: view.state,
    schema,
    getJSON: () => view.state.doc.toJSON() as ReturnType<SuperDocEditor["getJSON"]>,
    getHTML: () => container.innerHTML,
    commands: {
      search: (text: string) => {
        // Simple search implementation for testing
        const results: Array<{ from: number; to: number }> = [];
        const docText = view.state.doc.textContent;
        let pos = 0;

        view.state.doc.descendants((node, nodePos) => {
          if (node.isText && node.text) {
            const index = node.text.indexOf(text);
            if (index !== -1) {
              results.push({
                from: nodePos + index,
                to: nodePos + index + text.length,
              });
            }
          }
          return true;
        });

        return results.length > 0 ? results : null;
      },
      setTextSelection: ({ from, to }) => {
        const tr = view.state.tr.setSelection(
          view.state.selection.constructor.create(view.state.doc, from, to)
        );
        view.dispatch(tr);
        return true;
      },
      insertComment: () => true,
    },
    chain: () => ({
      setTextSelection: () => editor.chain(),
      scrollIntoView: () => editor.chain(),
      run: () => {},
    }),
  };

  // Update state getter to always return current state
  Object.defineProperty(editor, "state", {
    get: () => view.state,
  });

  return editor;
}

/**
 * Cleanup helper for test editors
 */
function destroyTestEditor(editor: SuperDocEditor) {
  editor.view.destroy();
  const container = editor.view.dom.parentElement;
  if (container && container.parentElement) {
    container.parentElement.removeChild(container);
  }
}

/**
 * Creates a position map from editor content
 */
function createPositionMap(editor: SuperDocEditor): PositionMap {
  const charToPos: number[] = [];
  let text = "";

  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) {
        charToPos.push(pos + i);
      }
      text += node.text;
    }
    return true;
  });

  return { text, charToPos };
}

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
        change: { id: "1", type: "insertion", content: "a", charStart: 5, charEnd: 6 },
        pmFrom: 10,
        pmTo: 11,
      },
      {
        change: { id: "2", type: "insertion", content: "b", charStart: 25, charEnd: 26 },
        pmFrom: 50,
        pmTo: 51,
      },
      {
        change: { id: "3", type: "insertion", content: "c", charStart: 15, charEnd: 16 },
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
        change: { id: "1", type: "insertion", content: "a", charStart: 5, charEnd: 6 },
        pmFrom: 10,
        pmTo: 11,
      },
      {
        change: { id: "2", type: "insertion", content: "b", charStart: 25, charEnd: 26 },
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

  it("handles modifications with same position", () => {
    const modifications: DocumentModification[] = [
      {
        change: { id: "1", type: "insertion", content: "a", charStart: 5, charEnd: 6 },
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
    const modifications: DocumentModification[] = [
      {
        change: { id: "1", type: "insertion", content: "big ", charStart: 0, charEnd: 4 },
        pmFrom: 1,
        pmTo: 1,
      },
      {
        change: { id: "2", type: "insertion", content: "beautiful ", charStart: 6, charEnd: 16 },
        pmFrom: 7,
        pmTo: 7,
      },
    ];

    const sorted = sortModificationsForApplication(modifications);

    expect(sorted[0].pmFrom).toBe(7);
    expect(sorted[0].change.content).toBe("beautiful ");
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
        change: { id: "ins-1", type: "insertion", content: "added", charStart: 5, charEnd: 10 },
        pmFrom: 6,
        pmTo: 11,
      },
    ];

    const sorted = sortModificationsForApplication(modifications);

    expect(sorted[0].pmFrom).toBe(30);
    expect(sorted[0].isDeletion).toBe(true);
    expect(sorted[0].contextRange).toEqual({ from: 23, to: 30 });
    expect(sorted[0].change.id).toBe("del-1");
    expect(sorted[0].change.contextBefore).toBe("prefix ");

    expect(sorted[1].pmFrom).toBe(6);
    expect(sorted[1].pmTo).toBe(11);
    expect(sorted[1].change.id).toBe("ins-1");
  });
});

// =============================================================================
// buildModifications (with real editor)
// =============================================================================

describe("buildModifications", () => {
  let editor: SuperDocEditor;

  afterEach(() => {
    if (editor) {
      destroyTestEditor(editor);
    }
  });

  it("maps insertion changes to ProseMirror positions", () => {
    editor = createTestEditor("Hello world");
    const posMap = createPositionMap(editor);

    const changes: ChangeWithPosition[] = [
      {
        id: "ins-1",
        type: "insertion",
        content: "Hello",
        charStart: 0,
        charEnd: 5,
      },
    ];

    const modifications = buildModifications(editor, changes, posMap);

    expect(modifications).toHaveLength(1);
    expect(modifications[0].change.id).toBe("ins-1");
    expect(modifications[0].pmFrom).toBe(posMap.charToPos[0]);
    expect(modifications[0].pmTo).toBe(posMap.charToPos[4] + 1);
  });

  it("maps multiple insertion changes", () => {
    editor = createTestEditor("Hello beautiful world");
    const posMap = createPositionMap(editor);

    const changes: ChangeWithPosition[] = [
      {
        id: "ins-1",
        type: "insertion",
        content: "Hello ",
        charStart: 0,
        charEnd: 6,
      },
      {
        id: "ins-2",
        type: "insertion",
        content: "beautiful ",
        charStart: 6,
        charEnd: 16,
      },
    ];

    const modifications = buildModifications(editor, changes, posMap);

    expect(modifications).toHaveLength(2);
    expect(modifications[0].change.id).toBe("ins-1");
    expect(modifications[1].change.id).toBe("ins-2");
  });

  it("maps replacement changes to ProseMirror positions", () => {
    editor = createTestEditor("Hello world");
    const posMap = createPositionMap(editor);

    const changes: ChangeWithPosition[] = [
      {
        id: "rep-1",
        type: "replacement",
        content: "world",
        oldContent: "there",
        charStart: 6,
        charEnd: 11,
      },
    ];

    const modifications = buildModifications(editor, changes, posMap);

    expect(modifications).toHaveLength(1);
    expect(modifications[0].change.type).toBe("replacement");
    expect(modifications[0].pmFrom).toBe(posMap.charToPos[6]);
  });

  it("maps deletion changes using context search", () => {
    editor = createTestEditor("Hello world");
    const posMap = createPositionMap(editor);

    const changes: ChangeWithPosition[] = [
      {
        id: "del-1",
        type: "deletion",
        content: "beautiful ",
        insertAt: 6,
        contextBefore: "Hello ", // This context exists in the document
      },
    ];

    const modifications = buildModifications(editor, changes, posMap);

    expect(modifications).toHaveLength(1);
    expect(modifications[0].isDeletion).toBe(true);
  });

  it("falls back to position mapping for deletions without context", () => {
    editor = createTestEditor("Hello world");
    const posMap = createPositionMap(editor);

    const changes: ChangeWithPosition[] = [
      {
        id: "del-1",
        type: "deletion",
        content: "x",
        insertAt: 5,
        contextBefore: "xy", // Short context
      },
    ];

    const modifications = buildModifications(editor, changes, posMap);

    expect(modifications).toHaveLength(1);
    expect(modifications[0].isDeletion).toBe(true);
    expect(modifications[0].pmFrom).toBe(posMap.charToPos[5]);
  });

  it("handles empty changes array", () => {
    editor = createTestEditor("Hello");
    const posMap = createPositionMap(editor);

    const modifications = buildModifications(editor, [], posMap);

    expect(modifications).toHaveLength(0);
  });

  it("skips changes with invalid position mappings", () => {
    editor = createTestEditor("Hi");
    const posMap = createPositionMap(editor);

    const changes: ChangeWithPosition[] = [
      {
        id: "ins-1",
        type: "insertion",
        content: "test",
        charStart: 100, // Beyond document length
        charEnd: 104,
      },
    ];

    const modifications = buildModifications(editor, changes, posMap);

    expect(modifications).toHaveLength(0);
  });

  it("handles mixed change types", () => {
    editor = createTestEditor("Hello world test");
    const posMap = createPositionMap(editor);

    const changes: ChangeWithPosition[] = [
      {
        id: "ins-1",
        type: "insertion",
        content: "world ",
        charStart: 6,
        charEnd: 12,
      },
      {
        id: "del-1",
        type: "deletion",
        content: "removed",
        insertAt: 0,
        contextBefore: "Hello",
      },
      {
        id: "rep-1",
        type: "replacement",
        content: "test",
        oldContent: "exam",
        charStart: 12,
        charEnd: 16,
      },
    ];

    const modifications = buildModifications(editor, changes, posMap);

    expect(modifications).toHaveLength(3);

    const insertion = modifications.find((m) => m.change.id === "ins-1");
    const deletion = modifications.find((m) => m.change.id === "del-1");
    const replacement = modifications.find((m) => m.change.id === "rep-1");

    expect(insertion).toBeDefined();
    expect(insertion!.change.type).toBe("insertion");

    expect(deletion).toBeDefined();
    expect(deletion!.isDeletion).toBe(true);

    expect(replacement).toBeDefined();
    expect(replacement!.change.type).toBe("replacement");
  });
});

// =============================================================================
// applyFormattingTrackChanges (with real editor)
// =============================================================================

describe("applyFormattingTrackChanges", () => {
  let editor: SuperDocEditor;

  afterEach(() => {
    if (editor) {
      destroyTestEditor(editor);
    }
  });

  it("applies formatting changes and adds trackFormat marks to document", () => {
    editor = createTestEditor("Hello world");
    const posMap = createPositionMap(editor);

    const changes: FormattingChangeWithPosition[] = [
      {
        id: "fmt-1",
        type: "formatAdded",
        content: "Hello",
        markType: "bold",
        charStart: 0,
        charEnd: 5,
      },
    ];

    const result = applyFormattingTrackChanges(editor, changes, posMap);

    expect(result.successCount).toBe(1);
    expect(result.totalCount).toBe(1);
    expect(result.errors).toHaveLength(0);

    // Verify the mark was actually added to the document
    let foundMark = false;
    editor.state.doc.descendants((node) => {
      if (node.isText) {
        for (const mark of node.marks) {
          if (mark.type.name === "trackFormat") {
            foundMark = true;
            expect(mark.attrs.id).toBe("fmt-1");
            expect(mark.attrs.changeType).toBe("formatAdded");
            expect(mark.attrs.markType).toBe("bold");
          }
        }
      }
      return true;
    });

    expect(foundMark).toBe(true);
  });

  it("applies multiple formatting changes", () => {
    editor = createTestEditor("Hello world test");
    const posMap = createPositionMap(editor);

    const changes: FormattingChangeWithPosition[] = [
      {
        id: "fmt-1",
        type: "formatAdded",
        content: "Hello",
        markType: "bold",
        charStart: 0,
        charEnd: 5,
      },
      {
        id: "fmt-2",
        type: "formatAdded",
        content: "world",
        markType: "italic",
        charStart: 6,
        charEnd: 11,
      },
      {
        id: "fmt-3",
        type: "formatRemoved",
        content: "test",
        markType: "bold",
        charStart: 12,
        charEnd: 16,
      },
    ];

    const result = applyFormattingTrackChanges(editor, changes, posMap);

    expect(result.successCount).toBe(3);
    expect(result.totalCount).toBe(3);
    expect(result.errors).toHaveLength(0);

    // Count trackFormat marks in document
    let markCount = 0;
    editor.state.doc.descendants((node) => {
      if (node.isText) {
        for (const mark of node.marks) {
          if (mark.type.name === "trackFormat") {
            markCount++;
          }
        }
      }
      return true;
    });

    expect(markCount).toBe(3);
  });

  it("handles empty changes array", () => {
    editor = createTestEditor("Hello");
    const posMap = createPositionMap(editor);

    const result = applyFormattingTrackChanges(editor, [], posMap);

    expect(result.successCount).toBe(0);
    expect(result.totalCount).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("reports errors for changes with invalid position mappings", () => {
    editor = createTestEditor("Hi");
    const posMap = createPositionMap(editor);

    const changes: FormattingChangeWithPosition[] = [
      {
        id: "fmt-1",
        type: "formatAdded",
        content: "test",
        markType: "bold",
        charStart: 100, // Beyond document
        charEnd: 104,
      },
    ];

    const result = applyFormattingTrackChanges(editor, changes, posMap);

    expect(result.successCount).toBe(0);
    expect(result.totalCount).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Position mapping failed");
  });

  it("uses custom user attribution", () => {
    editor = createTestEditor("Hello");
    const posMap = createPositionMap(editor);

    const customUser: TrackChangeUser = {
      name: "Test User",
      email: "test@example.com",
      image: "avatar.png",
    };

    const changes: FormattingChangeWithPosition[] = [
      {
        id: "fmt-1",
        type: "formatAdded",
        content: "Hello",
        markType: "bold",
        charStart: 0,
        charEnd: 5,
      },
    ];

    const result = applyFormattingTrackChanges(editor, changes, posMap, customUser);

    expect(result.successCount).toBe(1);

    // Verify the mark has custom user attribution
    let foundMark = false;
    editor.state.doc.descendants((node) => {
      if (node.isText) {
        for (const mark of node.marks) {
          if (mark.type.name === "trackFormat") {
            foundMark = true;
            expect(mark.attrs.author).toBe("Test User");
            expect(mark.attrs.authorEmail).toBe("test@example.com");
            expect(mark.attrs.authorImage).toBe("avatar.png");
          }
        }
      }
      return true;
    });

    expect(foundMark).toBe(true);
  });

  it("uses default COMPARISON_USER when no user provided", () => {
    editor = createTestEditor("Hello");
    const posMap = createPositionMap(editor);

    const changes: FormattingChangeWithPosition[] = [
      {
        id: "fmt-1",
        type: "formatAdded",
        content: "Hello",
        markType: "bold",
        charStart: 0,
        charEnd: 5,
      },
    ];

    applyFormattingTrackChanges(editor, changes, posMap);

    // Verify default user
    editor.state.doc.descendants((node) => {
      if (node.isText) {
        for (const mark of node.marks) {
          if (mark.type.name === "trackFormat") {
            expect(mark.attrs.author).toBe(COMPARISON_USER.name);
            expect(mark.attrs.authorEmail).toBe(COMPARISON_USER.email);
          }
        }
      }
      return true;
    });
  });

  it("includes change details in mark attributes", () => {
    editor = createTestEditor("Hello");
    const posMap = createPositionMap(editor);

    const changes: FormattingChangeWithPosition[] = [
      {
        id: "fmt-1",
        type: "formatModified",
        content: "Hello",
        markType: "textStyle",
        charStart: 0,
        charEnd: 5,
        oldAttrs: { color: "red" },
        newAttrs: { color: "blue" },
      },
    ];

    applyFormattingTrackChanges(editor, changes, posMap);

    // Verify change details are in mark
    editor.state.doc.descendants((node) => {
      if (node.isText) {
        for (const mark of node.marks) {
          if (mark.type.name === "trackFormat") {
            expect(mark.attrs.id).toBe("fmt-1");
            expect(mark.attrs.changeType).toBe("formatModified");
            expect(mark.attrs.markType).toBe("textStyle");
            expect(mark.attrs.oldAttrs).toBe(JSON.stringify({ color: "red" }));
            expect(mark.attrs.newAttrs).toBe(JSON.stringify({ color: "blue" }));
          }
        }
      }
      return true;
    });
  });

  it("applies changes in descending position order", () => {
    editor = createTestEditor("Hello world test");
    const posMap = createPositionMap(editor);

    // Provide changes in ascending order
    const changes: FormattingChangeWithPosition[] = [
      {
        id: "fmt-first",
        type: "formatAdded",
        content: "Hello",
        markType: "bold",
        charStart: 0, // First position
        charEnd: 5,
      },
      {
        id: "fmt-last",
        type: "formatAdded",
        content: "test",
        markType: "italic",
        charStart: 12, // Last position
        charEnd: 16,
      },
      {
        id: "fmt-middle",
        type: "formatAdded",
        content: "world",
        markType: "bold",
        charStart: 6, // Middle position
        charEnd: 11,
      },
    ];

    const result = applyFormattingTrackChanges(editor, changes, posMap);

    // All should succeed regardless of input order
    expect(result.successCount).toBe(3);
    expect(result.errors).toHaveLength(0);

    // Verify all marks are present
    const markIds: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.isText) {
        for (const mark of node.marks) {
          if (mark.type.name === "trackFormat") {
            markIds.push(mark.attrs.id);
          }
        }
      }
      return true;
    });

    expect(markIds).toContain("fmt-first");
    expect(markIds).toContain("fmt-middle");
    expect(markIds).toContain("fmt-last");
  });

  it("preserves existing document content when applying marks", () => {
    editor = createTestEditor("Hello world");
    const posMap = createPositionMap(editor);
    const originalText = editor.state.doc.textContent;

    const changes: FormattingChangeWithPosition[] = [
      {
        id: "fmt-1",
        type: "formatAdded",
        content: "Hello",
        markType: "bold",
        charStart: 0,
        charEnd: 5,
      },
    ];

    applyFormattingTrackChanges(editor, changes, posMap);

    // Document text should be unchanged
    expect(editor.state.doc.textContent).toBe(originalText);
  });
});
