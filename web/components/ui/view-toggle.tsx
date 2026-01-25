"use client";

/**
 * ViewToggle - A Notion-style view switcher component.
 * 
 * Allows users to toggle between card and table views.
 * Persists preference in localStorage for better UX.
 * 
 * Usage:
 * const [view, setView] = useViewPreference("dashboard-companies");
 * <ViewToggle view={view} onViewChange={setView} />
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { LayoutGrid, List } from "lucide-react";

export type ViewMode = "card" | "table";

interface ViewToggleProps {
  /** Current view mode */
  view: ViewMode;
  /** Callback when view changes */
  onViewChange: (view: ViewMode) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * View toggle component with card and table options
 */
export function ViewToggle({ view, onViewChange, className }: ViewToggleProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 p-1 rounded-lg bg-muted",
        className
      )}
    >
      <button
        type="button"
        onClick={() => onViewChange("table")}
        className={cn(
          "inline-flex items-center justify-center p-2 rounded-md",
          "text-sm font-medium transition-all",
          view === "table"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-background/50"
        )}
        aria-label="Table view"
        aria-pressed={view === "table"}
      >
        <List className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onViewChange("card")}
        className={cn(
          "inline-flex items-center justify-center p-2 rounded-md",
          "text-sm font-medium transition-all",
          view === "card"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-background/50"
        )}
        aria-label="Card view"
        aria-pressed={view === "card"}
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Custom hook for managing view preference with localStorage persistence.
 * 
 * @param key - Unique key for storing preference (e.g., "dashboard-companies")
 * @param defaultView - Default view mode if no preference is stored
 * @returns Tuple of [currentView, setView]
 * 
 * @example
 * const [view, setView] = useViewPreference("companies-list", "card");
 */
export function useViewPreference(
  key: string,
  defaultView: ViewMode = "card"
): [ViewMode, (view: ViewMode) => void] {
  const [view, setViewState] = React.useState<ViewMode>(defaultView);
  const [isHydrated, setIsHydrated] = React.useState(false);

  // Load preference from localStorage on mount
  React.useEffect(() => {
    const stored = localStorage.getItem(`view-preference-${key}`);
    if (stored === "card" || stored === "table") {
      setViewState(stored);
    }
    setIsHydrated(true);
  }, [key]);

  // Save preference to localStorage
  const setView = React.useCallback(
    (newView: ViewMode) => {
      setViewState(newView);
      localStorage.setItem(`view-preference-${key}`, newView);
    },
    [key]
  );

  // Return default view during SSR to avoid hydration mismatch
  return [isHydrated ? view : defaultView, setView];
}

export default ViewToggle;
