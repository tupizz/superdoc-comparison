"use client";

import {
  ArrowPathIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  SparklesIcon,
  ShieldCheckIcon,
  BoltIcon,
} from "@heroicons/react/24/outline";
import { CheckIcon } from "@heroicons/react/24/solid";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import DocumentUploader from "./DocumentUploader";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M = motion as any;

// Dynamic import for DocumentComparison to avoid SSR issues
const DocumentComparison = dynamic(() => import("./DocumentComparison"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-zinc-100 dark:bg-zinc-900 rounded-lg flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-zinc-300 dark:border-zinc-600 border-t-zinc-500 dark:border-t-zinc-400 rounded-full animate-spin" />
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          Loading editor...
        </span>
      </div>
    </div>
  ),
});

interface DocumentVersion {
  file: File;
  base64: string;
  name: string;
}

export default function DocComparisonApp() {
  const [v1Document, setV1Document] = useState<DocumentVersion | null>(null);
  const [v2Document, setV2Document] = useState<DocumentVersion | null>(null);

  const isComparing = v1Document && v2Document;

  const handleV1Upload = useCallback((file: File, base64: string) => {
    setV1Document({ file, base64, name: file.name });
  }, []);

  const handleV2Upload = useCallback((file: File, base64: string) => {
    setV2Document({ file, base64, name: file.name });
  }, []);

  const handleReset = useCallback(() => {
    setV1Document(null);
    setV2Document(null);
  }, []);

  // Determine current step
  const currentStep = !v1Document && !v2Document ? 1 : v1Document && v2Document ? 3 : 2;

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Gradient background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_80%_20%,rgba(78,68,163,0.1),transparent)]" />
      </div>

      {/* Header */}
      <header className="border-b border-white/5 bg-zinc-950/50 backdrop-blur-xl sticky top-0 z-40">
        <div className={`mx-auto px-6 h-16 flex items-center justify-between ${isComparing ? 'max-w-[1920px]' : 'max-w-7xl'}`}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl blur opacity-40" />
              <div className="relative w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <DocumentTextIcon className="h-5 w-5 text-white" />
              </div>
            </div>
            <div>
              <span className="text-sm font-semibold text-white">
                Superdoc
              </span>
              <span className="text-sm text-zinc-500 ml-1.5">
                Document Comparison
              </span>
            </div>
          </div>

          <AnimatePresence>
            {(v1Document || v2Document) && (
              <M.button
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                <ArrowPathIcon className="h-4 w-4" />
                Start over
              </M.button>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Main Content */}
      <main className={`mx-auto px-6 ${isComparing ? 'max-w-[1920px]' : 'max-w-7xl'}`}>
        <AnimatePresence mode="wait">
          {/* Upload State */}
          {!isComparing && (
            <M.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="py-16 md:py-24"
            >
              {/* Hero Section */}
              <div className="text-center max-w-2xl mx-auto mb-16">
                <M.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium mb-6"
                >
                  <SparklesIcon className="h-3.5 w-3.5" />
                  AI-Powered Analysis
                </M.div>

                <M.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight"
                >
                  Compare your
                  <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent"> documents</span>
                </M.h1>

                <M.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-lg text-zinc-400"
                >
                  Upload two versions of your document to instantly see what changed.
                  Get AI-powered summaries and review changes with ease.
                </M.p>
              </div>

              {/* Steps Indicator */}
              <M.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="flex justify-center mb-12"
              >
                <nav aria-label="Progress">
                  <ol className="flex items-center">
                    <StepItem step={1} currentStep={currentStep} label="Original" isLast={false} />
                    <StepItem step={2} currentStep={currentStep} label="Modified" isLast={false} />
                    <StepItem step={3} currentStep={currentStep} label="Compare" isLast={true} />
                  </ol>
                </nav>
              </M.div>

              {/* Upload Cards */}
              <M.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-8"
              >
                {/* Original Document */}
                <UploadCard
                  title="Original Document"
                  subtitle="The base version to compare against"
                  step={1}
                  isActive={!v1Document}
                  isComplete={!!v1Document}
                  document={v1Document}
                  onUpload={handleV1Upload}
                  onRemove={() => setV1Document(null)}
                />

                {/* Modified Document */}
                <UploadCard
                  title="Modified Document"
                  subtitle="The updated version with changes"
                  step={2}
                  isActive={!!v1Document && !v2Document}
                  isComplete={!!v2Document}
                  document={v2Document}
                  onUpload={handleV2Upload}
                  onRemove={() => setV2Document(null)}
                />
              </M.div>

              {/* Compare Button */}
              <AnimatePresence>
                {v1Document && v2Document && (
                  <M.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex justify-center"
                  >
                    <button className="group relative inline-flex items-center gap-2 px-8 py-3 text-sm font-semibold text-white rounded-xl overflow-hidden transition-all hover:scale-105">
                      <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-indigo-600" />
                      <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <span className="relative">Start Comparison</span>
                      <ArrowRightIcon className="relative h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </M.div>
                )}
              </AnimatePresence>

              {/* Features */}
              <M.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto"
              >
                <FeatureCard
                  icon={BoltIcon}
                  title="Instant Analysis"
                  description="See all changes highlighted in seconds with our advanced diff algorithm"
                />
                <FeatureCard
                  icon={SparklesIcon}
                  title="AI Summary"
                  description="Get intelligent summaries explaining what changed and why it matters"
                />
                <FeatureCard
                  icon={ShieldCheckIcon}
                  title="Review & Accept"
                  description="Accept or reject individual changes with a single click"
                />
              </M.div>
            </M.div>
          )}

          {/* Comparison View */}
          {isComparing && (
            <M.div
              key="comparison"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="py-6 h-[calc(100vh-100px)]"
            >
              <DocumentComparison
                originalBase64={v1Document.base64}
                modifiedBase64={v2Document.base64}
                originalName={v1Document.name}
                modifiedName={v2Document.name}
              />
            </M.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// Step Item Component (includes connector)
function StepItem({
  step,
  currentStep,
  label,
  isLast,
}: {
  step: number;
  currentStep: number;
  label: string;
  isLast: boolean;
}) {
  const isComplete = currentStep > step;
  const isActive = currentStep === step;

  return (
    <li className={`flex items-center ${!isLast ? '' : ''}`}>
      <div className="flex flex-col items-center">
        <div
          className={`
            w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all
            ${isComplete
              ? "bg-violet-500 text-white"
              : isActive
              ? "bg-zinc-900 text-violet-400 ring-2 ring-violet-500"
              : "bg-zinc-900 text-zinc-500 ring-1 ring-zinc-700"
            }
          `}
        >
          {isComplete ? <CheckIcon className="h-5 w-5" /> : step}
        </div>
        <span
          className={`text-xs font-medium mt-2 ${
            isActive ? "text-violet-400" : isComplete ? "text-white" : "text-zinc-500"
          }`}
        >
          {label}
        </span>
      </div>

      {/* Connector line */}
      {!isLast && (
        <div
          className={`w-24 h-0.5 mx-3 mb-6 transition-colors ${
            currentStep > step ? "bg-violet-500" : "bg-zinc-800"
          }`}
        />
      )}
    </li>
  );
}

// Upload Card Component
function UploadCard({
  title,
  subtitle,
  step,
  isActive,
  isComplete,
  document,
  onUpload,
  onRemove,
}: {
  title: string;
  subtitle: string;
  step: number;
  isActive: boolean;
  isComplete: boolean;
  document: DocumentVersion | null;
  onUpload: (file: File, base64: string) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`
        relative rounded-2xl transition-all duration-300
        ${isActive ? "ring-2 ring-violet-500/50" : ""}
      `}
    >
      {/* Gradient border effect */}
      <div
        className={`
          absolute -inset-px rounded-2xl transition-opacity duration-300
          ${isActive || isComplete ? "opacity-100" : "opacity-0"}
          ${isComplete ? "bg-gradient-to-br from-emerald-500/50 to-emerald-600/50" : "bg-gradient-to-br from-violet-500/50 to-indigo-500/50"}
        `}
      />

      <div className="relative bg-zinc-900 rounded-2xl p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`
                  w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                  ${isComplete ? "bg-emerald-500 text-white" : isActive ? "bg-violet-500 text-white" : "bg-zinc-800 text-zinc-500"}
                `}
              >
                {isComplete ? <CheckIcon className="h-3 w-3" /> : step}
              </span>
              <h3 className="text-sm font-semibold text-white">{title}</h3>
            </div>
            <p className="text-xs text-zinc-500">{subtitle}</p>
          </div>
          {isComplete && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium">
              <CheckCircleIcon className="h-3 w-3" />
              Ready
            </span>
          )}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {document ? (
            <M.div
              key="uploaded"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-800/50 rounded-xl p-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-500/20 flex items-center justify-center">
                  <DocumentTextIcon className="h-5 w-5 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {document.name}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {(document.file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  onClick={onRemove}
                  className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors"
                >
                  Remove
                </button>
              </div>
            </M.div>
          ) : (
            <M.div
              key="uploader"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <DocumentUploader
                onUpload={onUpload}
                label={`Drop your ${step === 1 ? "original" : "modified"} document`}
                disabled={!isActive && step !== 1}
              />
            </M.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Feature Card Component
function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="group relative p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 flex items-center justify-center mb-4 group-hover:from-violet-500/20 group-hover:to-indigo-500/20 transition-colors">
        <Icon className="h-5 w-5 text-violet-400" />
      </div>
      <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
      <p className="text-sm text-zinc-500 leading-relaxed">{description}</p>
    </div>
  );
}
