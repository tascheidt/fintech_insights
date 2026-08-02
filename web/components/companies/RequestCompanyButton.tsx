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

      {/*
        Preset so the dialog matches the promise on the card. Without it the
        user clicked "Request Company" and got "Send us your thoughts" defaulted
        to a feature request — leaving them to guess the format, and triage to
        guess the intent.
      */}
      <FeedbackDialog
        open={open}
        onOpenChange={setOpen}
        preset={{
          type: "general",
          heading: "Request a company",
          subheading: "Tell us who to track and where their roles are posted",
          titlePlaceholder: "Which company should we add?",
          descriptionPlaceholder:
            "Company name and the URL of their careers page. If you know which job board they use (Greenhouse, Lever, Workday, Ashby…), that speeds things up.",
        }}
      />
    </>
  );
}
