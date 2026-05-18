"use client";

import * as React from "react";

interface JobSelectionContextValue {
  selected: Set<string>;
  toggle: (id: string) => void;
  clear: () => void;
  isSelected: (id: string) => boolean;
}

const JobSelectionContext = React.createContext<JobSelectionContextValue | null>(null);

export function JobSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const toggle = React.useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      return next;
    });
  }, []);

  const clear = React.useCallback(() => setSelected(new Set()), []);

  const isSelected = React.useCallback((id: string) => selected.has(id), [selected]);

  const value = React.useMemo(
    () => ({ selected, toggle, clear, isSelected }),
    [selected, toggle, clear, isSelected]
  );

  return (
    <JobSelectionContext.Provider value={value}>
      {children}
    </JobSelectionContext.Provider>
  );
}

export function useJobSelection() {
  const ctx = React.useContext(JobSelectionContext);
  if (!ctx) throw new Error("useJobSelection must be used within JobSelectionProvider");
  return ctx;
}
