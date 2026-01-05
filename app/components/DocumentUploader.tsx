'use client'

import { useCallback, useState } from 'react'
import type { DocumentUploaderProps } from '@/app/types'

export default function DocumentUploader({ onUpload, disabled = false, label }: DocumentUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const processFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.docx')) {
      alert('Please upload a .docx file')
      return
    }

    setIsProcessing(true)

    try {
      // Convert file to base64
      const buffer = await file.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      const dataUri = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${base64}`

      onUpload(file, dataUri)
    } catch (error) {
      console.error('Error processing file:', error)
      alert('Error processing file. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }, [onUpload])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setIsDragging(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (disabled) return

    const files = e.dataTransfer.files
    if (files.length > 0) {
      processFile(files[0])
    }
  }, [disabled, processFile])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      processFile(files[0])
    }
    // Reset input so the same file can be selected again
    e.target.value = ''
  }, [processFile])

  const handleClick = useCallback(() => {
    if (!disabled && !isProcessing) {
      document.getElementById('docx-file-input')?.click()
    }
  }, [disabled, isProcessing])

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative flex flex-col items-center justify-center
        w-full h-64
        border-2 border-dashed rounded-xl
        transition-all duration-200 cursor-pointer
        ${isDragging
          ? 'border-blue-400 bg-blue-500/10'
          : 'border-gray-600 bg-gray-800/50 hover:border-gray-500 hover:bg-gray-800/70'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${isProcessing ? 'cursor-wait' : ''}
      `}
    >
      <input
        id="docx-file-input"
        type="file"
        accept=".docx"
        onChange={handleFileInput}
        className="hidden"
        disabled={disabled || isProcessing}
      />

      {/* DOCX Icon */}
      <div className="mb-6">
        <svg
          className={`w-20 h-20 ${isDragging ? 'text-blue-400' : 'text-blue-500'}`}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M14 2H6C4.9 2 4 2.9 4 4v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
          <path d="M8 12h8v2H8zm0 4h8v2H8zm0-8h3v2H8z" opacity="0.6" />
        </svg>
      </div>

      {/* Text */}
      <div className="text-center">
        {isProcessing ? (
          <div className="flex items-center gap-2 text-gray-300">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
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
            <span>Processing document...</span>
          </div>
        ) : (
          <>
            <p className="text-lg text-gray-300 mb-2">
              {label || 'Drag-and-drop or upload DOCX'}
            </p>
            <p className="text-sm text-gray-500">
              Click to browse or drop your file here
            </p>
          </>
        )}
      </div>

      {/* File type indicator */}
      <div className="absolute bottom-4 text-xs text-gray-600">
        Supported format: .docx
      </div>
    </div>
  )
}
