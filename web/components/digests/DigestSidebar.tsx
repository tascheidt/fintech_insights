"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { format } from "date-fns";
import { Search, ChevronDown, ChevronRight, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DigestSummary {
  id: string;
  week_start: string;
  week_end: string;
  generated_at: string;
  total_jobs: number;
  global_summary: {
    headline?: string;
    key_insight?: string;
  } | null;
}

interface DigestSidebarProps {
  digests: DigestSummary[];
}

interface MonthGroup {
  month: string;
  year: number;
  digests: DigestSummary[];
}

export function DigestSidebar({ digests }: DigestSidebarProps) {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  // Group digests by month
  const monthGroups = useMemo(() => {
    const groups = new Map<string, DigestSummary[]>();
    
    for (const digest of digests) {
      const date = new Date(digest.week_start);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      
      const existing = groups.get(key) || [];
      existing.push(digest);
      groups.set(key, existing);
    }

    // Convert to sorted array
    const result: MonthGroup[] = [];
    for (const [key, monthDigests] of groups) {
      const [year, month] = key.split("-").map(Number);
      const date = new Date(year, month, 1);
      result.push({
        month: format(date, "MMMM yyyy"),
        year,
        digests: monthDigests.sort((a, b) => 
          new Date(b.week_start).getTime() - new Date(a.week_start).getTime()
        ),
      });
    }

    // Sort by date descending (most recent first)
    return result.sort((a, b) => {
      const dateA = new Date(a.digests[0].week_start);
      const dateB = new Date(b.digests[0].week_start);
      return dateB.getTime() - dateA.getTime();
    });
  }, [digests]);

  // Auto-expand months with active digest or first month
  useMemo(() => {
    const newExpanded = new Set<string>();
    
    // Always expand the first month
    if (monthGroups.length > 0) {
      newExpanded.add(monthGroups[0].month);
    }
    
    // Expand month containing active digest
    const activeId = pathname.split("/").pop();
    for (const group of monthGroups) {
      if (group.digests.some(d => d.id === activeId)) {
        newExpanded.add(group.month);
      }
    }
    
    if (newExpanded.size > 0 && expandedMonths.size === 0) {
      setExpandedMonths(newExpanded);
    }
  }, [monthGroups, pathname, expandedMonths.size]);

  // Filter digests based on search
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return monthGroups;

    const query = searchQuery.toLowerCase();
    return monthGroups
      .map(group => ({
        ...group,
        digests: group.digests.filter(d => {
          const headline = d.global_summary?.headline?.toLowerCase() || "";
          const keyInsight = d.global_summary?.key_insight?.toLowerCase() || "";
          return headline.includes(query) || keyInsight.includes(query);
        }),
      }))
      .filter(group => group.digests.length > 0);
  }, [monthGroups, searchQuery]);

  const toggleMonth = (month: string) => {
    const newExpanded = new Set(expandedMonths);
    if (newExpanded.has(month)) {
      newExpanded.delete(month);
    } else {
      newExpanded.add(month);
    }
    setExpandedMonths(newExpanded);
  };

  const getDigestHeadline = (digest: DigestSummary) => {
    if (digest.global_summary?.headline) {
      // Remove emoji for cleaner sidebar display
      return digest.global_summary.headline.replace(/^\p{Emoji}\s*/u, "");
    }
    return `Week of ${format(new Date(digest.week_start), "MMM d")}`;
  };

  const isActive = (digestId: string) => {
    return pathname === `/digests/${digestId}`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo/Title */}
      <div className="p-4 border-b">
        <Link href="/digests" className="block">
          <h2 className="font-bold text-lg">TLDR</h2>
          <p className="text-xs text-muted-foreground">by The Fintech Talent Brief</p>
        </Link>
      </div>

      {/* Search */}
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search Digests"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Month Groups */}
      <div className="flex-1 overflow-y-auto">
        {filteredGroups.map((group) => (
          <div key={group.month} className="border-b last:border-b-0">
            {/* Month Header */}
            <button
              onClick={() => toggleMonth(group.month)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
            >
              <span className="font-medium text-sm">{group.month}</span>
              {expandedMonths.has(group.month) ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {/* Digest Items */}
            {expandedMonths.has(group.month) && (
              <div className="pb-2">
                {group.digests.map((digest) => (
                  <Link
                    key={digest.id}
                    href={`/digests/${digest.id}`}
                    className={cn(
                      "block px-4 py-2 mx-2 rounded-md transition-colors",
                      isActive(digest.id)
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted/50"
                    )}
                  >
                    <div className="text-sm font-medium line-clamp-2">
                      {getDigestHeadline(digest)}
                    </div>
                    <div className={cn(
                      "flex items-center gap-1 mt-1 text-xs",
                      isActive(digest.id) 
                        ? "text-primary-foreground/70" 
                        : "text-muted-foreground"
                    )}>
                      <Calendar className="h-3 w-3" />
                      {format(new Date(digest.week_start), "MMM d, yyyy")}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}

        {filteredGroups.length === 0 && (
          <div className="p-4 text-center text-muted-foreground text-sm">
            No digests found
          </div>
        )}
      </div>
    </div>
  );
}
