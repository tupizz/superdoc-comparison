'use client'

import { useCallback, useState, useId } from 'react'
import { DocumentTextIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline'
import { motion, AnimatePresence } from 'motion/react'
import type { DocumentUploaderProps } from '@/app/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M = motion as any

export default function DocumentUploader({ onUpload, disabled = false, label }: DocumentUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const inputId = useId()

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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setIsDragging(true)
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
    if (files.length > 0) processFile(files[0])
  }, [disabled, processFile])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) processFile(files[0])
    e.target.value = ''
  }, [processFile])

  return (
    <M.label
      htmlFor={inputId}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative flex flex-col items-center justify-center
        w-full h-40
        border border-dashed rounded-xl
        transition-all duration-200
        ${isDragging
          ? 'border-violet-500 bg-violet-500/10'
          : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600 hover:bg-zinc-800'
        }
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        ${isProcessing ? 'cursor-wait' : ''}
      `}
      whileHover={!disabled && !isProcessing ? { scale: 1.01 } : {}}
      whileTap={!disabled && !isProcessing ? { scale: 0.99 } : {}}
      animate={isDragging ? { scale: 1.02 } : { scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <input
        id={inputId}
        type="file"
        accept=".docx"
        onChange={handleFileInput}
        className="hidden"
        disabled={disabled || isProcessing}
      />

      <AnimatePresence mode="wait">
        {isProcessing ? (
          <M.div
            key="processing"
            className="flex flex-col items-center gap-3"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center gap-2">
              {[0, 1, 2].map((i) => (
                <M.div
                  key={i}
                  className="w-2 h-2 rounded-full bg-violet-500"
                  animate={{
                    y: [0, -8, 0],
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
            <span className="text-sm text-zinc-400">Processing...</span>
          </M.div>
        ) : (
          <M.div
            key="idle"
            className="flex flex-col items-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
          >
            <M.div
              className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 transition-colors ${
                isDragging
                  ? 'bg-violet-500/20'
                  : 'bg-zinc-700/50'
              }`}
              animate={isDragging ? { y: -4, scale: 1.05 } : { y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <AnimatePresence mode="wait">
                {isDragging ? (
                  <M.div
                    key="upload"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <ArrowUpTrayIcon className="w-5 h-5 text-violet-400" />
                  </M.div>
                ) : (
                  <M.div
                    key="doc"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <DocumentTextIcon className="w-5 h-5 text-zinc-500" />
                  </M.div>
                )}
              </AnimatePresence>
            </M.div>
            <p className={`text-sm font-medium mb-0.5 transition-colors ${
              isDragging
                ? 'text-violet-400'
                : 'text-zinc-300'
            }`}>
              {isDragging ? 'Drop to upload' : (label || 'Drop your document here')}
            </p>
            <p className="text-xs text-zinc-500">
              or click to browse
            </p>
            <span className="absolute bottom-2.5 text-[10px] text-zinc-600">
              DOCX files only
            </span>
          </M.div>
        )}
      </AnimatePresence>
    </M.label>
  )
}
