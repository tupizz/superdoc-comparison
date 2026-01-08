# How Document Diffing Works

> A step-by-step guide explaining exactly how we compare two DOCX documents and visualize the differences.

---

## Overview

We compare two documents by:
1. Loading both documents into SuperDoc editors
2. Extracting plain text from each
3. Running a character-level diff algorithm
4. Mapping text changes back to document positions
5. Applying visual track change marks

```mermaid
flowchart LR
    A[Original DOCX] --> B[Extract Text]
    C[Modified DOCX] --> D[Extract Text + Positions]
    B --> E[Diff Algorithm]
    D --> E
    E --> F[List of Changes]
    F --> G[Apply Track Marks]
    G --> H[Visual Result]
```

---

## Step 1: Loading the Documents

We create two SuperDoc instances - one visible, one hidden.

```mermaid
flowchart TB
    subgraph "User's Browser"
        subgraph "Visible Area"
            A[Main SuperDoc<br/>Modified Document<br/>mode: editing]
        end
        subgraph "Hidden Off-screen"
            B[Hidden SuperDoc<br/>Original Document<br/>mode: viewing]
        end
    end

    C[modified.docx] --> A
    D[original.docx] --> B
```

### Why Two Instances?

| Instance | Document | Purpose |
|----------|----------|---------|
| **Main** (visible) | Modified | User sees this, we apply track changes here |
| **Hidden** (off-screen) | Original | Only used to extract text for comparison |

### Code Location
```
DocumentComparison.tsx → useEffect() → lines 150-179
```

```typescript
// Main SuperDoc - shows MODIFIED document
mainSuperdoc = new SuperDoc({
  selector: "#superdoc-main",
  documents: [{ data: modifiedBase64, type: "docx" }],
  documentMode: "editing",
});

// Hidden SuperDoc - loads ORIGINAL document
hiddenSuperdoc = new SuperDoc({
  selector: "#superdoc-hidden",  // positioned off-screen with CSS
  documents: [{ data: originalBase64, type: "docx" }],
  documentMode: "viewing",
});
```

---

## Step 2: Extracting Text from Documents

Once both documents are loaded, we extract plain text from each.

```mermaid
flowchart TB
    subgraph "Original Document"
        A[SuperDoc Instance] --> B[editor.getJSON]
        B --> C[ProseMirror JSON]
        C --> D[extractTextFromJson]
        D --> E["Plain Text<br/>'SERVICE CONTRACT...'"]
    end

    subgraph "Modified Document"
        F[SuperDoc Instance] --> G[editor.state.doc]
        G --> H[Live ProseMirror Doc]
        H --> I[extractTextWithPositions]
        I --> J["Plain Text<br/>'NDA CONTRACT...'"]
        I --> K["Position Map<br/>[1,2,3,4,5...]"]
    end
```

### What is the Position Map?

The position map is crucial - it maps each character in our extracted text to its ProseMirror position.

```
Extracted text:    N   D   A       C   O   N   T   R   A   C   T
Character index:   0   1   2   3   4   5   6   7   8   9   10  11

ProseMirror pos:   1   2   3   4   5   6   7   8   9   10  11  12
                   ↑
                   Position 0 is the document start node
```

### Why Do We Need Position Mapping?

ProseMirror uses a different position system than plain character indices:

```mermaid
flowchart LR
    subgraph "Plain Text View"
        A["H e l l o   W o r l d"]
        B["0 1 2 3 4 5 6 7 8 9 10"]
    end

    subgraph "ProseMirror View"
        C["<doc><p> H e l l o   W o r l d </p></doc>"]
        D["0    1   2 3 4 5 6 7 8 9 10 11 12   13"]
    end

    A -.->|"Need to map"| C
```

Every structural element (paragraph, table cell, etc.) takes up position space.

### Code Location
```
text-extraction.ts → extractTextFromJson() and extractTextWithPositions()
```

```typescript
// For ORIGINAL: Just extract text from JSON
function extractTextFromJson(json: ProseMirrorJsonNode): string {
  let text = "";
  // Recursively walk the JSON tree
  if (json.text) {
    text += json.text;
  }
  if (json.content) {
    for (const child of json.content) {
      text += extractTextFromJson(child);
    }
  }
  return text;
}

// For MODIFIED: Extract text AND build position map
function extractTextWithPositions(editor: SuperDocEditor): PositionMap {
  const text: string[] = [];
  const charToPos: number[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) {
        text.push(node.text[i]);
        charToPos.push(pos + i);  // Map char index → PM position
      }
    }
  });

  return { text: text.join(""), charToPos };
}
```

---

## Step 3: Computing the Diff

We use the `diff` library's `diffChars` function to find character-level differences.

```mermaid
flowchart TB
    A["Original: 'SERVICE CONTRACT'"] --> C[diffChars]
    B["Modified: 'NDA CONTRACT'"] --> C

    C --> D["Diff Result Array"]

    D --> E["{ value: 'SERVICE', removed: true }"]
    D --> F["{ value: 'NDA', added: true }"]
    D --> G["{ value: ' CONTRACT', unchanged }"]
```

### Diff Result Types

| Property | Meaning |
|----------|---------|
| `added: true` | Text exists in MODIFIED but not in ORIGINAL |
| `removed: true` | Text exists in ORIGINAL but not in MODIFIED |
| Neither | Text is the same in both (unchanged) |

### Tracking Positions During Diff

As we iterate through diff results, we track our position in the modified text:

```mermaid
sequenceDiagram
    participant D as Diff Results
    participant I as Modified Index
    participant C as Changes Array

    Note over I: Start at 0

    D->>D: "SERVICE" (removed)
    Note over I: Don't advance (not in modified)
    D->>C: Create DELETION at position 0

    D->>D: "NDA" (added)
    Note over I: Advance 0 → 3
    D->>C: Create INSERTION at 0-3

    D->>D: " CONTRACT" (unchanged)
    Note over I: Advance 3 → 12
    Note over C: Skip unchanged text
```

### Code Location
```
diff-computation.ts → computeChangesWithPositions()
```

```typescript
function computeChangesWithPositions(
  originalText: string,
  modifiedText: string
): ChangeWithPosition[] {
  const diffs = diffChars(originalText, modifiedText);
  const changes: ChangeWithPosition[] = [];
  let modifiedCharIndex = 0;  // Track position in modified text

  for (const diff of diffs) {
    if (!diff.added && !diff.removed) {
      // Unchanged - just advance position
      modifiedCharIndex += diff.value.length;
      continue;
    }

    if (diff.added) {
      // INSERTION: text in modified but not original
      changes.push({
        type: "insertion",
        content: diff.value,
        charStart: modifiedCharIndex,
        charEnd: modifiedCharIndex + diff.value.length,
      });
      modifiedCharIndex += diff.value.length;
    }

    if (diff.removed) {
      // DELETION: text in original but not modified
      changes.push({
        type: "deletion",
        content: diff.value,
        insertAt: modifiedCharIndex,  // Where it WOULD be in modified
      });
      // Don't advance - deletions aren't in modified text
    }
  }

  return changes;
}
```

---

## Step 4: Detecting Replacements

When a deletion is immediately followed by an insertion, we combine them into a "replacement":

```mermaid
flowchart LR
    subgraph "Diff Output"
        A["removed: 'quick'"]
        B["added: 'slow'"]
    end

    subgraph "Our Processing"
        C{Is removed followed<br/>by added?}
        C -->|Yes| D["Create REPLACEMENT<br/>oldContent: 'quick'<br/>content: 'slow'"]
        C -->|No| E["Create separate<br/>DELETION + INSERTION"]
    end

    A --> C
    B --> C
```

### Example

```
Original: "The quick brown fox"
Modified: "The slow red fox"

Diff results:
1. "The " (unchanged)
2. "quick" (removed)  ─┐
3. "slow" (added)     ─┴─► Combined into REPLACEMENT
4. " " (unchanged)
5. "brown" (removed)  ─┐
6. "red" (added)      ─┴─► Combined into REPLACEMENT
7. " fox" (unchanged)

Final changes:
- REPLACEMENT: "quick" → "slow" at position 4-8
- REPLACEMENT: "brown" → "red" at position 9-12
```

---

## Step 5: Mapping to ProseMirror Positions

Now we convert character positions to ProseMirror positions using our position map.

```mermaid
flowchart TB
    subgraph "Change Object"
        A["INSERTION<br/>content: 'NDA'<br/>charStart: 0<br/>charEnd: 3"]
    end

    subgraph "Position Map"
        B["charToPos: [1, 2, 3, 4, 5, ...]"]
    end

    subgraph "ProseMirror Positions"
        C["pmFrom: posMap[0] = 1<br/>pmTo: posMap[2] + 1 = 4"]
    end

    A --> B
    B --> C
```

### Code Location
```
track-changes.ts → buildModifications()
```

```typescript
function buildModifications(
  editor: SuperDocEditor,
  changes: ChangeWithPosition[],
  posMap: PositionMap
): DocumentModification[] {
  const modifications = [];

  for (const change of changes) {
    if (change.type === "insertion" || change.type === "replacement") {
      // Map character positions to ProseMirror positions
      const pmFrom = posMap.charToPos[change.charStart];
      const pmTo = posMap.charToPos[change.charEnd - 1] + 1;

      modifications.push({
        change,
        pmFrom,
        pmTo,
      });
    }

    if (change.type === "deletion") {
      // For deletions, find where to INSERT the deleted text
      const pmInsertAt = posMap.charToPos[change.insertAt];

      modifications.push({
        change,
        pmFrom: pmInsertAt,
        pmTo: pmInsertAt,
        isDeletion: true,
      });
    }
  }

  return modifications;
}
```

---

## Step 6: Applying Track Change Marks

Finally, we apply visual marks to the document using ProseMirror transactions.

```mermaid
flowchart TB
    subgraph "For INSERTIONS"
        A[Text already exists in document]
        A --> B[Add trackInsert mark]
        B --> C[Green underline appears]
    end

    subgraph "For DELETIONS"
        D[Text does NOT exist in document]
        D --> E[INSERT the deleted text]
        E --> F[Add trackDelete mark]
        F --> G[Red strikethrough appears]
    end
```

### Why We INSERT Deleted Text

This is a key concept:

```mermaid
flowchart LR
    subgraph "Original"
        A["Hello World"]
    end

    subgraph "Modified (what we have)"
        B["Hello"]
    end

    subgraph "After Track Changes"
        C["Hello World"]
        D["      ─────"]
        E["      strikethrough"]
    end

    A -.->|"World was deleted"| B
    B -->|"Insert 'World' with<br/>trackDelete mark"| C
```

We need to INSERT the deleted text back into the document so users can SEE what was removed.

### Applying Changes in Reverse Order

We apply changes from END to START to avoid position shifting:

```mermaid
sequenceDiagram
    participant Doc as Document
    participant C1 as Change at pos 100
    participant C2 as Change at pos 50
    participant C3 as Change at pos 10

    Note over Doc: Apply from end first

    C1->>Doc: Apply at pos 100
    Note over Doc: Positions < 100 unchanged

    C2->>Doc: Apply at pos 50
    Note over Doc: Positions < 50 unchanged

    C3->>Doc: Apply at pos 10
    Note over Doc: Done!
```

If we applied from START, inserting text at position 10 would shift everything after it, making positions 50 and 100 incorrect.

### Code Location
```
track-changes.ts → applyTrackChanges()
```

```typescript
function applyTrackChanges(
  editor: SuperDocEditor,
  changes: ChangeWithPosition[],
  posMap: PositionMap
): TrackChangesResult {
  // Get mark types from schema
  const trackInsertMark = editor.schema.marks.trackInsert;
  const trackDeleteMark = editor.schema.marks.trackDelete;

  // Build modifications with ProseMirror positions
  const modifications = buildModifications(editor, changes, posMap);

  // IMPORTANT: Sort by position DESCENDING (end to start)
  const sortedMods = modifications.sort((a, b) => b.pmFrom - a.pmFrom);

  // Create a single transaction for all changes
  let tr = editor.state.tr;

  for (const mod of sortedMods) {
    if (mod.change.type === "insertion") {
      // Add trackInsert mark to existing text
      const mark = trackInsertMark.create({ author: "Comparison" });
      tr = tr.addMark(mod.pmFrom, mod.pmTo, mark);
    }

    if (mod.change.type === "deletion") {
      // INSERT the deleted text with trackDelete mark
      const mark = trackDeleteMark.create({ author: "Comparison" });
      const textNode = editor.schema.text(mod.change.content, [mark]);
      tr = tr.insert(mod.pmFrom, textNode);
    }
  }

  // Apply all changes at once
  editor.view.dispatch(tr);
}
```

---

## Complete Flow Diagram

```mermaid
flowchart TB
    subgraph "1. Document Loading"
        A[User uploads 2 DOCX files] --> B[Create Main SuperDoc<br/>with Modified doc]
        A --> C[Create Hidden SuperDoc<br/>with Original doc]
    end

    subgraph "2. Text Extraction"
        B --> D[Extract text + position map<br/>from live editor]
        C --> E[Extract text from JSON]
    end

    subgraph "3. Diff Computation"
        D --> F[diffChars comparing texts]
        E --> F
        F --> G[Array of diff parts:<br/>added, removed, unchanged]
    end

    subgraph "4. Change Classification"
        G --> H{Process each diff part}
        H -->|added| I[Create INSERTION]
        H -->|removed| J[Create DELETION]
        H -->|removed+added| K[Create REPLACEMENT]
    end

    subgraph "5. Position Mapping"
        I --> L[Map char positions<br/>to ProseMirror positions]
        J --> L
        K --> L
    end

    subgraph "6. Track Changes Application"
        L --> M[Sort changes by position DESC]
        M --> N[Create ProseMirror transaction]
        N --> O[For insertions: addMark]
        N --> P[For deletions: insert + addMark]
        O --> Q[Dispatch transaction]
        P --> Q
    end

    subgraph "7. Visual Result"
        Q --> R[Green underline = Added]
        Q --> S[Red strikethrough = Removed]
        Q --> T[Sidebar shows all changes]
    end
```

---

## Data Structures

### ChangeWithPosition

```typescript
interface ChangeWithPosition {
  id: string;                    // Unique identifier
  type: "insertion" | "deletion" | "replacement";
  content: string;               // The changed text
  oldContent?: string;           // For replacements: the original text

  // For insertions/replacements (positions in modified text):
  charStart?: number;
  charEnd?: number;

  // For deletions (where to insert in modified text):
  insertAt?: number;
  contextBefore?: string;        // Text before deletion for positioning
}
```

### PositionMap

```typescript
interface PositionMap {
  text: string;                  // Extracted plain text
  charToPos: number[];           // charToPos[charIndex] = prosemirrorPosition
}
```

### DocumentModification

```typescript
interface DocumentModification {
  change: ChangeWithPosition;    // The original change
  pmFrom: number;                // ProseMirror start position
  pmTo: number;                  // ProseMirror end position
  isDeletion?: boolean;          // Whether this is a deletion
}
```

---

## Example Walkthrough

Let's trace through a complete example:

### Input Documents

**Original:** `"Hello World"`
**Modified:** `"Hello Everyone"`

### Step-by-Step

```mermaid
flowchart TB
    subgraph "Step 1: Extract Text"
        A["Original text: 'Hello World'"]
        B["Modified text: 'Hello Everyone'"]
        C["Position map: [1,2,3,4,5,6,7,8,9,10,11,12,13,14]"]
    end

    subgraph "Step 2: Diff"
        D["diffChars('Hello World', 'Hello Everyone')"]
        E["Result:
        { value: 'Hello ', unchanged }
        { value: 'World', removed }
        { value: 'Everyone', added }"]
    end

    subgraph "Step 3: Create Changes"
        F["REPLACEMENT detected:
        - oldContent: 'World'
        - content: 'Everyone'
        - charStart: 6
        - charEnd: 14"]
    end

    subgraph "Step 4: Map Positions"
        G["pmFrom: posMap[6] = 7
        pmTo: posMap[13] + 1 = 15"]
    end

    subgraph "Step 5: Apply Track Changes"
        H["1. Mark 'Everyone' with trackInsert (green)
        2. Insert 'World' before it with trackDelete (red)"]
    end

    subgraph "Step 6: Result"
        I["Hello [World](strikethrough) [Everyone](underline)"]
    end

    A --> D
    B --> D
    D --> E
    E --> F
    F --> G
    G --> H
    H --> I
```

---

## Key Insights

### 1. We Show the MODIFIED Document
The user sees the modified document with track changes applied, not the original.

### 2. Deletions Are Inserted Back
To show what was deleted, we INSERT the deleted text with a strikethrough mark.

### 3. Position Mapping Is Critical
ProseMirror positions ≠ character indices. Always use the position map.

### 4. Apply Changes in Reverse Order
Process from end to start to avoid position shifting.

### 5. Single Transaction for All Changes
Apply all changes in one transaction for performance and atomicity.

---

## File Reference

| File | Purpose |
|------|---------|
| `DocumentComparison.tsx` | Main component, orchestrates everything |
| `text-extraction.ts` | `extractTextFromJson`, `extractTextWithPositions` |
| `diff-computation.ts` | `computeChangesWithPositions`, change creation |
| `track-changes.ts` | `applyTrackChanges`, ProseMirror transaction handling |
| `types.ts` | TypeScript interfaces for all data structures |
