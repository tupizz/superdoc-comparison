"use client";

import { SuperDoc } from "@harbour-enterprises/superdoc";
import "@harbour-enterprises/superdoc/style.css";
import { AnimatePresence, motion } from "motion/react";

// Motion wrapper to handle TypeScript issues with motion v12
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M = motion as any;

import {
  applyFormattingTrackChanges,
  applyTrackChanges,
  approveChange,
  computeChangesWithPositions,
  computeDiffSummary,
  computeFormattingChanges,
  extractTextWithFormattingFromEditor,
  extractTextWithFormattingFromJson,
  getMarkTypeLabel,
  navigateToChange,
  navigateToFormattingChange,
  rejectChange,
  type ChangeWithPosition,
  type DiffSummary,
  type FormattingChangeWithPosition,
  type PositionMapWithFormatting,
  type ProseMirrorJsonNode,
  type SuperDocEditor,
} from "@/app/lib/document-diff";
import type { SummarizeResponse } from "@/app/lib/openai";
import { useCallback, useEffect, useRef, useState } from "react";
import ConfirmationModal from "./ui/ConfirmationModal";
import ProgressBar from "./ui/ProgressBar";

// =============================================================================
// Types
// =============================================================================

interface DocumentComparisonProps {
  originalBase64: string;
  modifiedBase64: string;
  originalName: string;
  modifiedName: string;
}

type SidebarTab = "review" | "summary";

// =============================================================================
// Utilities
// =============================================================================

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
  const posMapRef = useRef<PositionMapWithFormatting | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [changes, setChanges] = useState<ChangeWithPosition[]>([]);
  const [formattingChanges, setFormattingChanges] = useState<
    FormattingChangeWithPosition[]
  >([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>("review");

  // AI Summary state with streaming support
  const [aiSummary, setAiSummary] = useState<Partial<SummarizeResponse> | null>(
    null
  );
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  // UI state for modals
  const [showAcceptAllConfirm, setShowAcceptAllConfirm] = useState(false);
  const [showRejectAllConfirm, setShowRejectAllConfirm] = useState(false);

  // Track initial change count for progress tracking
  const [initialChangeCount, setInitialChangeCount] = useState(0);

  const summary: DiffSummary = computeDiffSummary(changes, formattingChanges);
  const totalChanges = changes.length + formattingChanges.length;
  const reviewedCount = initialChangeCount > 0 ? initialChangeCount - totalChanges : 0;

  const handleDownload = useCallback(() => {
    if (!superdocRef.current) return;
    try {
      (superdocRef.current as unknown as { export: () => void }).export();
    } catch (e) {
      console.warn("Export failed:", e);
    }
  }, []);

  const handleNavigateToChange = useCallback((change: ChangeWithPosition) => {
    if (!superdocRef.current) return;
    const editor = superdocRef.current.activeEditor as unknown as
      | SuperDocEditor
      | undefined;
    if (!editor) return;
    setSelectedId(change.id);
    navigateToChange(editor, change);
  }, []);

  const handleNavigateToFormattingChange = useCallback(
    (change: FormattingChangeWithPosition) => {
      if (!superdocRef.current) return;
      const editor = superdocRef.current.activeEditor as unknown as
        | SuperDocEditor
        | undefined;
      if (!editor) return;
      setSelectedId(change.id);
      navigateToFormattingChange(editor, change);
    },
    []
  );

  const handleApprove = useCallback(
    (
      changeId: string,
      changeType: "insertion" | "deletion" | "replacement"
    ) => {
      if (!superdocRef.current) return;
      const editor = superdocRef.current.activeEditor as unknown as
        | SuperDocEditor
        | undefined;
      if (!editor) return;
      if (approveChange(editor, changeId, changeType)) {
        setChanges((prev) => prev.filter((c) => c.id !== changeId));
      }
    },
    []
  );

  const handleReject = useCallback(
    (
      changeId: string,
      changeType: "insertion" | "deletion" | "replacement"
    ) => {
      if (!superdocRef.current) return;
      const editor = superdocRef.current.activeEditor as unknown as
        | SuperDocEditor
        | undefined;
      if (!editor) return;
      if (rejectChange(editor, changeId, changeType)) {
        setChanges((prev) => prev.filter((c) => c.id !== changeId));
      }
    },
    []
  );

  const handleAcceptAll = useCallback(() => {
    if (!superdocRef.current) return;
    const editor = superdocRef.current.activeEditor as unknown as
      | SuperDocEditor
      | undefined;
    if (!editor) return;
    let successCount = 0;
    for (const change of changes) {
      if (approveChange(editor, change.id, change.type)) successCount++;
    }
    if (successCount > 0) setChanges([]);
    setShowAcceptAllConfirm(false);
  }, [changes]);

  const handleRejectAll = useCallback(() => {
    if (!superdocRef.current) return;
    const editor = superdocRef.current.activeEditor as unknown as
      | SuperDocEditor
      | undefined;
    if (!editor) return;
    let successCount = 0;
    for (const change of changes) {
      if (rejectChange(editor, change.id, change.type)) successCount++;
    }
    if (successCount > 0) setChanges([]);
    setShowRejectAllConfirm(false);
  }, [changes]);

  // Fetch AI summary with streaming support (NDJSON format)
  const fetchAiSummary = useCallback(
    async (changesToSummarize: ChangeWithPosition[]) => {
      if (changesToSummarize.length === 0) return;

      setIsSummaryLoading(true);
      setIsStreaming(true);
      setSummaryError(null);
      setAiSummary(null);

      try {
        const response = await fetch("/api/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            changes: changesToSummarize.map((c) => ({
              type: c.type,
              content: c.content,
              oldContent: c.oldContent,
            })),
            documentName: modifiedName,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to generate summary");
        }

        // Check if the response is a stream (NDJSON)
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/x-ndjson")) {
          // Handle NDJSON streaming response
          const reader = response.body?.getReader();
          if (!reader) throw new Error("No response body");

          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process complete lines (NDJSON format: one JSON per line)
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // Keep incomplete line in buffer

            for (const line of lines) {
              if (line.trim()) {
                try {
                  const partialObject = JSON.parse(line);
                  setAiSummary({
                    ...partialObject,
                    bulletPoints: [
                      ...(partialObject.textChanges || []),
                      ...(partialObject.formattingChanges || []),
                      ...(partialObject.structuralChanges || []),
                    ],
                  });
                } catch {
                  // Skip malformed lines
                }
              }
            }
          }

          // Process any remaining data in buffer
          if (buffer.trim()) {
            try {
              const finalObject = JSON.parse(buffer);
              setAiSummary({
                ...finalObject,
                bulletPoints: [
                  ...(finalObject.textChanges || []),
                  ...(finalObject.formattingChanges || []),
                  ...(finalObject.structuralChanges || []),
                ],
              });
            } catch {
              // Ignore final incomplete line
            }
          }
        } else {
          // Handle regular JSON response (fallback)
          const data: SummarizeResponse = await response.json();
          setAiSummary(data);
        }
      } catch (err) {
        setSummaryError(
          err instanceof Error ? err.message : "Failed to generate summary"
        );
      } finally {
        setIsSummaryLoading(false);
        setIsStreaming(false);
      }
    },
    [modifiedName]
  );

  // Auto-fetch summary when switching to summary tab
  useEffect(() => {
    if (
      activeTab === "summary" &&
      !aiSummary &&
      !isSummaryLoading &&
      changes.length > 0
    ) {
      fetchAiSummary(changes);
    }
  }, [activeTab, aiSummary, isSummaryLoading, changes, fetchAiSummary]);

  useEffect(() => {
    let mounted = true;
    let originalJson: ProseMirrorJsonNode | null = null;
    let modifiedJson: ProseMirrorJsonNode | null = null;
    let mainSuperdoc: SuperDoc | null = null;
    let hiddenSuperdoc: SuperDoc | null = null;

    const onBothLoaded = () => {
      if (
        !originalJson ||
        !modifiedJson ||
        !mounted ||
        !mainSuperdoc?.activeEditor
      )
        return;

      const editor = mainSuperdoc.activeEditor as unknown as SuperDocEditor;

      // Extract text and formatting from both documents
      const originalData = extractTextWithFormattingFromJson(originalJson);
      const modifiedPosMap = extractTextWithFormattingFromEditor(editor);
      posMapRef.current = modifiedPosMap;

      // Compute content changes
      const computed = computeChangesWithPositions(
        originalData.text,
        modifiedPosMap.text
      );
      setChanges(computed);

      // Compute formatting changes
      const formatChanges = computeFormattingChanges(
        originalData.text,
        originalData.formatting,
        modifiedPosMap.text,
        modifiedPosMap.formatting
      );
      setFormattingChanges(formatChanges);

      // Set initial change count for progress tracking
      setInitialChangeCount(computed.length + formatChanges.length);

      setIsLoading(false);

      if (superdocRef.current && (computed.length > 0 || formatChanges.length > 0)) {
        setTimeout(() => {
          if (!superdocRef.current?.activeEditor || !mounted) return;
          const currentEditor = superdocRef.current
            .activeEditor as unknown as SuperDocEditor;

          // IMPORTANT: Apply formatting track changes FIRST (before content changes)
          // because content changes (especially deletions) will shift positions
          if (formatChanges.length > 0) {
            applyFormattingTrackChanges(
              currentEditor,
              formatChanges,
              modifiedPosMap
            );
          }

          // Apply content track changes after formatting
          if (computed.length > 0) {
            applyTrackChanges(currentEditor, computed, modifiedPosMap);
          }

          // Update position map after changes applied
          const updatedPosMap = extractTextWithFormattingFromEditor(currentEditor);
          posMapRef.current = updatedPosMap;
        }, 300);
      }
    };

    const mainContainer = document.getElementById("superdoc-main");
    const hiddenContainer = document.getElementById("superdoc-hidden");
    if (mainContainer) mainContainer.innerHTML = "";
    if (hiddenContainer) hiddenContainer.innerHTML = "";

    mainSuperdoc = new SuperDoc({
      selector: "#superdoc-main",
      documents: [
        { id: "modified", data: base64ToBlob(modifiedBase64), type: "docx" },
      ],
      user: { name: "Document Reviewer", email: "reviewer@system" },
      rulers: true,
      documentMode: "editing",
      modules: {
        toolbar: {
          selector: "#superdoc-toolbar",
          groups: {
            center: [
              "fontFamily",
              "fontSize",
              "bold",
              "italic",
              "underline",
              "color",
              "highlight",
            ],
          },
        },
      },
      onReady: () => {
        if (!mounted) return;
        modifiedJson =
          mainSuperdoc?.activeEditor?.getJSON() as ProseMirrorJsonNode;
        superdocRef.current = mainSuperdoc;
        onBothLoaded();
      },
      onContentError: ({ error, documentId }) => {
        console.error(`Error loading document ${documentId}:`, error);
      },
    });

    hiddenSuperdoc = new SuperDoc({
      selector: "#superdoc-hidden",
      documents: [
        { id: "original", data: base64ToBlob(originalBase64), type: "docx" },
      ],
      documentMode: "viewing",
      onReady: () => {
        if (!mounted) return;
        originalJson =
          hiddenSuperdoc?.activeEditor?.getJSON() as ProseMirrorJsonNode;
        onBothLoaded();
      },
    });

    return () => {
      mounted = false;
      superdocRef.current = null;
      posMapRef.current = null;
      try {
        (mainSuperdoc as { destroy?: () => void } | null)?.destroy?.();
        (hiddenSuperdoc as { destroy?: () => void } | null)?.destroy?.();
      } catch {}
      document.getElementById("superdoc-main")?.replaceChildren();
      document.getElementById("superdoc-hidden")?.replaceChildren();
    };
  }, [originalBase64, modifiedBase64]);

  return (
    <div className="flex h-full gap-6">
      {/* Accept All confirmation modal */}
      <ConfirmationModal
        isOpen={showAcceptAllConfirm}
        onClose={() => setShowAcceptAllConfirm(false)}
        onConfirm={handleAcceptAll}
        title="Accept All Changes"
        description={`This will permanently apply ${changes.length} content ${changes.length === 1 ? "change" : "changes"} to the document. This action cannot be undone.`}
        confirmText="Accept All"
        variant="success"
        icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
          </svg>
        }
      />

      {/* Reject All confirmation modal */}
      <ConfirmationModal
        isOpen={showRejectAllConfirm}
        onClose={() => setShowRejectAllConfirm(false)}
        onConfirm={handleRejectAll}
        title="Reject All Changes"
        description={`This will discard ${changes.length} content ${changes.length === 1 ? "change" : "changes"} and revert to the original. This action cannot be undone.`}
        confirmText="Reject All"
        variant="danger"
        icon={
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        }
      />

      <div
        id="superdoc-hidden"
        className="absolute -left-[9999px] w-px h-px overflow-hidden"
      />

      {/* Main document area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <DocumentHeader
          modifiedName={modifiedName}
          originalName={originalName}
          summary={summary}
          isLoading={isLoading}
          hasChanges={changes.length > 0}
          onDownload={handleDownload}
          onAcceptAll={() => setShowAcceptAllConfirm(true)}
          onRejectAll={() => setShowRejectAllConfirm(true)}
        />
        <div
          id="superdoc-toolbar"
          className="border-b border-zinc-200 dark:border-zinc-700 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/50"
        />
        <div className="flex-1 overflow-auto relative bg-zinc-100 dark:bg-zinc-900">
          {isLoading && <LoadingOverlay />}
          <div id="superdoc-main" className="w-full h-full" />
        </div>
      </div>

      {/* Sidebar with tabs */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        changes={changes}
        formattingChanges={formattingChanges}
        selectedId={selectedId}
        isLoading={isLoading}
        onSelectChange={handleNavigateToChange}
        onSelectFormattingChange={handleNavigateToFormattingChange}
        onApprove={handleApprove}
        onReject={handleReject}
        aiSummary={aiSummary}
        isSummaryLoading={isSummaryLoading}
        isStreaming={isStreaming}
        summaryError={summaryError}
        onRetrySummary={() => fetchAiSummary(changes)}
        initialChangeCount={initialChangeCount}
        reviewedCount={reviewedCount}
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
  hasChanges: boolean;
  onDownload: () => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}

function DocumentHeader({
  modifiedName,
  originalName,
  summary,
  isLoading,
  hasChanges,
  onDownload,
  onAcceptAll,
  onRejectAll,
}: DocumentHeaderProps) {
  const contentChanges =
    summary.insertions + summary.deletions + summary.replacements;
  const totalChanges = contentChanges + summary.formattingChanges;

  return (
    <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
              {modifiedName}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
              Comparing with {originalName}
            </p>
          </div>
          {!isLoading && totalChanges > 0 && (
            <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-700 px-2.5 py-1 rounded-full">
              {totalChanges} {totalChanges === 1 ? "change" : "changes"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasChanges && (
            <>
              <button
                onClick={onAcceptAll}
                className="px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-md transition-colors"
              >
                Accept all
              </button>
              <button
                onClick={onRejectAll}
                className="px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
              >
                Reject all
              </button>
              <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-600 mx-1" />
            </>
          )}
          <button
            onClick={onDownload}
            disabled={isLoading}
            className="px-4 py-1.5 text-xs font-medium bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-900 z-10">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-zinc-300 dark:border-zinc-600 border-t-zinc-500 dark:border-t-zinc-400 rounded-full animate-spin" />
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Analyzing documents...
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// Sidebar with Tabs
// =============================================================================

interface SidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  changes: ChangeWithPosition[];
  formattingChanges: FormattingChangeWithPosition[];
  selectedId: string | null;
  isLoading: boolean;
  onSelectChange: (change: ChangeWithPosition) => void;
  onSelectFormattingChange: (change: FormattingChangeWithPosition) => void;
  onApprove: (
    changeId: string,
    changeType: "insertion" | "deletion" | "replacement"
  ) => void;
  onReject: (
    changeId: string,
    changeType: "insertion" | "deletion" | "replacement"
  ) => void;
  aiSummary: Partial<SummarizeResponse> | null;
  isSummaryLoading: boolean;
  isStreaming: boolean;
  summaryError: string | null;
  onRetrySummary: () => void;
  initialChangeCount: number;
  reviewedCount: number;
}

function Sidebar({
  activeTab,
  onTabChange,
  changes,
  formattingChanges,
  selectedId,
  isLoading,
  onSelectChange,
  onSelectFormattingChange,
  onApprove,
  onReject,
  aiSummary,
  isSummaryLoading,
  isStreaming,
  summaryError,
  onRetrySummary,
  initialChangeCount,
  reviewedCount,
}: SidebarProps) {
  return (
    <div className="w-[420px] flex flex-col bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
      {/* Progress bar */}
      {initialChangeCount > 0 && (
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
          <ProgressBar
            current={reviewedCount}
            total={initialChangeCount}
            label="Review progress"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/80 relative">
        {/* Animated tab indicator */}
        <M.div
          className="absolute bottom-0 h-0.5 bg-zinc-900 dark:bg-white"
          layoutId="tab-indicator"
          initial={false}
          animate={{
            left: activeTab === "review" ? "0%" : "50%",
            width: "50%",
          }}
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />

        <button
          onClick={() => onTabChange("review")}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === "review"
              ? "text-zinc-900 dark:text-zinc-100"
              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          <M.span
            className="flex items-center justify-center gap-1.5"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
            Review
          </M.span>
        </button>

        <button
          onClick={() => onTabChange("summary")}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === "summary"
              ? "text-zinc-900 dark:text-zinc-100"
              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
          }`}
        >
          <M.span
            className="flex items-center justify-center gap-1.5"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <M.svg
              className={`w-4 h-4 ${isSummaryLoading ? "text-violet-500" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              animate={
                isSummaryLoading
                  ? { rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }
                  : { rotate: 0, scale: 1 }
              }
              transition={
                isSummaryLoading
                  ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.2 }
              }
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
              />
            </M.svg>
            <AnimatePresence mode="wait">
              {isSummaryLoading ? (
                <M.span
                  key="loading"
                  className="text-violet-500"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                >
                  Analyzing...
                </M.span>
              ) : (
                <M.span
                  key="static"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                >
                  AI Summary
                </M.span>
              )}
            </AnimatePresence>
          </M.span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === "review" ? (
            <M.div
              key="review"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <ReviewTab
                changes={changes}
                formattingChanges={formattingChanges}
                selectedId={selectedId}
                isLoading={isLoading}
                onSelectChange={onSelectChange}
                onSelectFormattingChange={onSelectFormattingChange}
                onApprove={onApprove}
                onReject={onReject}
              />
            </M.div>
          ) : (
            <M.div
              key="summary"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <SummaryTab
                aiSummary={aiSummary}
                isLoading={isSummaryLoading}
                isStreaming={isStreaming}
                error={summaryError}
                onRetry={onRetrySummary}
                hasChanges={changes.length > 0}
              />
            </M.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// =============================================================================
// Review Tab
// =============================================================================

interface ReviewTabProps {
  changes: ChangeWithPosition[];
  formattingChanges: FormattingChangeWithPosition[];
  selectedId: string | null;
  isLoading: boolean;
  onSelectChange: (change: ChangeWithPosition) => void;
  onSelectFormattingChange: (change: FormattingChangeWithPosition) => void;
  onApprove: (
    changeId: string,
    changeType: "insertion" | "deletion" | "replacement"
  ) => void;
  onReject: (
    changeId: string,
    changeType: "insertion" | "deletion" | "replacement"
  ) => void;
}

function ReviewTab({
  changes,
  formattingChanges,
  selectedId,
  isLoading,
  onSelectChange,
  onSelectFormattingChange,
  onApprove,
  onReject,
}: ReviewTabProps) {
  const totalChanges = changes.length + formattingChanges.length;

  return (
    <div className="h-full flex flex-col" role="region" aria-label="Change review panel">
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-700/50">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {isLoading
            ? "Analyzing..."
            : `${totalChanges} ${
                totalChanges === 1 ? "change" : "changes"
              } to review`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-zinc-300 dark:border-zinc-600 border-t-zinc-500 dark:border-t-zinc-400 rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && totalChanges === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center mb-3">
              <svg
                className="w-6 h-6 text-zinc-400 dark:text-zinc-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
              All done
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
              No changes to review
            </p>
          </div>
        )}

        {!isLoading && totalChanges > 0 && (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-700/50">
            {/* Content changes section */}
            {changes.length > 0 && (
              <>
                <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-700/30">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                    Content Changes ({changes.length})
                  </p>
                </div>
                <AnimatePresence mode="popLayout">
                  {changes.map((change, index) => (
                    <ChangeCard
                      key={change.id}
                      change={change}
                      index={index}
                      isSelected={selectedId === change.id}
                      onSelect={() => onSelectChange(change)}
                      onApprove={() => onApprove(change.id, change.type)}
                      onReject={() => onReject(change.id, change.type)}
                    />
                  ))}
                </AnimatePresence>
              </>
            )}

            {/* Formatting changes section */}
            {formattingChanges.length > 0 && (
              <>
                <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-700/30">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                    Formatting Changes ({formattingChanges.length})
                  </p>
                </div>
                <AnimatePresence mode="popLayout">
                  {formattingChanges.map((change, index) => (
                    <FormattingChangeCard
                      key={change.id}
                      change={change}
                      index={changes.length + index}
                      isSelected={selectedId === change.id}
                      onSelect={() => onSelectFormattingChange(change)}
                    />
                  ))}
                </AnimatePresence>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Summary Tab
// =============================================================================

interface SummaryTabProps {
  aiSummary: Partial<SummarizeResponse> | null;
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  onRetry: () => void;
  hasChanges: boolean;
}

function SummaryTab({
  aiSummary,
  isLoading,
  isStreaming,
  error,
  onRetry,
  hasChanges,
}: SummaryTabProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyToClipboard = useCallback(() => {
    if (!aiSummary) return;

    const textParts: string[] = [];

    if (aiSummary.documentContext) {
      textParts.push(`About this document:\n${aiSummary.documentContext}\n`);
    }
    if (aiSummary.overview) {
      textParts.push(`Overview:\n${aiSummary.overview}\n`);
    }
    if (aiSummary.summary) {
      textParts.push(`Summary:\n${aiSummary.summary}\n`);
    }
    if (aiSummary.textChanges?.length) {
      textParts.push(`Text Changes:\n${aiSummary.textChanges.map(c => `• ${c}`).join('\n')}\n`);
    }
    if (aiSummary.formattingChanges?.length) {
      textParts.push(`Formatting Changes:\n${aiSummary.formattingChanges.map(c => `• ${c}`).join('\n')}\n`);
    }
    if (aiSummary.structuralChanges?.length) {
      textParts.push(`Structural Changes:\n${aiSummary.structuralChanges.map(c => `• ${c}`).join('\n')}`);
    }

    navigator.clipboard.writeText(textParts.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [aiSummary]);

  if (!hasChanges) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4">
        <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center mb-3">
          <svg
            className="w-6 h-6 text-zinc-400 dark:text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
          No changes to summarize
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 text-center">
          The documents appear to be identical
        </p>
      </div>
    );
  }

  // Show initial loading state only when no data has arrived yet
  if (isLoading && !aiSummary) {
    return (
      <M.div
        className="flex flex-col items-center justify-center h-full px-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {/* Minimal bouncing dots */}
        <div className="flex items-center gap-2 mb-5">
          {[0, 1, 2].map((i) => (
            <M.div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-violet-500 dark:bg-violet-400"
              animate={{
                y: [0, -10, 0],
                opacity: [0.4, 1, 0.4],
              }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.15,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>

        {/* Text */}
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Analyzing changes...
        </p>
      </M.div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4">
        <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-3">
          <svg
            className="w-6 h-6 text-red-500 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
          Failed to generate
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 text-center mb-4">
          {error}
        </p>
        <button
          onClick={onRetry}
          className="px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded-md transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!aiSummary) {
    return null;
  }

  // Safely access arrays with fallback to empty arrays
  const textChanges = aiSummary.textChanges || [];
  const formattingChangesArr = aiSummary.formattingChanges || [];
  const structuralChanges = aiSummary.structuralChanges || [];

  return (
    <div className="h-full overflow-y-auto">
      {/* Sticky header with streaming indicator and copy button */}
      <div className="sticky top-0 z-10 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/80">
        <div className="px-4 py-2 flex items-center justify-between">
          {isStreaming ? (
            <div className="flex items-center gap-2">
              <M.div
                className="w-2 h-2 rounded-full bg-violet-500"
                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <span className="text-xs text-violet-600 dark:text-violet-300">
                Generating summary...
              </span>
            </div>
          ) : (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              AI-generated summary
            </span>
          )}
          <M.button
            onClick={handleCopyToClipboard}
            disabled={isStreaming}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <AnimatePresence mode="wait">
              {copied ? (
                <M.svg
                  key="check"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="w-3.5 h-3.5 text-emerald-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </M.svg>
              ) : (
                <M.svg
                  key="copy"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </M.svg>
              )}
            </AnimatePresence>
            {copied ? "Copied!" : "Copy"}
          </M.button>
        </div>
      </div>

      <M.div
        className="p-4 space-y-4"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
        }}
      >
        {/* Document Context */}
        {aiSummary.documentContext && (
          <M.div
            className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 rounded-lg"
            variants={{
              hidden: { opacity: 0, y: 15 },
              visible: { opacity: 1, y: 0 },
            }}
          >
            <div className="flex items-start gap-2">
              <svg
                className="w-4 h-4 text-blue-500 dark:text-blue-400 mt-0.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <h4 className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-1">
                  About this document
                </h4>
                <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
                  {aiSummary.documentContext}
                </p>
              </div>
            </div>
          </M.div>
        )}

        {/* Overview */}
        {aiSummary.overview && (
          <M.div
            className="p-3 bg-zinc-50 dark:bg-zinc-700/50 rounded-lg"
            variants={{
              hidden: { opacity: 0, y: 15 },
              visible: { opacity: 1, y: 0 },
            }}
          >
            <p className="text-sm text-zinc-700 dark:text-zinc-200 leading-relaxed">
              {aiSummary.overview}
            </p>
          </M.div>
        )}

        {/* Detailed Summary */}
        {aiSummary.summary && (
          <M.div
            variants={{
              hidden: { opacity: 0, y: 15 },
              visible: { opacity: 1, y: 0 },
            }}
          >
            <h4 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
              Summary
            </h4>
            <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
              {aiSummary.summary}
            </p>
          </M.div>
        )}

        {/* Text Changes */}
        {textChanges.length > 0 && (
          <M.div
            variants={{
              hidden: { opacity: 0, y: 15 },
              visible: { opacity: 1, y: 0 },
            }}
          >
            <h4 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
              Text Changes
            </h4>
            <ul className="space-y-1.5">
              {textChanges.map((change, i) => (
                <M.li
                  key={i}
                  className="flex gap-2 text-sm text-zinc-600 dark:text-zinc-300"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.03 }}
                >
                  <span className="text-zinc-400 dark:text-zinc-500 select-none">
                    •
                  </span>
                  <span>{change}</span>
                </M.li>
              ))}
            </ul>
          </M.div>
        )}

        {/* Formatting Changes */}
        {formattingChangesArr.length > 0 && (
          <M.div
            variants={{
              hidden: { opacity: 0, y: 15 },
              visible: { opacity: 1, y: 0 },
            }}
          >
            <h4 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
              Formatting Changes
            </h4>
            <ul className="space-y-1.5">
              {formattingChangesArr.map((change, i) => (
                <M.li
                  key={i}
                  className="flex gap-2 text-sm text-zinc-600 dark:text-zinc-300"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.03 }}
                >
                  <span className="text-zinc-400 dark:text-zinc-500 select-none">
                    •
                  </span>
                  <span>{change}</span>
                </M.li>
              ))}
            </ul>
          </M.div>
        )}

        {/* Structural Changes */}
        {structuralChanges.length > 0 && (
          <M.div
            variants={{
              hidden: { opacity: 0, y: 15 },
              visible: { opacity: 1, y: 0 },
            }}
          >
            <h4 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
              Structural Changes
            </h4>
            <ul className="space-y-1.5">
              {structuralChanges.map((change, i) => (
                <M.li
                  key={i}
                  className="flex gap-2 text-sm text-zinc-600 dark:text-zinc-300"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.03 }}
                >
                  <span className="text-zinc-400 dark:text-zinc-500 select-none">
                    •
                  </span>
                  <span>{change}</span>
                </M.li>
              ))}
            </ul>
          </M.div>
        )}
      </M.div>
    </div>
  );
}

// =============================================================================
// Change Card
// =============================================================================

interface ChangeCardProps {
  change: ChangeWithPosition;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
}

function ChangeCard({
  change,
  index,
  isSelected,
  onSelect,
  onApprove,
  onReject,
}: ChangeCardProps) {
  const truncate = (text: string, max: number) =>
    text.length > max ? text.slice(0, max) + "..." : text;

  const typeConfig = {
    insertion: { label: "Added", dotColor: "bg-emerald-500" },
    deletion: { label: "Removed", dotColor: "bg-zinc-400" },
    replacement: { label: "Changed", dotColor: "bg-amber-500" },
  }[change.type];

  return (
    <M.div
      className={`px-4 py-3 cursor-pointer transition-colors ${
        isSelected
          ? "bg-zinc-50 dark:bg-zinc-700/50"
          : "hover:bg-zinc-50/50 dark:hover:bg-zinc-700/30"
      }`}
      onClick={onSelect}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{
        duration: 0.25,
        delay: Math.min(index * 0.05, 0.3),
      }}
      layout
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <M.span
          className={`w-2 h-2 rounded-full ${typeConfig.dotColor}`}
          layoutId={`dot-${change.id}`}
        />
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          {typeConfig.label}
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-auto">
          #{index + 1}
        </span>
      </div>

      {/* Content preview */}
      <div className="mb-3 pl-4">
        {change.type === "replacement" ? (
          <div className="space-y-1.5">
            <p className="text-sm text-zinc-400 dark:text-zinc-500 line-through leading-relaxed">
              {truncate(change.oldContent || "", 60)}
            </p>
            <p className="text-sm text-zinc-700 dark:text-zinc-200 leading-relaxed">
              {truncate(change.content, 60)}
            </p>
          </div>
        ) : (
          <p
            className={`text-sm leading-relaxed ${
              change.type === "deletion"
                ? "text-zinc-400 dark:text-zinc-500 line-through"
                : "text-zinc-700 dark:text-zinc-200"
            }`}
          >
            {truncate(change.content, 80)}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pl-4">
        <M.button
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onApprove();
          }}
          aria-label={`Accept change: ${change.type}`}
          className="flex-1 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-300 dark:hover:border-emerald-700 hover:text-emerald-700 dark:hover:text-emerald-300 rounded transition-colors"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Accept
        </M.button>
        <M.button
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onReject();
          }}
          aria-label={`Reject change: ${change.type}`}
          className="flex-1 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-600 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-700 hover:text-red-700 dark:hover:text-red-300 rounded transition-colors"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Reject
        </M.button>
      </div>
    </M.div>
  );
}

// =============================================================================
// Formatting Change Card
// =============================================================================

interface FormattingChangeCardProps {
  change: FormattingChangeWithPosition;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}

function FormattingChangeCard({
  change,
  index,
  isSelected,
  onSelect,
}: FormattingChangeCardProps) {
  const truncate = (text: string, max: number) =>
    text.length > max ? text.slice(0, max) + "..." : text;

  const typeConfig = {
    formatAdded: {
      label: "Added",
      description: `${getMarkTypeLabel(change.markType)} applied`,
      dotColor: "bg-blue-500",
      icon: (
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
      ),
    },
    formatRemoved: {
      label: "Removed",
      description: `${getMarkTypeLabel(change.markType)} removed`,
      dotColor: "bg-orange-500",
      icon: (
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20 12H4"
          />
        </svg>
      ),
    },
    formatModified: {
      label: "Changed",
      description: `${getMarkTypeLabel(change.markType)} modified`,
      dotColor: "bg-purple-500",
      icon: (
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
          />
        </svg>
      ),
    },
  }[change.type];

  // Get human-readable attribute description
  const getAttrDescription = () => {
    if (change.type === "formatAdded" && change.newAttrs) {
      if (change.newAttrs.color) return `Color: ${change.newAttrs.color}`;
      if (change.newAttrs.href) return `Link: ${change.newAttrs.href}`;
    }
    if (change.type === "formatRemoved" && change.oldAttrs) {
      if (change.oldAttrs.color) return `Was: ${change.oldAttrs.color}`;
      if (change.oldAttrs.href) return `Was: ${change.oldAttrs.href}`;
    }
    if (change.type === "formatModified") {
      if (change.oldAttrs?.color && change.newAttrs?.color) {
        return `${change.oldAttrs.color} → ${change.newAttrs.color}`;
      }
      if (change.oldAttrs?.href && change.newAttrs?.href) {
        return `Link changed`;
      }
    }
    return null;
  };

  const attrDescription = getAttrDescription();

  return (
    <M.div
      className={`px-4 py-3 cursor-pointer transition-colors ${
        isSelected
          ? "bg-zinc-50 dark:bg-zinc-700/50"
          : "hover:bg-zinc-50/50 dark:hover:bg-zinc-700/30"
      }`}
      onClick={onSelect}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{
        duration: 0.25,
        delay: Math.min(index * 0.05, 0.3),
      }}
      layout
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <M.span
          className={`w-2 h-2 rounded-full ${typeConfig.dotColor}`}
          layoutId={`dot-${change.id}`}
        />
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5">
          {typeConfig.icon}
          {typeConfig.description}
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-auto">
          #{index + 1}
        </span>
      </div>

      {/* Content preview */}
      <div className="mb-2 pl-4">
        <p className="text-sm text-zinc-700 dark:text-zinc-200 leading-relaxed">
          &ldquo;{truncate(change.content, 60)}&rdquo;
        </p>
        {attrDescription && (
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            {attrDescription}
          </p>
        )}
      </div>
    </M.div>
  );
}

export type { ChangeWithPosition as Change, DiffSummary };
