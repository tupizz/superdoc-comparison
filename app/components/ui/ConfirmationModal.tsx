"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M = motion as any;

type ConfirmVariant = "default" | "success" | "danger";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  icon?: React.ReactNode;
}

const variantStyles: Record<
  ConfirmVariant,
  {
    iconBg: string;
    iconColor: string;
    buttonBg: string;
    buttonHover: string;
  }
> = {
  default: {
    iconBg: "bg-zinc-800",
    iconColor: "text-zinc-400",
    buttonBg: "bg-zinc-700 text-white",
    buttonHover: "hover:bg-zinc-600",
  },
  success: {
    iconBg: "bg-emerald-500/20",
    iconColor: "text-emerald-400",
    buttonBg: "bg-emerald-600 text-white",
    buttonHover: "hover:bg-emerald-500",
  },
  danger: {
    iconBg: "bg-red-500/20",
    iconColor: "text-red-400",
    buttonBg: "bg-red-600 text-white",
    buttonHover: "hover:bg-red-500",
  },
};

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  icon,
}: ConfirmationModalProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const styles = variantStyles[variant];

  // Focus confirm button when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => confirmButtonRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on Escape, confirm on Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, onConfirm]);

  const defaultIcon = (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
      />
    </svg>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <M.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            aria-hidden="true"
          />

          {/* Modal */}
          <M.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            aria-describedby="modal-description"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md"
          >
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-6">
                {/* Icon */}
                <div
                  className={`w-12 h-12 rounded-full ${styles.iconBg} flex items-center justify-center mx-auto mb-4`}
                >
                  <span className={styles.iconColor}>
                    {icon || defaultIcon}
                  </span>
                </div>

                {/* Title */}
                <h2
                  id="modal-title"
                  className="text-lg font-semibold text-white text-center mb-2"
                >
                  {title}
                </h2>

                {/* Description */}
                <p
                  id="modal-description"
                  className="text-sm text-zinc-400 text-center leading-relaxed"
                >
                  {description}
                </p>
              </div>

              {/* Actions */}
              <div className="px-6 py-4 bg-zinc-800/30 border-t border-zinc-700/50 flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
                >
                  {cancelText}
                </button>
                <button
                  ref={confirmButtonRef}
                  onClick={onConfirm}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium ${styles.buttonBg} ${styles.buttonHover} rounded-lg transition-colors`}
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </M.div>
        </>
      )}
    </AnimatePresence>
  );
}
