# Document Comparison Tool - Developer Guide

> A comprehensive guide for understanding how this document comparison tool works, how SuperDoc integrates with ProseMirror, and ideas for future improvements.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [How the Diff Algorithm Works](#how-the-diff-algorithm-works)
4. [Understanding SuperDoc](#understanding-superdoc)
5. [Track Changes System](#track-changes-system)
6. [Code Flow Walkthrough](#code-flow-walkthrough)
7. [Key Files and Their Responsibilities](#key-files-and-their-responsibilities)
8. [Future Improvements: VS Code Style Comparison](#future-improvements-vs-code-style-comparison)
9. [Troubleshooting Common Issues](#troubleshooting-common-issues)

---

## Project Overview

This tool compares two DOCX documents and visualizes the differences using track changes (similar to Microsoft Word's "Track Changes" feature). Users can:

- Upload two documents (original and modified)
- See insertions highlighted in green
- See deletions shown with strikethrough in red
- Navigate to specific changes via a sidebar
- Export the annotated document

```
┌─────────────────────────────────────────────────────────────────┐
│                    Document Comparison Tool                      │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────┐  ┌─────────────────────────┐  │
│  │                              │  │     Changes Sidebar     │  │
│  │     SuperDoc Editor          │  ├─────────────────────────┤  │
│  │     (Modified Document)      │  │  + 1  Added "NDA"       │  │
│  │                              │  │  - 2  Removed "SERVICE" │  │
│  │  Shows:                      │  │  ↔ 3  Replaced "old"    │  │
│  │  - Insertions (green)        │  │       with "new"        │  │
│  │  - Deletions (strikethrough) │  │                         │  │
│  │  - Original formatting       │  │  Click to navigate →    │  │
│  │                              │  │                         │  │
│  └──────────────────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              User Interface                              │
│                         (DocumentComparison.tsx)                         │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            Document Loading                              │
├──────────────────────────────────┬──────────────────────────────────────┤
│      Main SuperDoc Instance      │      Hidden SuperDoc Instance        │
│      (Modified Document)         │      (Original Document)             │
│      - Visible to user           │      - Off-screen                    │
│      - Editable                  │      - View-only                     │
│      - Receives track changes    │      - Text extraction only          │
└──────────────────────────────────┴──────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Text Extraction                                │
│                        (text-extraction.ts)                              │
├─────────────────────────────────────────────────────────────────────────┤
│  Original Text (from JSON)    │    Modified Text + Position Map         │
│  "SERVICE CONTRACT..."        │    "NDA CONTRACT..." + char→pos mapping │
└───────────────────────────────┴─────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Diff Computation                               │
│                         (diff-computation.ts)                            │
├─────────────────────────────────────────────────────────────────────────┤
│  Uses `diffChars` library to compute character-level differences         │
│  Output: Array of ChangeWithPosition objects                             │
│  - { type: "insertion", content: "NDA", charStart: 0, charEnd: 3 }      │
│  - { type: "deletion", content: "SERVICE", insertAt: 0 }                │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Track Changes Application                         │
│                          (track-changes.ts)                              │
├─────────────────────────────────────────────────────────────────────────┤
│  Maps character positions → ProseMirror positions                        │
│  Applies track change marks to the document:                             │
│  - trackInsert mark for new text                                         │
│  - trackDelete mark for removed text (inserted back with strikethrough) │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Diagram

```
   ORIGINAL.docx                              MODIFIED.docx
        │                                          │
        ▼                                          ▼
  ┌───────────┐                              ┌───────────┐
  │  Hidden   │                              │   Main    │
  │ SuperDoc  │                              │ SuperDoc  │
  └───────────┘                              └───────────┘
        │                                          │
        ▼                                          ▼
  ┌───────────┐                              ┌───────────┐
  │  getJSON  │                              │  Editor   │
  │  (JSON)   │                              │  (Live)   │
  └───────────┘                              └───────────┘
        │                                          │
        ▼                                          ▼
  ┌───────────┐                              ┌───────────────┐
  │ Extract   │                              │ Extract Text  │
  │ Text      │                              │ + Position    │
  │           │                              │ Map           │
  └───────────┘                              └───────────────┘
        │                                          │
        └──────────────┬───────────────────────────┘
                       ▼
              ┌─────────────────┐
              │   diffChars()   │
              │   Compute Diff  │
              └─────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │   Changes[]     │
              │   - insertions  │
              │   - deletions   │
              │   - replacements│
              └─────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Apply Track     │
              │ Changes to      │
              │ Main Editor     │
              └─────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Visual Result   │
              │ Green = Added   │
              │ Red = Removed   │
              └─────────────────┘
```

---

## How the Diff Algorithm Works

### Step 1: Text Extraction

We extract plain text from both documents. The challenge is maintaining a mapping between character positions in the extracted text and positions in the ProseMirror document.

```typescript
// From text-extraction.ts

// For the ORIGINAL document (hidden), we just need the text:
const originalText = extractTextFromJson(originalJson);
// Result: "SERVICE CONTRACT entered into..."

// For the MODIFIED document (live editor), we need text AND positions:
const posMap = extractTextWithPositions(editor);
// Result: {
//   text: "NDA CONTRACT entered into...",
//   charToPos: [1, 2, 3, 4, ...] // Maps each char index to ProseMirror position
// }
```

**Why do we need position mapping?**

ProseMirror uses a different position system than plain character indices. Every node (paragraph, text, etc.) has a size that includes structural characters:

```
Document: "Hello World"

Plain text positions:    H  e  l  l  o     W  o  r  l  d
                         0  1  2  3  4  5  6  7  8  9  10

ProseMirror positions:   <p> H  e  l  l  o     W  o  r  l  d  </p>
                         0   1  2  3  4  5  6  7  8  9  10 11  12
                         ↑                                     ↑
                    Node start                            Node end
```

### Step 2: Character-Level Diff

We use the `diff` library's `diffChars` function to compare the two texts:

```typescript
import { diffChars } from "diff";

const diffs = diffChars(originalText, modifiedText);

// Example result for "SERVICE CONTRACT" → "NDA CONTRACT":
[
  { value: "SERVICE", removed: true },   // Deleted
  { value: "NDA", added: true },         // Added
  { value: " CONTRACT...", }             // Unchanged
]
```

### Step 3: Tracking Positions

As we iterate through the diff results, we track our position in the modified text:

```
Original: "SERVICE CONTRACT"
Modified: "NDA CONTRACT"

Diff iteration:
┌─────────────┬──────────┬─────────────────┬───────────────────┐
│ Diff Part   │ Type     │ Modified Index  │ Action            │
├─────────────┼──────────┼─────────────────┼───────────────────┤
│ "SERVICE"   │ removed  │ 0 (no advance)  │ Create deletion   │
│ "NDA"       │ added    │ 0 → 3           │ Create insertion  │
│ " CONTRACT" │ unchanged│ 3 → 12          │ Skip              │
└─────────────┴──────────┴─────────────────┴───────────────────┘
```

### Step 4: Creating Change Objects

```typescript
// Insertion (text exists in modified, not in original)
{
  id: "change-0",
  type: "insertion",
  content: "NDA",
  charStart: 0,    // Position in modified text
  charEnd: 3,      // Position in modified text
}

// Deletion (text exists in original, not in modified)
{
  id: "change-1",
  type: "deletion",
  content: "SERVICE",
  insertAt: 0,           // Where to insert in modified text
  contextBefore: "...",  // For finding the exact position
}

// Replacement (old text replaced with new text)
{
  id: "change-2",
  type: "replacement",
  content: "new text",      // The new text
  oldContent: "old text",   // The original text
  charStart: 10,
  charEnd: 18,
}
```

---

## Understanding SuperDoc

### What is SuperDoc?

SuperDoc is a document editor built on top of **ProseMirror** and **TipTap**. It provides:

- DOCX file loading and rendering
- Rich text editing
- Track changes (like Microsoft Word)
- Comments
- Pagination
- Export capabilities

### SuperDoc Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         SuperDoc                                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   PresentationEditor                     │    │
│  │  - Handles pagination (page breaks)                      │    │
│  │  - Manages scrolling                                     │    │
│  │  - Contains visibleHost (what user sees)                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Super Editor                          │    │
│  │  (TipTap/ProseMirror Editor)                             │    │
│  │  - Contains the actual document content                  │    │
│  │  - Manages editor state and transactions                 │    │
│  │  - Provides commands (search, setTextSelection, etc.)    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   ProseMirror Core                       │    │
│  │  - EditorState: Document state, selection, marks         │    │
│  │  - EditorView: DOM rendering and event handling          │    │
│  │  - Schema: Defines allowed nodes and marks               │    │
│  │  - Transaction: Immutable state updates                  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Key SuperDoc Concepts

#### 1. Document Modes

```typescript
// Three modes available:
documentMode: "editing"    // Full editing capabilities
documentMode: "viewing"    // Read-only
documentMode: "suggesting" // Track all changes as suggestions
```

#### 2. ProseMirror Editor Structure

```typescript
const editor = superdoc.activeEditor;

// Access the document state
editor.state          // Current EditorState
editor.state.doc      // The document (ProseMirror Node)
editor.state.tr       // Create a new transaction

// Access the view (DOM representation)
editor.view           // EditorView instance
editor.view.dispatch  // Apply transactions

// Access the schema (document structure rules)
editor.schema         // Defines nodes and marks
editor.schema.marks   // Available mark types (bold, trackInsert, etc.)
```

#### 3. Marks vs Nodes

```
ProseMirror Document Structure:

┌─────────────────────────────────────────────────────────────┐
│ Document (Node)                                             │
│  ├── Paragraph (Node)                                       │
│  │    ├── Text "Hello " (Node)                              │
│  │    ├── Text "World" (Node) [marks: bold, trackInsert]    │
│  │    └── Text "!" (Node)                                   │
│  └── Paragraph (Node)                                       │
│       └── Text "Another paragraph" (Node)                   │
└─────────────────────────────────────────────────────────────┘

Nodes = Structural elements (paragraphs, headings, tables, etc.)
Marks = Inline formatting (bold, italic, trackInsert, trackDelete, etc.)
```

#### 4. Transactions

All changes to a ProseMirror document happen through **transactions**:

```typescript
// Get current transaction
let tr = editor.state.tr;

// Make changes (returns new transaction)
tr = tr.addMark(from, to, mark);        // Add a mark (like trackInsert)
tr = tr.insert(pos, node);              // Insert content
tr = tr.delete(from, to);               // Delete content
tr = tr.replaceSelectionWith(node);     // Replace selection

// Apply the transaction (updates the document)
editor.view.dispatch(tr);
```

---

## Track Changes System

### How Track Changes Work

SuperDoc uses special marks to track changes:

```
Mark Types:
├── trackInsert  → Green underline (text was added)
├── trackDelete  → Red strikethrough (text was removed)
└── trackFormat  → Format change indicator
```

### Visual Representation

```
Original: "The quick brown fox"
Modified: "The slow red fox"

After applying track changes:

"The [quick](strikethrough/red) [slow](underline/green) [brown](strikethrough/red) [red](underline/green) fox"

Visual result:
┌─────────────────────────────────────────────────────────┐
│ The q̶u̶i̶c̶k̶ slow b̶r̶o̶w̶n̶ red fox                         │
│     └─┬─┘  └─┬─┘ └──┬──┘ └┬┘                            │
│       │      │      │     │                              │
│   Deleted  Added  Deleted Added                          │
│   (red)   (green) (red)  (green)                         │
└─────────────────────────────────────────────────────────┘
```

### Applying Track Changes in Code

```typescript
// From track-changes.ts

// 1. For INSERTIONS: Mark existing text with trackInsert
function applyInsertion(tr, change, pmFrom, pmTo, trackInsertMark, user, date) {
  const insertMark = trackInsertMark.create({
    id: `insert-${change.id}`,
    author: user.name,
    authorEmail: user.email,
    date: date,
  });
  return tr.addMark(pmFrom, pmTo, insertMark);
}

// 2. For DELETIONS: Insert the deleted text WITH trackDelete mark
function applyDeletion(tr, change, pmFrom, schema, trackDeleteMark, user, date) {
  const deleteMark = trackDeleteMark.create({
    id: `delete-${change.id}`,
    author: user.name,
    date: date,
  });

  // Create text node with the delete mark
  const deletedTextNode = schema.text(change.content, [deleteMark]);

  // Insert at the position where it was deleted
  return tr.insert(pmFrom, deletedTextNode);
}
```

### Why Deletions Are "Inserted"

This is a key concept that can be confusing:

```
ORIGINAL document: "Hello World"
MODIFIED document: "Hello"        (World was deleted)

To SHOW what was deleted, we need to INSERT "World" back into the
modified document, but marked with trackDelete so it appears
with strikethrough.

Before track changes:  "Hello"
After track changes:   "Hello World"
                             └──┬──┘
                           Inserted with trackDelete mark
                           (shows as strikethrough)
```

---

## Code Flow Walkthrough

### Complete Flow: Document Comparison

```
1. USER UPLOADS TWO DOCUMENTS
   │
   ▼
2. DocumentComparison.tsx MOUNTS
   │
   ├─► Create Main SuperDoc (modified.docx)
   │   └─► documentMode: "editing"
   │   └─► onReady: store modifiedJson
   │
   └─► Create Hidden SuperDoc (original.docx)
       └─► documentMode: "viewing"
       └─► onReady: store originalJson
   │
   ▼
3. BOTH DOCUMENTS LOADED → onBothLoaded()
   │
   ├─► Extract original text from JSON
   │   └─► extractTextFromJson(originalJson)
   │
   ├─► Extract modified text + position map from live editor
   │   └─► extractTextWithPositions(editor)
   │
   ├─► Compute differences
   │   └─► computeChangesWithPositions(originalText, modifiedText)
   │
   └─► Apply track changes (after 300ms delay)
       └─► applyTrackChanges(editor, changes, posMap)
   │
   ▼
4. TRACK CHANGES APPLIED
   │
   ├─► For each insertion: Add trackInsert mark
   ├─► For each deletion: Insert text with trackDelete mark
   └─► For each replacement: Both marks
   │
   ▼
5. USER SEES VISUAL DIFF
   │
   ├─► Green underline = Added text
   ├─► Red strikethrough = Removed text
   └─► Sidebar shows list of all changes
```

### Key Function: `applyTrackChanges`

```typescript
export function applyTrackChanges(
  editor: SuperDocEditor,
  changes: ChangeWithPosition[],
  posMap: PositionMap
): TrackChangesResult {

  // 1. Get track change mark types from schema
  const trackInsertMark = editor.schema.marks.trackInsert;
  const trackDeleteMark = editor.schema.marks.trackDelete;

  // 2. Build modifications with ProseMirror positions
  const modifications = buildModifications(editor, changes, posMap);

  // 3. Sort by position (descending) - apply from end to start
  //    This prevents position shifts from affecting later changes
  const sortedMods = sortModificationsForApplication(modifications);

  // 4. Apply all modifications in a single transaction
  let tr = editor.state.tr;

  for (const mod of sortedMods) {
    tr = applyModification(tr, mod, schema, trackInsertMark, trackDeleteMark);
  }

  // 5. Dispatch the transaction to update the document
  editor.view.dispatch(tr);
}
```

---

## Key Files and Their Responsibilities

```
app/
├── components/
│   └── DocumentComparison.tsx    # Main UI component
│       - Loads both SuperDoc instances
│       - Orchestrates the comparison flow
│       - Renders editor and sidebar
│       - Handles navigation and export
│
└── lib/
    └── document-diff/
        ├── index.ts              # Public API exports
        │
        ├── types.ts              # TypeScript type definitions
        │   - ProseMirror types
        │   - SuperDoc editor interface
        │   - Change and diff types
        │
        ├── text-extraction.ts    # Text extraction utilities
        │   - extractTextFromJson(): Get text from JSON
        │   - extractTextWithPositions(): Get text + position map
        │
        ├── diff-computation.ts   # Diff algorithm
        │   - computeChangesWithPositions(): Main diff function
        │   - Creates insertion, deletion, replacement objects
        │
        └── track-changes.ts      # Apply track changes
            - applyTrackChanges(): Main entry point
            - buildModifications(): Map changes to positions
            - applyInsertion/Deletion/Replacement(): Apply marks
            - navigateToChange(): Scroll to a change
```

---

## Future Improvements: VS Code Style Comparison

### Current vs VS Code Approach

```
CURRENT APPROACH (Single Document View):
┌─────────────────────────────────────────────────────────────┐
│  "The q̶u̶i̶c̶k̶ slow b̶r̶o̶w̶n̶ red fox"                           │
│                                                             │
│  - Shows modified document                                  │
│  - Deletions inserted inline with strikethrough             │
│  - Can be cluttered with many changes                       │
└─────────────────────────────────────────────────────────────┘

VS CODE APPROACH (Side-by-Side):
┌────────────────────────┬────────────────────────┐
│  ORIGINAL              │  MODIFIED              │
├────────────────────────┼────────────────────────┤
│  The quick brown fox   │  The slow red fox      │
│      └────┬────┘       │      └───┬───┘         │
│       Highlighted      │      Highlighted       │
│       (deleted)        │      (added)           │
│                        │                        │
│  Line 5: old content   │  Line 5: new content   │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   │
└────────────────────────┴────────────────────────┘
```

### Implementation Ideas for VS Code Style

#### 1. Side-by-Side View

```typescript
// Component structure for side-by-side view
function SideBySideComparison({ originalBase64, modifiedBase64 }) {
  return (
    <div className="flex">
      {/* Left: Original document (read-only) */}
      <div className="flex-1 border-r">
        <SuperDoc
          document={originalBase64}
          documentMode="viewing"
          highlights={deletionHighlights}  // Red background
        />
      </div>

      {/* Right: Modified document (read-only) */}
      <div className="flex-1">
        <SuperDoc
          document={modifiedBase64}
          documentMode="viewing"
          highlights={insertionHighlights}  // Green background
        />
      </div>
    </div>
  );
}
```

#### 2. Synchronized Scrolling

```typescript
// Sync scroll positions between two editors
function useSyncScroll(leftEditor, rightEditor) {
  useEffect(() => {
    const handleScroll = (source, target) => {
      const scrollRatio = source.scrollTop / source.scrollHeight;
      target.scrollTop = scrollRatio * target.scrollHeight;
    };

    leftEditor.on('scroll', () => handleScroll(leftEditor, rightEditor));
    rightEditor.on('scroll', () => handleScroll(rightEditor, leftEditor));
  }, []);
}
```

#### 3. Line-by-Line Diff with Gutter

```
┌──────┬─────────────────────┬──────┬─────────────────────┐
│ Line │ Original            │ Line │ Modified            │
├──────┼─────────────────────┼──────┼─────────────────────┤
│  1   │ SERVICE CONTRACT    │  1   │ NDA CONTRACT        │
│  -   │▓▓▓▓▓▓▓             │  +   │▓▓▓                  │
├──────┼─────────────────────┼──────┼─────────────────────┤
│  2   │ Contract No. ___    │  2   │ Contract No. 123    │
│      │            ▓▓▓      │  ~   │            ▓▓▓      │
├──────┼─────────────────────┼──────┼─────────────────────┤
│  3   │ This agreement...   │  3   │ This agreement...   │
│      │                     │      │                     │
└──────┴─────────────────────┴──────┴─────────────────────┘

Legend:
  ▓ = Changed characters (highlighted)
  - = Line deleted
  + = Line added
  ~ = Line modified
```

#### 4. Minimap with Change Indicators

```typescript
// Show a minimap with colored markers for changes
function DiffMinimap({ changes, documentHeight }) {
  return (
    <div className="absolute right-0 w-4 h-full bg-gray-100">
      {changes.map(change => {
        const top = (change.position / documentHeight) * 100;
        const color = change.type === 'insertion' ? 'green' : 'red';

        return (
          <div
            key={change.id}
            className={`absolute w-full h-1 bg-${color}-500`}
            style={{ top: `${top}%` }}
            onClick={() => scrollToChange(change)}
          />
        );
      })}
    </div>
  );
}
```

#### 5. Inline Diff Mode (Character-level highlighting)

```
Current: Shows entire words as added/deleted
VS Code: Highlights exact characters that changed

Example "Hello World" → "Hello Word":

Current:  "Hello W̶o̶r̶l̶d̶ Word"  (whole words)
VS Code:  "Hello Wor▓d"          (just the 'l' highlighted)
                   ↑
             Only changed char
```

#### 6. Unified Diff View (Git style)

```
@@ -1,5 +1,5 @@
 This is the document title
-SERVICE CONTRACT
+NDA CONTRACT

 Contract entered into as of
-_________________ by and between
+January 1, 2024 by and between
```

### Recommended Architecture for VS Code Style

```
┌─────────────────────────────────────────────────────────────────┐
│                     DiffViewer Component                         │
├─────────────────────────────────────────────────────────────────┤
│  ViewMode: [ Unified | Side-by-Side | Inline ]                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    DiffEngine                            │    │
│  │  - Computes structural diff (not just text)              │    │
│  │  - Tracks line changes, not just character changes       │    │
│  │  - Maps changes to both documents                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│           ┌──────────────────┼──────────────────┐               │
│           ▼                  ▼                  ▼               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ UnifiedView │    │ SplitView   │    │ InlineView  │         │
│  │ (git diff)  │    │ (VS Code)   │    │ (Word-like) │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Shared Features                       │    │
│  │  - Minimap with change indicators                        │    │
│  │  - Change navigation (prev/next)                         │    │
│  │  - Line numbers with indicators                          │    │
│  │  - Synchronized scrolling                                │    │
│  │  - Accept/Reject changes                                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting Common Issues

### Issue 1: Positions Don't Match

**Symptom**: Track changes appear in wrong locations

**Cause**: ProseMirror positions include structural nodes (paragraphs, etc.)

**Solution**: Always use the position map from `extractTextWithPositions`

```typescript
// WRONG: Using character index directly
editor.commands.setTextSelection({ from: charIndex, to: charIndex + length });

// CORRECT: Map through position map
const pmFrom = posMap.charToPos[charIndex];
const pmTo = posMap.charToPos[charIndex + length - 1] + 1;
editor.commands.setTextSelection({ from: pmFrom, to: pmTo });
```

### Issue 2: Changes Applied in Wrong Order

**Symptom**: Some changes are missing or in wrong positions

**Cause**: Applying changes from start to end shifts positions

**Solution**: Always apply changes from END to START

```typescript
// Sort by position DESCENDING
const sortedChanges = changes.sort((a, b) => b.position - a.position);
```

### Issue 3: Formatting Lost After Track Changes

**Symptom**: Bold, italic, etc. disappear after applying track changes

**Cause**: Inserted text doesn't inherit surrounding formatting

**Solution**: Copy formatting marks from surrounding text

```typescript
// Get marks from nearby text
const formattingMarks = getFormattingMarks(tr, position);

// Apply those marks to inserted text
const textNode = schema.text(content, [...formattingMarks, trackDeleteMark]);
```

### Issue 4: Scroll Navigation Doesn't Work

**Symptom**: Clicking on a change doesn't scroll to it

**Cause**: SuperDoc uses a "hidden host" + "visible pages" architecture

**Solution**: Find the actual scroll container and use position ratio

```typescript
// Find scroll container
const scrollContainer = findScrollContainer(editor.presentationEditor.visibleHost);

// Calculate scroll position based on document position ratio
const positionRatio = from / editor.state.doc.content.size;
const scrollTo = positionRatio * scrollContainer.scrollHeight;

scrollContainer.scrollTo({ top: scrollTo, behavior: 'smooth' });
```

---

## Glossary

| Term | Definition |
|------|------------|
| **ProseMirror** | The underlying editor framework that SuperDoc uses |
| **Transaction** | An immutable change to the document state |
| **Mark** | Inline formatting (bold, trackInsert, etc.) |
| **Node** | Structural element (paragraph, table, etc.) |
| **Position** | A point in the document (like a cursor position) |
| **Schema** | Defines what nodes and marks are allowed |
| **EditorState** | The current state of the document |
| **EditorView** | The DOM representation and event handling |

---

## Resources

- [ProseMirror Guide](https://prosemirror.net/docs/guide/)
- [TipTap Documentation](https://tiptap.dev/)
- [diff Library](https://github.com/kpdecker/jsdiff)
- [SuperDoc Documentation](https://harbour-enterprises.github.io/superdoc/)

---

*Last updated: January 2025*
