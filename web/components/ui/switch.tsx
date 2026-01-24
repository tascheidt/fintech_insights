"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "onChange"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

/**
 * Switch component for toggling boolean settings
 * Styled toggle switch matching the design system
 */
export function Switch({ checked = false, onCheckedChange, className, disabled, ...props }: SwitchProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!disabled) {
      onCheckedChange?.(e.target.checked);
    }
  };

  return (
    <label
      className={cn(
        "relative inline-flex items-center cursor-pointer",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        className="sr-only peer"
        {...props}
      />
      <div
        className={cn(
          "relative w-11 h-6 rounded-full transition-colors duration-200 ease-in-out",
          "bg-gray-200 dark:bg-gray-700",
          "peer-checked:bg-primary",
          "peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 peer-focus:ring-offset-2",
          "after:content-[''] after:absolute after:top-[2px] after:left-[2px]",
          "after:bg-white after:border-gray-300 after:border after:rounded-full",
          "after:h-5 after:w-5 after:transition-all after:duration-200",
          "peer-checked:after:translate-x-full peer-checked:after:border-white",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        aria-hidden="true"
      />
    </label>
  );
}
