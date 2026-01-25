/**
 * NotionCard - A clean, modern card component inspired by Notion's UI aesthetic.
 * 
 * Features:
 * - Minimal, clean design with subtle hover effects
 * - Supports cover images and icons
 * - Flexible content areas for title, description, and metadata
 * - Consistent with shadcn/ui patterns
 */

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Container for the Notion-style card
 */
function NotionCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="notion-card"
      className={cn(
        "group relative flex flex-col rounded-lg border bg-card text-card-foreground",
        "transition-all duration-200 ease-in-out",
        "hover:shadow-md hover:border-primary/20",
        "cursor-pointer",
        className
      )}
      {...props}
    />
  );
}

/**
 * Optional cover image or gradient banner at top of card
 */
function NotionCardCover({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="notion-card-cover"
      className={cn(
        "h-24 rounded-t-lg bg-gradient-to-br from-muted to-muted/50",
        "overflow-hidden",
        className
      )}
      {...props}
    />
  );
}

/**
 * Icon container - displays emoji or icon above title
 */
function NotionCardIcon({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="notion-card-icon"
      className={cn(
        "flex items-center justify-center",
        "w-12 h-12 rounded-lg bg-muted text-2xl",
        "-mt-6 ml-4 mb-2",
        "shadow-sm border",
        className
      )}
      {...props}
    />
  );
}

/**
 * Main content container
 */
function NotionCardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="notion-card-content"
      className={cn("flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

/**
 * Title text - main heading for the card
 */
function NotionCardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="notion-card-title"
      className={cn(
        "font-semibold text-base leading-tight line-clamp-2",
        "group-hover:text-primary transition-colors",
        className
      )}
      {...props}
    />
  );
}

/**
 * Description or subtitle text
 */
function NotionCardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="notion-card-description"
      className={cn(
        "text-sm text-muted-foreground line-clamp-2",
        className
      )}
      {...props}
    />
  );
}

/**
 * Footer area for metadata, tags, or actions
 */
function NotionCardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="notion-card-footer"
      className={cn(
        "flex items-center gap-2 pt-2 mt-auto",
        "text-xs text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

/**
 * Small tag/badge for displaying metadata
 */
function NotionCardTag({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="notion-card-tag"
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md",
        "text-xs font-medium",
        "bg-muted text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

/**
 * Metric display for numbers/stats
 */
function NotionCardMetric({
  label,
  value,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  label: string;
  value: string | number;
}) {
  return (
    <div
      data-slot="notion-card-metric"
      className={cn("flex flex-col", className)}
      {...props}
    >
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export {
  NotionCard,
  NotionCardCover,
  NotionCardIcon,
  NotionCardContent,
  NotionCardTitle,
  NotionCardDescription,
  NotionCardFooter,
  NotionCardTag,
  NotionCardMetric,
};
