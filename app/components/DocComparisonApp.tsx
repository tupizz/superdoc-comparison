'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { DocumentTextIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import DocumentUploader from './DocumentUploader'
import { Heading } from './catalyst/heading'
import { Badge } from './catalyst/badge'
import { Button } from './catalyst/button'

// Dynamic import for DocumentComparison to avoid SSR issues
const DocumentComparison = dynamic(() => import('./DocumentComparison'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[600px] bg-zinc-800 rounded-lg flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-zinc-400">Loading comparison view...</span>
      </div>
    </div>
  ),
})

interface DocumentVersion {
  file: File
  base64: string
  name: string
}

export default function DocComparisonApp() {
  const [v1Document, setV1Document] = useState<DocumentVersion | null>(null)
  const [v2Document, setV2Document] = useState<DocumentVersion | null>(null)

  const isComparing = v1Document && v2Document

  const handleV1Upload = useCallback((file: File, base64: string) => {
    setV1Document({ file, base64, name: file.name })
  }, [])

  const handleV2Upload = useCallback((file: File, base64: string) => {
    setV2Document({ file, base64, name: file.name })
  }, [])

  const handleReset = useCallback(() => {
    setV1Document(null)
    setV2Document(null)
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-[1800px] mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DocumentTextIcon className="h-8 w-8 text-blue-500" />
            <Heading level={1} className="!text-xl !sm:text-xl">
              DOCX Comparison Engine
            </Heading>
            {isComparing && (
              <Badge color="green">Comparing</Badge>
            )}
          </div>

          <div className="flex items-center gap-3">
            {(v1Document || v2Document) && (
              <Button outline onClick={handleReset}>
                <ArrowPathIcon className="h-4 w-4" data-slot="icon" />
                Start Over
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1800px] mx-auto px-4 py-6">
        {/* Upload State - Two documents required */}
        {!isComparing && (
          <div className="flex flex-col items-center justify-center min-h-[70vh]">
            <div className="text-center mb-8">
              <Heading level={2} className="!text-3xl mb-2">
                Compare DOCX Documents
              </Heading>
              <p className="text-zinc-400">
                Upload two versions of your document to see the differences
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
              {/* Original Document */}
              <div className="flex flex-col">
                <div className="text-center mb-3">
                  <span className="text-sm font-medium text-zinc-300">Original Version</span>
                </div>
                {v1Document ? (
                  <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-6 text-center">
                    <DocumentTextIcon className="h-12 w-12 text-green-500 mx-auto mb-3" />
                    <p className="text-zinc-200 font-medium truncate">{v1Document.name}</p>
                    <p className="text-zinc-500 text-sm mt-1">Ready</p>
                    <Button
                      outline
                      className="mt-4"
                      onClick={() => setV1Document(null)}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <DocumentUploader onUpload={handleV1Upload} label="Drop original document" />
                )}
              </div>

              {/* Modified Document */}
              <div className="flex flex-col">
                <div className="text-center mb-3">
                  <span className="text-sm font-medium text-zinc-300">Modified Version</span>
                </div>
                {v2Document ? (
                  <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-6 text-center">
                    <DocumentTextIcon className="h-12 w-12 text-blue-500 mx-auto mb-3" />
                    <p className="text-zinc-200 font-medium truncate">{v2Document.name}</p>
                    <p className="text-zinc-500 text-sm mt-1">Ready</p>
                    <Button
                      outline
                      className="mt-4"
                      onClick={() => setV2Document(null)}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <DocumentUploader onUpload={handleV2Upload} label="Drop modified document" />
                )}
              </div>
            </div>

            {/* Status message */}
            <div className="mt-8 text-center">
              {!v1Document && !v2Document && (
                <p className="text-zinc-500">Upload both documents to start comparison</p>
              )}
              {v1Document && !v2Document && (
                <p className="text-zinc-400">Now upload the modified version</p>
              )}
              {!v1Document && v2Document && (
                <p className="text-zinc-400">Now upload the original version</p>
              )}
            </div>
          </div>
        )}

        {/* Comparing State - Side by Side */}
        {isComparing && (
          <div className="h-[calc(100vh-160px)]">
            <DocumentComparison
              originalBase64={v1Document.base64}
              modifiedBase64={v2Document.base64}
              originalName={v1Document.name}
              modifiedName={v2Document.name}
            />
          </div>
        )}
      </main>
    </div>
  )
}
