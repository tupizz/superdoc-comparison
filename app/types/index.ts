// Document state types
export interface DocumentState {
  file: File | null
  base64: string | null
  name: string | null
}

// Change tracking types
export interface TrackedChange {
  id: string
  type: 'insertion' | 'deletion' | 'format'
  content: string
  user?: string
  timestamp?: string
}

// Application state
export type AppState = 'upload' | 'viewing' | 'comparing'

// Change summary from AI
export interface ChangeSummary {
  summary: string
  changes: string[]
  loading: boolean
  error: string | null
}

// SuperDoc instance type (basic - full types from library)
export interface SuperDocInstance {
  setDocumentMode: (mode: 'editing' | 'suggesting' | 'viewing') => void
  export: () => Promise<Blob>
  destroy: () => void
  editor: {
    getHTML: () => string
    getJSON: () => unknown
    replaceFile: (file: ArrayBuffer) => void
    state: unknown
  }
}

// Props for components
export interface DocumentUploaderProps {
  onUpload: (file: File, base64: string) => void
  disabled?: boolean
}

export interface DocumentEditorProps {
  document: string | null
  onReady?: (instance: SuperDocInstance) => void
  onChangesDetected?: (changes: TrackedChange[]) => void
}

export interface ChangeSummaryProps {
  summary: ChangeSummary
  onClose: () => void
}

export interface UploadNewVersionProps {
  onUpload: (file: File, base64: string) => void
  disabled?: boolean
}
