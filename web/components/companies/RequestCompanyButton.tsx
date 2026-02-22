"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FeedbackDialog } from "@/components/feedback/FeedbackDialog";

export function RequestCompanyButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card className="max-w-xl">
        <CardHeader>
          <h2 className="text-lg font-semibold">Request a Company</h2>
          <p className="text-sm text-muted-foreground">
            Adding a company requires configuring a scraper, which varies by job board platform. Submit a request and we&apos;ll set it up properly.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Include the company name and careers page URL</li>
            <li>Strong requests are automatically turned into tracked issues</li>
            <li>You&apos;ll see status updates in your feedback history</li>
          </ul>
          <Button onClick={() => setOpen(true)}>Request Company</Button>
        </CardContent>
      </Card>

      <FeedbackDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
