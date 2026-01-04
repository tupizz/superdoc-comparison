'use client'

import { XMarkIcon, SparklesIcon } from '@heroicons/react/20/solid'
import { Badge } from './catalyst/badge'
import type { ChangeSummaryOutput } from '@/app/lib/openai'

interface ChangeSummaryProps {
  summary: ChangeSummaryOutput & { bulletPoints: string[] }
  loading: boolean
  error: string | null
  onClose: () => void
}

export default function ChangeSummary({ summary, loading, error, onClose }: ChangeSummaryProps) {
  if (loading) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-700 p-4 shadow-lg z-50">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <SparklesIcon className="h-5 w-5 text-blue-400 animate-pulse" />
            <span className="text-zinc-300">Analyzing document changes...</span>
            <svg className="animate-spin h-4 w-4 text-blue-400" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-red-900/90 border-t border-red-700 p-4 shadow-lg z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-red-300">Error: {error}</span>
          </div>
          <button
            onClick={onClose}
            className="text-red-300 hover:text-white transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    )
  }

  if (!summary) {
    return null
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur border-t border-zinc-700 p-4 shadow-lg z-50 max-h-[40vh] overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-blue-400" />
            <span className="text-white font-medium">AI Change Summary</span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors p-1"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Overview */}
        <p className="text-zinc-300 mb-4">{summary.overview}</p>

        {/* Categorized Changes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Text Changes */}
          {summary.textChanges.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge color="blue">Text Changes</Badge>
                <span className="text-xs text-zinc-500">{summary.textChanges.length}</span>
              </div>
              <ul className="space-y-1">
                {summary.textChanges.map((change, index) => (
                  <li key={index} className="text-sm text-zinc-400 flex items-start gap-2">
                    <span className="text-blue-400 mt-1">•</span>
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Formatting Changes */}
          {summary.formattingChanges.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge color="amber">Formatting</Badge>
                <span className="text-xs text-zinc-500">{summary.formattingChanges.length}</span>
              </div>
              <ul className="space-y-1">
                {summary.formattingChanges.map((change, index) => (
                  <li key={index} className="text-sm text-zinc-400 flex items-start gap-2">
                    <span className="text-amber-400 mt-1">•</span>
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Structural Changes */}
          {summary.structuralChanges.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge color="purple">Structure</Badge>
                <span className="text-xs text-zinc-500">{summary.structuralChanges.length}</span>
              </div>
              <ul className="space-y-1">
                {summary.structuralChanges.map((change, index) => (
                  <li key={index} className="text-sm text-zinc-400 flex items-start gap-2">
                    <span className="text-purple-400 mt-1">•</span>
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Full Summary (if all categories are empty, show bullet points) */}
        {summary.textChanges.length === 0 &&
         summary.formattingChanges.length === 0 &&
         summary.structuralChanges.length === 0 && (
          <div className="mt-4">
            <p className="text-sm text-zinc-400">{summary.summary}</p>
          </div>
        )}
      </div>
    </div>
  )
}
