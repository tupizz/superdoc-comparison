"use client";

import { SuperDoc } from "@harbour-enterprises/superdoc";
import "@harbour-enterprises/superdoc/style.css";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeChangesWithPositions,
  computeDiffSummary,
  extractTextFromJson,
  extractTextWithPositions,
  applyTrackChanges,
  navigateToChange,
  type ChangeWithPosition,
  type DiffSummary,
  type SuperDocEditor,
  type ProseMirrorJsonNode,
  type PositionMap,
} from "@/app/lib/document-diff";

// =============================================================================
// Types
// =============================================================================

interface DocumentComparisonProps {
  originalBase64: string;
  modifiedBase64: string;
  originalName: string;
  modifiedName: string;
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Convert base64 string to Blob for SuperDoc
 */
function base64ToBlob(base64: string): Blob {
  const data = base64.includes(",") ? base64.split(",")[1] : base64;
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

// =============================================================================
// Component
// =============================================================================

export default function DocumentComparison({
  originalBase64,
  modifiedBase64,
  originalName,
  modifiedName,
}: DocumentComparisonProps) {
  const superdocRef = useRef<SuperDoc | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [changes, setChanges] = useState<ChangeWithPosition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const summary: DiffSummary = computeDiffSummary(changes);

  // Handle navigation to a change in the sidebar
  const handleNavigateToChange = useCallback((change: ChangeWithPosition) => {
    if (!superdocRef.current) return;

    const editor = superdocRef.current.activeEditor as unknown as SuperDocEditor | undefined;
    if (!editor) return;

    setSelectedId(change.id);

    // Only navigate for non-deletions (deletions are inserted, harder to locate)
    if (change.type !== "deletion") {
      navigateToChange(editor, change);
    }
  }, []);

  // Main effect: Initialize SuperDoc instances and apply track changes
  useEffect(() => {
    let mounted = true;
    let originalJson: ProseMirrorJsonNode | null = null;
    let modifiedJson: ProseMirrorJsonNode | null = null;
    let mainSuperdoc: SuperDoc | null = null;
    let hiddenSuperdoc: SuperDoc | null = null;

    /**
     * Called when both documents are loaded
     * Computes diff and applies track changes
     */
    const onBothLoaded = () => {
      if (!originalJson || !modifiedJson || !mounted || !mainSuperdoc?.activeEditor) {
        return;
      }

      const editor = mainSuperdoc.activeEditor as unknown as SuperDocEditor;

      // Extract text from original document JSON
      const originalText = extractTextFromJson(originalJson);

      // Build position map from the live modified document
      const modifiedPosMap: PositionMap = extractTextWithPositions(editor);

      console.log("Original text length:", originalText.length);
      console.log("Modified text length:", modifiedPosMap.text.length);
      console.log("Position map size:", modifiedPosMap.charToPos.length);

      // Compute changes using word-level diff
      const computed = computeChangesWithPositions(originalText, modifiedPosMap.text);
      setChanges(computed);
      setIsLoading(false);

      // Apply track changes marks after a short delay
      if (superdocRef.current && computed.length > 0) {
        setTimeout(() => {
          if (!superdocRef.current?.activeEditor || !mounted) return;

          console.log("Applying track changes to", computed.length, "changes");
          const result = applyTrackChanges(
            superdocRef.current.activeEditor as unknown as SuperDocEditor,
            computed,
            modifiedPosMap
          );
          console.log(`Track changes result: ${result.successCount}/${result.totalCount}`);
        }, 300);
      }
    };

    // Clear container elements before creating new instances
    const mainContainer = document.getElementById("superdoc-main");
    const hiddenContainer = document.getElementById("superdoc-hidden");
    if (mainContainer) mainContainer.innerHTML = "";
    if (hiddenContainer) hiddenContainer.innerHTML = "";

    // Main SuperDoc: Shows the MODIFIED document with highlights
    mainSuperdoc = new SuperDoc({
      selector: "#superdoc-main",
      documents: [
        { id: "modified", data: base64ToBlob(modifiedBase64), type: "docx" },
      ],
      documentMode: "editing",
      onReady: () => {
        if (!mounted) return;
        modifiedJson = mainSuperdoc?.activeEditor?.getJSON() as ProseMirrorJsonNode;
        superdocRef.current = mainSuperdoc;
        onBothLoaded();
      },
    });

    // Hidden SuperDoc: Loads original document for comparison
    hiddenSuperdoc = new SuperDoc({
      selector: "#superdoc-hidden",
      documents: [
        { id: "original", data: base64ToBlob(originalBase64), type: "docx" },
      ],
      documentMode: "viewing",
      onReady: () => {
        if (!mounted) return;
        originalJson = hiddenSuperdoc?.activeEditor?.getJSON() as ProseMirrorJsonNode;
        onBothLoaded();
      },
    });

    // Cleanup
    return () => {
      mounted = false;
      superdocRef.current = null;

      // Destroy SuperDoc instances
      try {
        const mainAny = mainSuperdoc as { destroy?: () => void } | null;
        const hiddenAny = hiddenSuperdoc as { destroy?: () => void } | null;
        mainAny?.destroy?.();
        hiddenAny?.destroy?.();
      } catch (e) {
        console.warn("Error destroying SuperDoc:", e);
      }

      // Clear containers
      const mainEl = document.getElementById("superdoc-main");
      const hiddenEl = document.getElementById("superdoc-hidden");
      if (mainEl) mainEl.innerHTML = "";
      if (hiddenEl) hiddenEl.innerHTML = "";
    };
  }, [originalBase64, modifiedBase64]);

  return (
    <div className="flex h-full gap-4">
      {/* Hidden container for original document */}
      <div
        id="superdoc-hidden"
        className="absolute -left-[9999px] w-px h-px overflow-hidden"
      />

      {/* Main document viewer */}
      <div className="flex-1 flex flex-col min-w-0">
        <DocumentHeader
          modifiedName={modifiedName}
          originalName={originalName}
          summary={summary}
          isLoading={isLoading}
        />
        <div className="flex-1 bg-white rounded-b-lg overflow-auto relative">
          {isLoading && <LoadingOverlay />}
          <div id="superdoc-main" className="w-full h-full" />
        </div>
      </div>

      {/* Changes sidebar */}
      <ChangesSidebar
        changes={changes}
        selectedId={selectedId}
        isLoading={isLoading}
        onSelectChange={handleNavigateToChange}
      />
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface DocumentHeaderProps {
  modifiedName: string;
  originalName: string;
  summary: DiffSummary;
  isLoading: boolean;
}

function DocumentHeader({
  modifiedName,
  originalName,
  summary,
  isLoading,
}: DocumentHeaderProps) {
  return (
    <div className="bg-zinc-800 px-4 py-2 rounded-t-lg border-b border-zinc-700 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-zinc-300">Modified Document</span>
        <span className="text-xs text-zinc-500 truncate">{modifiedName}</span>
      </div>
      {!isLoading && (
        <div className="flex gap-3 text-xs">
          <span className="text-zinc-400">vs {originalName}</span>
          <span className="text-green-400">+{summary.insertions}</span>
          <span className="text-red-400">-{summary.deletions}</span>
          {summary.replacements > 0 && (
            <span className="text-yellow-400">↔{summary.replacements}</span>
          )}
        </div>
      )}
    </div>
  );
}

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
      <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
    </div>
  );
}

interface ChangesSidebarProps {
  changes: ChangeWithPosition[];
  selectedId: string | null;
  isLoading: boolean;
  onSelectChange: (change: ChangeWithPosition) => void;
}

function ChangesSidebar({
  changes,
  selectedId,
  isLoading,
  onSelectChange,
}: ChangesSidebarProps) {
  return (
    <div className="w-72 flex flex-col bg-zinc-900 rounded-lg border border-zinc-800">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h3 className="text-sm font-medium text-zinc-200">
          Changes {!isLoading && `(${changes.length})`}
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {isLoading && (
          <p className="text-center py-8 text-zinc-500 text-sm">Analyzing...</p>
        )}
        {!isLoading && changes.length === 0 && (
          <p className="text-center py-8 text-zinc-500 text-sm">No changes</p>
        )}
        {changes.map((change, index) => (
          <ChangeCard
            key={change.id}
            change={change}
            index={index}
            isSelected={selectedId === change.id}
            onSelect={() => onSelectChange(change)}
          />
        ))}
      </div>
    </div>
  );
}

interface ChangeCardProps {
  change: ChangeWithPosition;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}

function ChangeCard({ change, index, isSelected, onSelect }: ChangeCardProps) {
  const isDeletion = change.type === "deletion";

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-lg transition-colors ${
        isSelected
          ? "bg-zinc-700 ring-1 ring-blue-500"
          : "bg-zinc-800 hover:bg-zinc-700"
      } ${isDeletion ? "cursor-default opacity-80" : "cursor-pointer"}`}
      title={isDeletion ? "Deleted text (shown in document)" : "Click to navigate"}
    >
      <ChangeCardHeader type={change.type} index={index} />
      <ChangeCardContent change={change} />
    </button>
  );
}

interface ChangeCardHeaderProps {
  type: ChangeWithPosition["type"];
  index: number;
}

function ChangeCardHeader({ type, index }: ChangeCardHeaderProps) {
  const config = {
    insertion: {
      bgClass: "bg-green-500/20",
      textClass: "text-green-400",
      symbol: "+",
      label: "Added",
    },
    replacement: {
      bgClass: "bg-yellow-500/20",
      textClass: "text-yellow-400",
      symbol: "↔",
      label: "Replaced",
    },
    deletion: {
      bgClass: "bg-red-500/20",
      textClass: "text-red-400",
      symbol: "-",
      label: "Removed",
    },
  }[type];

  return (
    <div className="flex items-center gap-2">
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded ${config.bgClass} ${config.textClass}`}
      >
        {config.symbol} {index + 1}
      </span>
      <span className="text-xs text-zinc-500">{config.label}</span>
    </div>
  );
}

interface ChangeCardContentProps {
  change: ChangeWithPosition;
}

function ChangeCardContent({ change }: ChangeCardContentProps) {
  const truncate = (text: string, maxLength: number) =>
    text.length > maxLength ? text.slice(0, maxLength) + "..." : text;

  if (change.type === "replacement") {
    return (
      <div className="mt-1 text-sm space-y-1">
        <p className="text-red-300 line-through">
          {truncate(change.oldContent || "", 40)}
        </p>
        <p className="text-green-300">{truncate(change.content, 40)}</p>
      </div>
    );
  }

  return (
    <p
      className={`mt-1 text-sm line-clamp-2 ${
        change.type === "insertion" ? "text-green-300" : "text-red-300 line-through"
      }`}
    >
      {truncate(change.content, 80)}
    </p>
  );
}

// Re-export types for external use
export type { ChangeWithPosition as Change, DiffSummary };
