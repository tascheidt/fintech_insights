/**
 * EmptyState — single reusable component for "no data yet" / waiting / warn surfaces.
 *
 * Visual contract (design system):
 * - Centered card with dashed border on default; soft accent border on `kind="warn"`.
 * - Icon: 36px in muted-foreground (default) or accent (warn).
 * - Title: 16px semibold; body: 13px muted, max ~52ch.
 * - Optional primary + secondary CTAs.
 *
 * Wire into:
 *   /companies (no companies tracked) → kind="default", icon=Building2
 *   /companies (first poll pending)   → kind="default", icon=Hourglass
 *   /digests   (no digests yet)       → kind="default", icon=Newspaper
 *   /settings (Sources tab failure)   → kind="warn",    icon=AlertTriangle
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type EmptyStateKind = "default" | "warn";

export interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  body?: string;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  kind?: EmptyStateKind;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  body,
  primaryAction,
  secondaryAction,
  kind = "default",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-dashed bg-card px-8 py-12 text-center",
        kind === "default" && "border-border",
        kind === "warn" && "border-accent bg-accent-soft/30",
        className
      )}
    >
      <div
        className={cn(
          "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full",
          kind === "default" && "bg-secondary text-muted-foreground",
          kind === "warn" && "bg-accent-soft text-accent-soft-foreground"
        )}
        aria-hidden
      >
        {icon}
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {body && (
        <p className="mt-2 mx-auto max-w-[52ch] text-sm text-muted-foreground leading-relaxed">
          {body}
        </p>
      )}
      {(primaryAction || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {primaryAction && (
            <ActionButton action={primaryAction} variant="default" />
          )}
          {secondaryAction && (
            <ActionButton action={secondaryAction} variant="outline" />
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  action,
  variant,
}: {
  action: EmptyStateAction;
  variant: "default" | "outline";
}) {
  if (action.href) {
    return (
      <Button asChild variant={variant} size="sm">
        <a href={action.href}>{action.label}</a>
      </Button>
    );
  }
  return (
    <Button variant={variant} size="sm" onClick={action.onClick}>
      {action.label}
    </Button>
  );
}
