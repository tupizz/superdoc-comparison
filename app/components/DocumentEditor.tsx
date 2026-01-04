'use client'

import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react'
import type { TrackedChange } from '@/app/types'

// Node type for tracked changes
interface DocNode {
  marks?: Array<{
    type?: { name?: string }
    attrs?: { user?: string; date?: string }
  }>
  text?: string
  content?: DocNode[]
}

// SuperDoc types (simplified - library provides full types)
interface SuperDocConfig {
  selector: string | HTMLElement
  documents: Array<{
    id: string
    data: string | ArrayBuffer | Blob
    type: 'docx' | 'pdf'
  }>
  modules?: {
    toolbar?: boolean
    comments?: {
      readOnly?: boolean
      allowResolve?: boolean
    }
  }
}

interface SuperDocInstance {
  setDocumentMode: (mode: 'editing' | 'suggesting' | 'viewing') => void
  destroy: () => void
  getRole: () => string
  on: (event: string, callback: (...args: unknown[]) => void) => void
  activeEditor?: {
    getHTML: () => string
    getJSON: () => unknown
    state: unknown
  }
}

export interface DocumentEditorRef {
  getInstance: () => SuperDocInstance | null
  getHTML: () => string | null
  enableTrackChanges: () => void
  loadNewDocument: (base64: string) => Promise<void>
}

interface DocumentEditorProps {
  document: string
  documentName?: string
  onReady?: () => void
  onChangesDetected?: (changes: TrackedChange[]) => void
}

// Generate unique mount ID to prevent Vue mounting conflicts
let mountCounter = 0

// Convert base64 data URL to Blob
function base64ToBlob(base64: string): Blob {
  // Remove data URL prefix if present
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64

  // Decode base64 to binary
  const binaryString = atob(base64Data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  // Create blob with DOCX MIME type
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

const DocumentEditor = forwardRef<DocumentEditorRef, DocumentEditorProps>(
  function DocumentEditor({ document, documentName, onReady, onChangesDetected }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const instanceRef = useRef<SuperDocInstance | null>(null)
    const mountIdRef = useRef<number>(0)
    const [isMounted, setIsMounted] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [containerKey, setContainerKey] = useState(() => `superdoc-${Date.now()}`)

    // SSR safety check - only render on client
    useEffect(() => {
      setIsMounted(true)
    }, [])

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      getInstance: () => instanceRef.current,
      getHTML: () => {
        if (instanceRef.current?.activeEditor) {
          return instanceRef.current.activeEditor.getHTML()
        }
        return null
      },
      enableTrackChanges: () => {
        if (instanceRef.current) {
          instanceRef.current.setDocumentMode('suggesting')
        }
      },
      loadNewDocument: async (base64: string) => {
        // Re-initialize SuperDoc with new document
        if (instanceRef.current) {
          instanceRef.current.destroy()
          instanceRef.current = null
        }
        // Generate new mount ID for the new document load
        mountCounter++
        const newMountId = mountCounter
        mountIdRef.current = newMountId
        setContainerKey(`superdoc-${Date.now()}`)
        // Small delay to let React update the DOM
        await new Promise(resolve => setTimeout(resolve, 100))
        await initializeSuperDoc(base64, newMountId)
      },
    }))

    const initializeSuperDoc = useCallback(async (docData: string, currentMountId: number) => {
      if (!containerRef.current) return

      // Only proceed if this is still the current mount
      if (mountIdRef.current !== currentMountId) {
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        // Clean up existing instance first
        if (instanceRef.current) {
          try {
            instanceRef.current.destroy()
          } catch (e) {
            console.warn('Error destroying previous instance:', e)
          }
          instanceRef.current = null
          // Small delay to let Vue fully clean up
          await new Promise(resolve => setTimeout(resolve, 50))
        }

        // Check again if this is still the current mount after delay
        if (mountIdRef.current !== currentMountId) {
          return
        }

        // Dynamic import to avoid SSR issues
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SuperDocModule = await import('@harbour-enterprises/superdoc') as any
        const SuperDoc = SuperDocModule.SuperDoc || SuperDocModule.default || SuperDocModule

        // Check mount ID again after async import
        if (mountIdRef.current !== currentMountId || !containerRef.current) {
          return
        }

        // Clear container completely
        containerRef.current.innerHTML = ''

        // Convert base64 to Blob for SuperDoc
        const documentBlob = base64ToBlob(docData)

        const config: SuperDocConfig = {
          selector: containerRef.current,
          documents: [
            {
              id: documentName || 'main-doc',
              data: documentBlob,
              type: 'docx',
            },
          ],
          modules: {
            toolbar: true,
            comments: {
              readOnly: false,
              allowResolve: true,
            },
          },
        }

        const superdoc = new SuperDoc(config) as SuperDocInstance

        // Only set instanceRef if this is still the current mount
        if (mountIdRef.current !== currentMountId) {
          try {
            superdoc.destroy()
          } catch (e) {
            // Ignore
          }
          return
        }

        instanceRef.current = superdoc

        // Listen for ready event
        superdoc.on('ready', () => {
          // Only update state if still current mount
          if (mountIdRef.current === currentMountId) {
            setIsLoading(false)
            // Enable track changes mode by default
            superdoc.setDocumentMode('suggesting')
            onReady?.()
          }
        })

        // Listen for changes
        superdoc.on('change', () => {
          if (onChangesDetected && superdoc.activeEditor && mountIdRef.current === currentMountId) {
            // Extract tracked changes from the editor state
            try {
              const state = superdoc.activeEditor.state as { doc?: { content?: DocNode[] } }
              const changes = extractTrackedChanges(state)
              onChangesDetected(changes)
            } catch (e) {
              console.warn('Could not extract tracked changes:', e)
            }
          }
        })

      } catch (err) {
        console.error('Failed to initialize SuperDoc:', err)
        if (mountIdRef.current === currentMountId) {
          setError(err instanceof Error ? err.message : 'Failed to load document editor')
          setIsLoading(false)
        }
      }
    }, [documentName, onReady, onChangesDetected])

    // Initialize on mount (only after client-side mounting)
    useEffect(() => {
      if (!isMounted) return

      // Increment mount counter to get unique ID for this mount
      mountCounter++
      const currentMountId = mountCounter
      mountIdRef.current = currentMountId

      if (document) {
        initializeSuperDoc(document, currentMountId)
      }

      return () => {
        // Invalidate this mount ID so any pending async operations are cancelled
        mountIdRef.current = -1

        if (instanceRef.current) {
          try {
            instanceRef.current.destroy()
          } catch (e) {
            console.warn('Error during cleanup:', e)
          }
          instanceRef.current = null
        }

        // Regenerate container key to force fresh DOM on next mount
        setContainerKey(`superdoc-${Date.now()}`)
      }
    }, [document, initializeSuperDoc, isMounted])

    // Show loading state until client-side mounted
    if (!isMounted) {
      return (
        <div className="relative w-full h-full min-h-[600px] bg-white rounded-lg overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <div className="flex flex-col items-center gap-3">
              <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-gray-600">Initializing editor...</span>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="relative w-full h-full min-h-[600px] bg-white rounded-lg overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
            <div className="flex flex-col items-center gap-3">
              <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
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
              <span className="text-gray-600">Loading document...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-50 z-10">
            <div className="text-center p-4">
              <div className="text-red-500 mb-2">
                <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-red-600 font-medium">Error loading document</p>
              <p className="text-red-500 text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        <div
          key={containerKey}
          ref={containerRef}
          className="w-full h-full superdoc-container"
          style={{ minHeight: '600px' }}
        />
      </div>
    )
  }
)

// Helper function to extract tracked changes from editor state
function extractTrackedChanges(state: { doc?: { content?: DocNode[] } }): TrackedChange[] {
  const changes: TrackedChange[] = []

  // This is a simplified extraction - actual implementation depends on SuperDoc's internal structure
  // The trackChangesHelpers from SuperDoc provides better access to this data
  try {
    if (state?.doc?.content) {
      // Walk through document nodes looking for tracked change marks
      walkNodes(state.doc.content, (node: DocNode) => {
        if (node.marks) {
          for (const mark of node.marks) {
            if (mark.type?.name === 'insertion') {
              changes.push({
                id: `insertion-${changes.length}`,
                type: 'insertion',
                content: node.text || '',
                user: mark.attrs?.user,
                timestamp: mark.attrs?.date,
              })
            } else if (mark.type?.name === 'deletion') {
              changes.push({
                id: `deletion-${changes.length}`,
                type: 'deletion',
                content: node.text || '',
                user: mark.attrs?.user,
                timestamp: mark.attrs?.date,
              })
            } else if (mark.type?.name === 'format_change') {
              changes.push({
                id: `format-${changes.length}`,
                type: 'format',
                content: node.text || '',
                user: mark.attrs?.user,
                timestamp: mark.attrs?.date,
              })
            }
          }
        }
      })
    }
  } catch (e) {
    console.warn('Error extracting tracked changes:', e)
  }

  return changes
}

// Helper to recursively walk document nodes
function walkNodes(nodes: DocNode[], callback: (node: DocNode) => void) {
  for (const node of nodes) {
    callback(node)
    if (node.content) {
      walkNodes(node.content, callback)
    }
  }
}

export default DocumentEditor
