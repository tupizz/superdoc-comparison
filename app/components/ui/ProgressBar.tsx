"use client";

import { motion } from "motion/react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M = motion as any;

interface ProgressBarProps {
  current: number;
  total: number;
  label?: string;
  showPercentage?: boolean;
  size?: "sm" | "md";
  variant?: "default" | "success";
}

export default function ProgressBar({
  current,
  total,
  label,
  showPercentage = true,
  size = "sm",
  variant = "default",
}: ProgressBarProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  const isComplete = current === total && total > 0;

  const heightClass = size === "sm" ? "h-1.5" : "h-2";
  const bgColor = isComplete
    ? "bg-emerald-500"
    : variant === "success"
    ? "bg-emerald-500"
    : "bg-violet-500";

  return (
    <div className="w-full">
      {(label || showPercentage) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {label}
            </span>
          )}
          {showPercentage && (
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
              {current} / {total}
              {isComplete && (
                <span className="ml-1.5 text-emerald-500">
                  <svg
                    className="w-3.5 h-3.5 inline"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </span>
              )}
            </span>
          )}
        </div>
      )}
      <div
        className={`w-full ${heightClass} bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden`}
      >
        <M.div
          className={`${heightClass} ${bgColor} rounded-full`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
        />
      </div>
    </div>
  );
}
