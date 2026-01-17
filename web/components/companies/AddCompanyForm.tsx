"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function AddCompanyForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  async function testConnection(form: HTMLFormElement) {
    const fd = new FormData(form);
    const atsType = fd.get("atsType");
    const atsIdentifier = fd.get("atsIdentifier");
    if (!atsType || !atsIdentifier) {
      alert("Please fill ATS Type and ATS Identifier first.");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/companies/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atsType, atsIdentifier }),
      });
      const data = await res.json();
      if (data.success) alert(`Success! Found ${data.jobCount} jobs.`);
      else alert(`Error: ${data.error ?? "Unknown"}`);
    } catch (e) {
      alert("Request failed.");
    } finally {
      setTesting(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setLoading(true);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          country: fd.get("country"),
          atsType: fd.get("atsType"),
          atsIdentifier: fd.get("atsIdentifier"),
          trackForStrategy: fd.get("trackForStrategy") === "true",
          careersUrl: fd.get("careersUrl") || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "Failed to add company");
        return;
      }
      router.push("/companies");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Add New Company</h2>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
          <div>
            <label className="text-sm font-medium">Company Name *</label>
            <Input name="name" placeholder="e.g. EQ Bank" required className="mt-1" />
          </div>
          <div className="flex gap-4 flex-wrap">
            <div>
              <label className="text-sm font-medium">Country *</label>
              <select name="country" required className="mt-1 border rounded px-3 py-2 w-full min-w-[140px]">
                <option value="">Select</option>
                <option value="CA">Canada</option>
                <option value="UK">United Kingdom</option>
                <option value="US">United States</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Track for Strategic Analysis</label>
              <div className="mt-1">
                <input type="checkbox" name="trackForStrategy" value="true" />
                <span className="ml-2 text-sm">Yes</span>
              </div>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">ATS Platform *</label>
            <select name="atsType" required className="mt-1 border rounded px-3 py-2 w-full">
              <option value="">Select platform</option>
              <option value="lever">Lever</option>
              <option value="greenhouse">Greenhouse</option>
              <option value="workable">Workable</option>
              <option value="workday">Workday</option>
              <option value="custom">Other (manual)</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">ATS Identifier *</label>
            <Input name="atsIdentifier" placeholder="e.g. eqbank" required className="mt-1" />
            <p className="text-xs text-muted-foreground mt-1">Usually in the careers URL (e.g. jobs.lever.co/X)</p>
          </div>
          <div>
            <label className="text-sm font-medium">Careers Page URL</label>
            <Input name="careersUrl" placeholder="https://..." type="url" className="mt-1" />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={(e) => { const f = (e.currentTarget as HTMLButtonElement).form; if (f) testConnection(f); }} disabled={testing}>
              {testing ? "Testing…" : "Test Connection"}
            </Button>
            <Button type="submit" disabled={loading}>{loading ? "Adding…" : "Add Company"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
