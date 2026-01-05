'use client'

import { useCallback, useState } from 'react'
import { ArrowUpTrayIcon } from '@heroicons/react/20/solid'
import { Button } from './catalyst/button'
import type { UploadNewVersionProps } from '@/app/types'

export default function UploadNewVersion({ onUpload, disabled = false, label = 'Upload new version' }: UploadNewVersionProps) {
  const [isProcessing, setIsProcessing] = useState(false)

  const processFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.docx')) {
      alert('Please upload a .docx file')
      return
    }

    setIsProcessing(true)

    try {
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

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      processFile(files[0])
    }
    e.target.value = ''
  }, [processFile])

  const handleClick = useCallback(() => {
    if (!disabled && !isProcessing) {
      document.getElementById('new-version-input')?.click()
    }
  }, [disabled, isProcessing])

  return (
    <>
      <input
        id="new-version-input"
        type="file"
        accept=".docx"
        onChange={handleFileInput}
        className="hidden"
        disabled={disabled || isProcessing}
      />
      <Button
        color="blue"
        onClick={handleClick}
        disabled={disabled || isProcessing}
      >
        {isProcessing ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" data-slot="icon">
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
            Processing...
          </>
        ) : (
          <>
            <ArrowUpTrayIcon data-slot="icon" />
            {label}
          </>
        )}
      </Button>
    </>
  )
}
