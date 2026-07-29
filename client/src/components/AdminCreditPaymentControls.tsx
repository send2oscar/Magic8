import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { CircleDollarSign, LoaderCircle, Plus, ReceiptText, Settings2 } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type PackageDraft = {
  credits: string;
  status: "active" | "inactive";
  sortOrder: string;
};

function amountUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function dateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

export function AdminCreditPaymentControls() {
  const utils = trpc.useUtils();
  const policy = trpc.admin.creditPolicy.useQuery(undefined, { retry: false });
  const packages = trpc.admin.creditPackages.useQuery(undefined, { retry: false });
  const payments = trpc.admin.paypalPayments.useQuery(undefined, { retry: false });
  const savePolicy = trpc.admin.updateCreditPolicy.useMutation();
  const savePackage = trpc.admin.saveCreditPackage.useMutation();
  const [standardCredits, setStandardCredits] = useState("");
  const [xxxCredits, setXxxCredits] = useState("");
  const [pricePerTenUsd, setPricePerTenUsd] = useState("");
  const [drafts, setDrafts] = useState<Record<number, PackageDraft>>({});

  const policyVersion = policy.data?.updatedAt ? new Date(policy.data.updatedAt).getTime() : null;
  useEffect(() => {
    if (!policy.data || savePolicy.isPending) return;
    setStandardCredits(String(policy.data.standardTryOnCredits));
    setXxxCredits(String(policy.data.xxxTryOnCredits));
    setPricePerTenUsd((policy.data.priceCentsPerTenCredits / 100).toFixed(2));
  }, [policy.data, policyVersion, savePolicy.isPending]);

  const packagesVersion = useMemo(
    () => packages.data?.map(entry => `${entry.id}:${entry.credits}:${entry.status}:${entry.sortOrder}`).join("|") ?? "",
    [packages.data],
  );
  useEffect(() => {
    if (!packages.data || savePackage.isPending) return;
    setDrafts(Object.fromEntries(packages.data.map(entry => [entry.id, {
      credits: String(entry.credits),
      status: entry.status,
      sortOrder: String(entry.sortOrder),
    }])));
  }, [packages.data, packagesVersion, savePackage.isPending]);

  const invalidateFinance = async () => {
    await Promise.all([
      utils.admin.creditPolicy.invalidate(),
      utils.admin.creditPackages.invalidate(),
      utils.admin.paypalPayments.invalidate(),
      utils.payments.packages.invalidate(),
    ]);
  };

  const submitPolicy = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsedStandard = Number(standardCredits);
    const parsedXxx = Number(xxxCredits);
    const parsedCents = Math.round(Number(pricePerTenUsd) * 100);
    if (!Number.isSafeInteger(parsedStandard) || parsedStandard <= 0 || !Number.isSafeInteger(parsedXxx) || parsedXxx <= 0 || !Number.isSafeInteger(parsedCents) || parsedCents <= 0) {
      toast.error("Enter positive whole-number credit deductions and a positive USD price with no fractional cents.");
      return;
    }
    try {
      await savePolicy.mutateAsync({
        standardTryOnCredits: parsedStandard,
        xxxTryOnCredits: parsedXxx,
        priceCentsPerTenCredits: parsedCents,
      });
      await invalidateFinance();
      toast.success("Credit policy saved. New successful generations and package prices now use these settings.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The credit policy could not be saved.");
    }
  };

  const updateDraft = (id: number, key: keyof PackageDraft, value: string) => {
    setDrafts(current => ({ ...current, [id]: { ...(current[id] ?? { credits: "", status: "active", sortOrder: "0" }), [key]: value } }));
  };

  const submitPackage = async (id: number) => {
    const draft = drafts[id];
    if (!draft) return;
    const credits = Number(draft.credits);
    const sortOrder = Number(draft.sortOrder);
    if (!Number.isSafeInteger(credits) || credits <= 0 || !Number.isSafeInteger(sortOrder) || sortOrder < 0) {
      toast.error("Package credits must be positive whole numbers and display order cannot be negative.");
      return;
    }
    try {
      await savePackage.mutateAsync({ id, credits, status: draft.status, sortOrder });
      await invalidateFinance();
      toast.success("Credit package saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The credit package could not be saved.");
    }
  };

  const addPackage = async () => {
    const lastSortOrder = Math.max(-1, ...(packages.data?.map(entry => entry.sortOrder) ?? []));
    try {
      await savePackage.mutateAsync({ credits: 100, status: "active", sortOrder: lastSortOrder + 1 });
      await invalidateFinance();
      toast.success("New 100-credit package added. Edit its values below as needed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The new credit package could not be added.");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="hud-frame bg-card/50 p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-secondary" /><div><h2 className="font-bold">CREDIT POLICY</h2><p className="mt-1 text-xs text-muted-foreground">All values are enforced by the server. Credits are deducted only after a successful generation.</p></div></div>
          <span className="rounded border border-secondary/50 bg-secondary/10 px-2 py-1 text-xs font-semibold text-secondary">PAYPAL SANDBOX</span>
        </div>
        {policy.isLoading ? <div className="flex justify-center p-6"><LoaderCircle className="h-5 w-5 animate-spin text-accent" /></div> : policy.isError || !policy.data ? <p className="text-sm text-destructive">Unable to load the administrator credit policy.</p> : (
          <form onSubmit={submitPolicy} className="space-y-4">
            <div className="overflow-x-auto rounded border border-accent/25">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-accent/10 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Policy item</th><th className="px-4 py-3">Current setting</th><th className="px-4 py-3">Meaning</th></tr></thead>
                <tbody className="divide-y divide-border">
                  <tr><td className="px-4 py-3 font-semibold">Non-XXX successful try-on</td><td className="px-4 py-3"><input aria-label="Non-XXX credit deduction" value={standardCredits} onChange={event => setStandardCredits(event.target.value)} inputMode="numeric" className="h-9 w-24 rounded border border-accent/40 bg-background px-2 text-foreground" /></td><td className="px-4 py-3 text-muted-foreground">Credits deducted after a standard image is successfully saved.</td></tr>
                  <tr><td className="px-4 py-3 font-semibold">XXX successful try-on</td><td className="px-4 py-3"><input aria-label="XXX credit deduction" value={xxxCredits} onChange={event => setXxxCredits(event.target.value)} inputMode="numeric" className="h-9 w-24 rounded border border-accent/40 bg-background px-2 text-foreground" /></td><td className="px-4 py-3 text-muted-foreground">Credits deducted after a completed local-ComfyUI result is confirmed.</td></tr>
                  <tr><td className="px-4 py-3 font-semibold">USD price per 10 credits</td><td className="px-4 py-3"><input aria-label="USD price per 10 credits" value={pricePerTenUsd} onChange={event => setPricePerTenUsd(event.target.value)} inputMode="decimal" className="h-9 w-28 rounded border border-accent/40 bg-background px-2 text-foreground" /></td><td className="px-4 py-3 text-muted-foreground">Used by the server to calculate every package checkout amount.</td></tr>
                </tbody>
              </table>
            </div>
            <Button type="submit" disabled={savePolicy.isPending} className="bg-secondary font-bold text-background">{savePolicy.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <CircleDollarSign className="mr-2 h-4 w-4" />} SAVE CREDIT POLICY</Button>
          </form>
        )}
      </Card>

      <Card className="hud-frame bg-card/50 p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">FIXED CREDIT PACKAGES</h2><p className="mt-1 text-xs text-muted-foreground">The USD checkout amount is derived from the active policy and cannot be edited per package.</p></div><Button type="button" variant="outline" onClick={() => void addPackage()} disabled={savePackage.isPending} className="border-secondary/60 text-secondary"><Plus className="mr-2 h-4 w-4" /> ADD PACKAGE</Button></div>
        {packages.isLoading ? <div className="flex justify-center p-6"><LoaderCircle className="h-5 w-5 animate-spin text-accent" /></div> : packages.isError ? <p className="text-sm text-destructive">Unable to load credit packages.</p> : (
          <div className="overflow-x-auto rounded border border-accent/25">
            <table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-accent/10 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Credits</th><th className="px-4 py-3">Calculated USD</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Display order</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-border">{packages.data?.map(entry => { const draft = drafts[entry.id]; return <tr key={entry.id}><td className="px-4 py-3"><input aria-label={`Package ${entry.id} credits`} value={draft?.credits ?? ""} onChange={event => updateDraft(entry.id, "credits", event.target.value)} inputMode="numeric" className="h-9 w-24 rounded border border-accent/40 bg-background px-2 text-foreground" /></td><td className="px-4 py-3 font-semibold text-secondary">{amountUsd(entry.priceCents)}</td><td className="px-4 py-3"><select aria-label={`Package ${entry.id} status`} value={draft?.status ?? "active"} onChange={event => updateDraft(entry.id, "status", event.target.value)} className="h-9 rounded border border-accent/40 bg-background px-2 text-foreground"><option value="active">Active</option><option value="inactive">Inactive</option></select></td><td className="px-4 py-3"><input aria-label={`Package ${entry.id} display order`} value={draft?.sortOrder ?? ""} onChange={event => updateDraft(entry.id, "sortOrder", event.target.value)} inputMode="numeric" className="h-9 w-20 rounded border border-accent/40 bg-background px-2 text-foreground" /></td><td className="px-4 py-3"><Button type="button" size="sm" onClick={() => void submitPackage(entry.id)} disabled={savePackage.isPending} className="bg-secondary font-bold text-background">SAVE</Button></td></tr>; })}</tbody></table>
          </div>
        )}
      </Card>

      <Card className="hud-frame bg-card/50 p-6">
        <div className="mb-5 flex items-center gap-2"><ReceiptText className="h-5 w-5 text-accent" /><div><h2 className="font-bold">PAYPAL PAYMENT RECORDS</h2><p className="mt-1 text-xs text-muted-foreground">Return-page capture records, including incomplete and failed Sandbox checkouts.</p></div></div>
        {payments.isLoading ? <div className="flex justify-center p-6"><LoaderCircle className="h-5 w-5 animate-spin text-accent" /></div> : payments.isError ? <p className="text-sm text-destructive">Unable to load PayPal payment records.</p> : payments.data?.length ? (
          <div className="overflow-x-auto rounded border border-accent/25">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-accent/10 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Datetime</th><th className="px-4 py-3">Username</th><th className="px-4 py-3">Credits added</th><th className="px-4 py-3">USD</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">PayPal order</th><th className="px-4 py-3">Capture diagnostic</th></tr></thead>
              <tbody className="divide-y divide-border">
                {payments.data.map(entry => <tr key={entry.id}>
                  <td className="px-4 py-3 text-muted-foreground">{dateTime(entry.capturedAt ?? entry.createdAt)}</td>
                  <td className="px-4 py-3"><p className="font-semibold">{entry.username || "Unnamed user"}</p><p className="text-xs text-muted-foreground">{entry.email || "No email"}</p></td>
                  <td className="px-4 py-3 font-semibold text-secondary">{entry.status === "completed" ? entry.creditAmount : 0}</td>
                  <td className="px-4 py-3">{amountUsd(entry.expectedAmountCents)}</td>
                  <td className="px-4 py-3"><span className={`rounded border px-2 py-1 text-xs font-bold uppercase ${entry.status === "completed" ? "border-secondary/50 bg-secondary/10 text-secondary" : entry.status === "failed" ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-accent/40 bg-accent/10 text-accent"}`}>{entry.status}</span></td>
                  <td className="max-w-[14rem] break-all px-4 py-3 font-mono text-xs text-muted-foreground">{entry.orderId}</td>
                  <td className="max-w-[26rem] whitespace-pre-wrap break-words px-4 py-3 text-xs text-muted-foreground">{entry.failureDetail || "—"}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted-foreground">No PayPal purchase attempts have been recorded.</p>}
      </Card>
    </div>
  );
}
