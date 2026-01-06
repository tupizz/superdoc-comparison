// Props for components
export interface DocumentUploaderProps {
  onUpload: (file: File, base64: string) => void
  disabled?: boolean
  label?: string
}
