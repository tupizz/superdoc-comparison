'use client'

import { useState, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { DocumentTextIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import DocumentUploader from './DocumentUploader'
import UploadNewVersion from './UploadNewVersion'
import ChangeSummary from './ChangeSummary'
import { Heading } from './catalyst/heading'
import { Badge } from './catalyst/badge'
import { Button } from './catalyst/button'
import type { AppState, TrackedChange } from '@/app/types'
import type { ChangeSummaryOutput } from '@/app/lib/openai'
import type { DocumentEditorRef } from './DocumentEditor'

// Dynamic import for SuperDoc editor to avoid SSR issues
const DocumentEditor = dynamic(() => import('./DocumentEditor'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[600px] bg-zinc-800 rounded-lg flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-zinc-400">Loading editor...</span>
      </div>
    </div>
  ),
})

interface DocumentVersion {
  file: File
  base64: string
  name: string
}

interface SummaryState {
  data: (ChangeSummaryOutput & { bulletPoints: string[] }) | null
  loading: boolean
  error: string | null
}

export default function DocComparisonApp() {
  const [appState, setAppState] = useState<AppState>('upload')
  const [v1Document, setV1Document] = useState<DocumentVersion | null>(null)
  const [v2Document, setV2Document] = useState<DocumentVersion | null>(null)
  const [trackedChanges, setTrackedChanges] = useState<TrackedChange[]>([])
  const [summary, setSummary] = useState<SummaryState>({
    data: null,
    loading: false,
    error: null,
  })
  const [showSummary, setShowSummary] = useState(false)

  const editorRef = useRef<DocumentEditorRef>(null)

  // Handle V1 document upload
  const handleV1Upload = useCallback((file: File, base64: string) => {
    setV1Document({
      file,
      base64,
      name: file.name,
    })
    setAppState('viewing')
    // Reset any previous comparison state
    setV2Document(null)
    setTrackedChanges([])
    setSummary({ data: null, loading: false, error: null })
    setShowSummary(false)
  }, [])

  // Handle V2 document upload for comparison
  const handleV2Upload = useCallback(async (file: File, base64: string) => {
    setV2Document({
      file,
      base64,
      name: file.name,
    })
    setAppState('comparing')

    // Load the new document into the editor
    if (editorRef.current) {
      await editorRef.current.loadNewDocument(base64)
    }

    // Generate AI summary
    setSummary({ data: null, loading: true, error: null })
    setShowSummary(true)

    try {
      // For demo purposes, we'll create some mock changes
      // In production, these would come from the actual document comparison
      const mockChanges = [
        { type: 'insertion', content: 'New content added to the document' },
        { type: 'deletion', content: 'Old content that was removed' },
        { type: 'format', content: 'Title formatting changed to bold' },
      ]

      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changes: mockChanges,
          documentName: file.name,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate summary')
      }

      const data = await response.json()
      setSummary({
        data,
        loading: false,
        error: null,
      })
    } catch (error) {
      console.error('Error generating summary:', error)
      setSummary({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to generate summary',
      })
    }
  }, [])

  // Handle tracked changes from editor
  const handleChangesDetected = useCallback((changes: TrackedChange[]) => {
    setTrackedChanges(changes)
  }, [])

  // Reset to initial state
  const handleReset = useCallback(() => {
    setAppState('upload')
    setV1Document(null)
    setV2Document(null)
    setTrackedChanges([])
    setSummary({ data: null, loading: false, error: null })
    setShowSummary(false)
  }, [])

  // Close summary panel
  const handleCloseSummary = useCallback(() => {
    setShowSummary(false)
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DocumentTextIcon className="h-8 w-8 text-blue-500" />
            <Heading level={1} className="!text-xl !sm:text-xl">
              DOCX Comparison Engine
            </Heading>
            {appState !== 'upload' && (
              <Badge color={appState === 'comparing' ? 'green' : 'zinc'}>
                {appState === 'viewing' ? 'Viewing' : 'Comparing'}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3">
            {appState !== 'upload' && (
              <>
                {v1Document && (
                  <span className="text-sm text-zinc-400">
                    {v1Document.name}
                    {v2Document && (
                      <span className="text-zinc-600"> → {v2Document.name}</span>
                    )}
                  </span>
                )}
                <Button outline onClick={handleReset}>
                  <ArrowPathIcon className="h-4 w-4" data-slot="icon" />
                  Start Over
                </Button>
              </>
            )}
            {appState === 'viewing' && (
              <UploadNewVersion onUpload={handleV2Upload} />
            )}
            {appState === 'comparing' && (
              <UploadNewVersion onUpload={handleV2Upload} />
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {appState === 'upload' && (
          <div className="flex flex-col items-center justify-center min-h-[70vh]">
            <div className="text-center mb-8">
              <Heading level={2} className="!text-3xl mb-2">
                Upload your DOCX document
              </Heading>
              <p className="text-zinc-400">
                Upload the first version of your document to get started
              </p>
            </div>
            <DocumentUploader onUpload={handleV1Upload} />
          </div>
        )}

        {(appState === 'viewing' || appState === 'comparing') && v1Document && (
          <div className="space-y-4">
            {/* Document info bar */}
            {appState === 'comparing' && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <Badge color="green">Comparing</Badge>
                  <span className="text-zinc-300">
                    Showing changes between <strong>{v1Document.name}</strong> and{' '}
                    <strong>{v2Document?.name}</strong>
                  </span>
                </div>
              </div>
            )}

            {/* Editor */}
            <div className="rounded-lg overflow-hidden border border-zinc-800">
              <DocumentEditor
                ref={editorRef}
                document={appState === 'comparing' && v2Document ? v2Document.base64 : v1Document.base64}
                documentName={appState === 'comparing' && v2Document ? v2Document.name : v1Document.name}
                onChangesDetected={handleChangesDetected}
              />
            </div>

            {/* Instructions when viewing V1 */}
            {appState === 'viewing' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
                <p className="text-zinc-400">
                  Your document is loaded. Make edits in MS Word Desktop, then upload the new version to compare changes.
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Change Summary Panel */}
      {showSummary && (
        <ChangeSummary
          summary={summary.data!}
          loading={summary.loading}
          error={summary.error}
          onClose={handleCloseSummary}
        />
      )}
    </div>
  )
}
