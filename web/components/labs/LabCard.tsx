"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  NotionCard,
  NotionCardContent,
  NotionCardCover,
  NotionCardDescription,
  NotionCardFooter,
  NotionCardTag,
  NotionCardTitle,
} from "@/components/ui/notion-card";
import { cn } from "@/lib/utils";

interface LabCardProps {
  href: string;
  title: string;
  status: string;
  summary: string;
  ctaLabel: string;
  featured?: boolean;
  adminOnly?: boolean;
  className?: string;
}

export function LabCard({
  href,
  title,
  status,
  summary,
  ctaLabel,
  featured = false,
  adminOnly = false,
  className,
}: LabCardProps) {
  return (
    <Link href={href} className="block">
      <NotionCard
        className={cn(
          "h-full overflow-hidden border-border/70 bg-background/90 shadow-none hover:-translate-y-0.5 hover:shadow-lg",
          className
        )}
      >
        <NotionCardCover
          className={cn(
            "h-28 bg-gradient-to-br",
            featured
              ? "from-slate-950 via-slate-900 to-slate-700"
              : "from-slate-100 via-slate-50 to-white"
          )}
        />
        <NotionCardContent className="gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <NotionCardTag
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px]",
                  featured
                    ? "bg-slate-900 text-slate-50"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {status}
              </NotionCardTag>
              {adminOnly && (
                <NotionCardTag className="rounded-full px-2.5 py-1 text-[11px] bg-amber-100 text-amber-700">
                  Admin only
                </NotionCardTag>
              )}
            </div>
            {featured && (
              <span className="text-[11px] font-medium text-muted-foreground">
                Featured
              </span>
            )}
          </div>

          <div className="space-y-2">
            <NotionCardTitle className="text-lg">{title}</NotionCardTitle>
            <NotionCardDescription className="line-clamp-3 text-sm leading-6">
              {summary}
            </NotionCardDescription>
          </div>

          <NotionCardFooter className="justify-between border-t pt-4 text-sm text-foreground">
            <span className="font-medium">{ctaLabel}</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </NotionCardFooter>
        </NotionCardContent>
      </NotionCard>
    </Link>
  );
}
