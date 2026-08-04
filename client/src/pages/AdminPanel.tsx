import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AdminCreditPaymentControls } from "@/components/AdminCreditPaymentControls";
import { trpc } from "@/lib/trpc";
import { CircleAlert, FileWarning, GalleryHorizontalEnd, LoaderCircle, LogOut, Settings2, ShieldCheck, UserRound, Users } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";

function when(value: Date | string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

function taskTypeLabel(shirtStyle: string) {
  if (shirtStyle === "qwen-image-edit-rapid") return "Qwen Image Edit";
  return shirtStyle
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function processingRouteLabel(route: string | null) {
  if (route === "standard-image-generation") return "Standard Cloud Image Generation";
  if (route === "local-comfyui-qwen") return "Local ComfyUI (Qwen)";
  if (!route) return "Not recorded (legacy task)";
  return route;
}

type AdminWorkspaceView = "settings" | "users";

function AdminImage({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className="flex aspect-[4/3] items-center justify-center rounded border border-border bg-muted/30 px-3 text-center text-xs text-muted-foreground">Image unavailable</div>;
  }
  return <img src={src} alt={alt} className="aspect-[4/3] w-full rounded object-cover" onError={() => setFailed(true)} />;
}

export default function AdminPanel() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const session = trpc.admin.session.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const authorized = session.data?.authenticated === true;
  const users = trpc.admin.listUsers.useQuery(undefined, { enabled: authorized, retry: false });
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [view, setView] = useState<AdminWorkspaceView>("settings");
  const profile = trpc.admin.userProfile.useQuery(
    { userId: selectedUserId ?? 0 },
    { enabled: authorized && view === "users" && selectedUserId !== null, retry: false },
  );
  const gallery = trpc.admin.userGallery.useQuery(
    { userId: selectedUserId ?? 0 },
    { enabled: authorized && view === "users" && selectedUserId !== null, retry: false },
  );
  const taskErrors = trpc.admin.userTaskErrors.useQuery(
    { userId: selectedUserId ?? 0 },
    { enabled: authorized && view === "users" && selectedUserId !== null, retry: false },
  );
  const taskDiagnostics = trpc.admin.userTaskDiagnostics.useQuery(
    { userId: selectedUserId ?? 0 },
    { enabled: authorized && view === "users" && selectedUserId !== null, retry: false },
  );
  const logout = trpc.admin.logout.useMutation({
    onSuccess: async () => {
      await utils.admin.session.invalidate();
      setLocation("/admin/login");
    },
  });

  useEffect(() => {
    if (!session.isLoading && !authorized) setLocation("/admin/login");
  }, [authorized, session.isLoading, setLocation]);

  useEffect(() => {
    if (selectedUserId === null && users.data?.[0]) setSelectedUserId(users.data[0].id);
  }, [selectedUserId, users.data]);

  if (session.isLoading || !authorized) {
    return <div className="neon-luxe-page flex min-h-screen items-center justify-center bg-background"><LoaderCircle className="h-8 w-8 animate-spin text-accent" /></div>;
  }

  return (
    <div className="neon-luxe-page min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-accent/30 bg-background/85 backdrop-blur-xl">
        <div className="container flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-accent" />
            <div>
              <p className="text-2xl font-bold neon-pink">ADMIN WORKSPACE</p>
              <p className="text-xs text-muted-foreground">Site-wide credit settings, user review, payment records, and image-generation diagnostics</p>
            </div>
          </div>
          <Button onClick={() => logout.mutate()} disabled={logout.isPending} className="border border-destructive/80 bg-destructive font-bold text-destructive-foreground">
            <LogOut className="mr-2 h-4 w-4" /> LOGOUT
          </Button>
        </div>
      </header>

      <main className="container grid gap-6 py-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <Card className="hud-frame bg-card/50 p-3 backdrop-blur-xl">
            <div className="space-y-2" aria-label="Administration sections">
              <button
                type="button"
                onClick={() => setView("settings")}
                aria-pressed={view === "settings"}
                className={`w-full rounded-lg border p-4 text-left transition-all duration-200 ${view === "settings" ? "border-accent bg-accent/10 shadow-[0_0_24px_oklch(0.73_0.27_342_/_0.16)]" : "border-border bg-background/20 hover:border-accent/60 hover:bg-accent/5"}`}
              >
                <div className="flex items-start gap-3">
                  <Settings2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <div className="min-w-0">
                    <p className="font-bold">GENERAL SETTINGS</p>
                    <p className="mt-1 text-xs text-muted-foreground">Shared credit policy, packages, and PayPal payment records.</p>
                    <span className="mt-3 inline-flex rounded border border-accent/50 bg-accent/10 px-2 py-1 text-[10px] font-bold tracking-wide text-accent">APPLIES TO ALL USERS</span>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setView("users")}
                aria-pressed={view === "users"}
                className={`w-full rounded-lg border p-4 text-left transition-all duration-200 ${view === "users" ? "border-accent bg-accent/10 shadow-[0_0_24px_oklch(0.73_0.27_342_/_0.16)]" : "border-border bg-background/20 hover:border-accent/60 hover:bg-accent/5"}`}
              >
                <div className="flex items-start gap-3">
                  <Users className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <div>
                    <p className="font-bold">USER MANAGEMENT</p>
                    <p className="mt-1 text-xs text-muted-foreground">Review an individual user&apos;s profile, credits, gallery, route diagnostics, and errors.</p>
                  </div>
                </div>
              </button>
            </div>
          </Card>

          <Card className="hud-frame h-fit bg-card/50 p-4 backdrop-blur-xl">
            <div className="mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-accent" /><h1 className="font-bold">USERS</h1></div>
            {users.isLoading ? (
              <div className="flex justify-center p-8"><LoaderCircle className="h-6 w-6 animate-spin text-accent" /></div>
            ) : users.isError ? (
              <p className="text-sm text-destructive">Unable to load users.</p>
            ) : users.data?.length ? (
              <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                {users.data.map(user => (
                  <button
                    key={user.id}
                    onClick={() => {
                      setSelectedUserId(user.id);
                      setView("users");
                    }}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedUserId === user.id && view === "users" ? "border-accent bg-accent/10" : "border-border bg-background/20 hover:border-accent/60 hover:bg-accent/5"}`}
                  >
                    <p className="truncate font-semibold">{user.name || "Unnamed user"}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email || "No email recorded"}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Last sign-in: {when(user.lastSignedIn)}</p>
                  </button>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">No users have signed in yet.</p>}
          </Card>
        </aside>

        <section className="min-w-0 space-y-6">
          {view === "settings" ? (
            <>
              <Card className="neon-luxe-shell border-accent/45 bg-accent/5 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Settings2 className="mt-1 h-6 w-6 text-accent" />
                    <div>
                      <p className="neon-luxe-eyebrow mb-2">Global controls</p><h1 className="text-2xl font-bold neon-pink">GENERAL SETTINGS</h1>
                      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Credit Policy and Fixed Credit Packages are site-wide rules. Saving changes here applies the same policy and checkout choices to every current and future user.</p>
                    </div>
                  </div>
                  <span className="rounded border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs font-bold tracking-wide text-accent">GLOBAL SCOPE · ALL USERS</span>
                </div>
              </Card>
              <AdminCreditPaymentControls />
            </>
          ) : selectedUserId === null ? (
            <Card className="hud-frame bg-card/50 p-8 text-center text-muted-foreground">Select a user to review their profile, processing routes, gallery, and complete image-generation task errors.</Card>
          ) : (
            <>
              <Card className="hud-frame bg-card/50 p-6">
                {profile.isLoading ? <LoaderCircle className="h-6 w-6 animate-spin text-accent" /> : profile.data ? (
                  <div className="flex flex-wrap items-start justify-between gap-5">
                    <div className="flex items-start gap-4">
                      <UserRound className="mt-1 h-7 w-7 text-accent" />
                      <div><h2 className="text-2xl font-bold neon-cyan">{profile.data.name || "Unnamed user"}</h2><p className="mt-1 text-muted-foreground">{profile.data.email || "No email recorded"}</p></div>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <div><dt className="text-muted-foreground">Role</dt><dd className="font-bold uppercase">{profile.data.role}</dd></div>
                      <div><dt className="text-muted-foreground">Credits</dt><dd className="font-bold text-secondary">{profile.data.credits}</dd></div>
                      <div><dt className="text-muted-foreground">Created</dt><dd>{when(profile.data.createdAt)}</dd></div>
                      <div><dt className="text-muted-foreground">Last signed in</dt><dd>{when(profile.data.lastSignedIn)}</dd></div>
                    </dl>
                  </div>
                ) : <p className="text-destructive">This user profile could not be found.</p>}
              </Card>

              <Card className="hud-frame bg-card/50 p-6">
                <div className="mb-5 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-accent" /><h2 className="font-bold">RECENT PROCESSING ROUTES</h2></div>
                {taskDiagnostics.isLoading ? (
                  <div className="flex justify-center p-8"><LoaderCircle className="h-6 w-6 animate-spin text-accent" /></div>
                ) : taskDiagnostics.isError ? (
                  <p className="flex items-center gap-2 text-sm text-destructive"><CircleAlert className="h-4 w-4" /> Unable to load this user&apos;s task route diagnostics.</p>
                ) : taskDiagnostics.data?.length ? (
                  <div className="space-y-3">
                    {taskDiagnostics.data.map(entry => (
                      <article key={entry.historyId} className="rounded border border-accent/30 bg-accent/5 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <div><span className="font-bold">History #{entry.historyId}</span>{entry.taskId ? <span className="ml-2 text-muted-foreground">Bridge task #{entry.taskId}</span> : null}</div>
                          <span className="font-bold uppercase text-accent">{entry.bridgeStatus || entry.status}</span>
                        </div>
                        <dl className="mt-3 grid gap-x-5 gap-y-2 text-xs text-muted-foreground sm:grid-cols-4">
                          <div><dt>Task type</dt><dd className="mt-1 break-words text-foreground">{taskTypeLabel(entry.shirtStyle)}</dd></div>
                          <div><dt>Selected route</dt><dd className="mt-1 break-words font-semibold text-foreground">{processingRouteLabel(entry.processingRoute)}</dd></div>
                          <div><dt>Created</dt><dd className="mt-1 text-foreground">{when(entry.createdAt)}</dd></div>
                          <div><dt>Completed</dt><dd className="mt-1 text-foreground">{when(entry.completedAt)}</dd></div>
                        </dl>
                        {entry.routeDetail ? <p className="mt-3 break-words rounded bg-background/60 px-3 py-2 font-mono text-xs text-muted-foreground">{entry.routeDetail}</p> : null}
                      </article>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">No processing route diagnostics are recorded for this user.</p>}
              </Card>

              <Card className="hud-frame bg-card/50 p-6">
                <div className="mb-5 flex items-center gap-2"><FileWarning className="h-5 w-5 text-destructive" /><h2 className="font-bold">FULL IMAGE-GENERATION ERROR LOGS</h2></div>
                {taskErrors.isLoading ? (
                  <div className="flex justify-center p-8"><LoaderCircle className="h-6 w-6 animate-spin text-accent" /></div>
                ) : taskErrors.isError ? (
                  <p className="flex items-center gap-2 text-sm text-destructive"><CircleAlert className="h-4 w-4" /> Unable to load this user&apos;s image-generation task error logs.</p>
                ) : taskErrors.data?.length ? (
                  <div className="space-y-4">
                    {taskErrors.data.map(entry => (
                      <article key={entry.historyId} className="overflow-hidden rounded border border-destructive/40 bg-destructive/5">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-destructive/30 px-4 py-3 text-sm">
                          <div><span className="font-bold">History #{entry.historyId}</span>{entry.taskId ? <span className="ml-2 text-muted-foreground">Bridge task #{entry.taskId}</span> : null}</div>
                          <span className="font-bold uppercase text-destructive">{entry.bridgeStatus || entry.status}</span>
                        </div>
                        <dl className="grid gap-x-5 gap-y-2 border-b border-destructive/20 px-4 py-3 text-xs text-muted-foreground sm:grid-cols-4">
                          <div><dt>Task type</dt><dd className="mt-1 break-words text-foreground">{taskTypeLabel(entry.shirtStyle)}</dd></div>
                          <div><dt>Created</dt><dd className="mt-1 text-foreground">{when(entry.createdAt)}</dd></div>
                          <div><dt>Completed</dt><dd className="mt-1 text-foreground">{when(entry.completedAt)}</dd></div>
                          <div><dt>Attempts</dt><dd className="mt-1 text-foreground">{entry.attemptCount ?? 0}</dd></div>
                          <div><dt>Selected route</dt><dd className="mt-1 break-words text-foreground">{processingRouteLabel(entry.processingRoute)}</dd></div>
                          {entry.progressLabel ? <div className="sm:col-span-3"><dt>Last progress</dt><dd className="mt-1 break-words text-foreground">{entry.progressLabel}{entry.progressDetail ? ` — ${entry.progressDetail}` : ""}</dd></div> : null}
                        </dl>
                        <div className="border-b border-destructive/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-destructive">Full raw error</div>
                        <pre className="whitespace-pre-wrap break-words p-4 font-sans text-sm leading-6 text-destructive">{entry.fullError}</pre>
                      </article>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">No failed image-generation task errors are recorded for this user.</p>}
              </Card>

              <Card className="hud-frame bg-card/50 p-6">
                <div className="mb-5 flex items-center gap-2"><GalleryHorizontalEnd className="h-5 w-5 text-accent" /><h2 className="font-bold">USER PROCESSING GALLERY</h2></div>
                {gallery.isLoading ? (
                  <div className="flex justify-center p-8"><LoaderCircle className="h-6 w-6 animate-spin text-accent" /></div>
                ) : gallery.isError ? (
                  <p className="flex items-center gap-2 text-sm text-destructive"><CircleAlert className="h-4 w-4" /> Unable to load this user&apos;s gallery.</p>
                ) : gallery.data?.length ? (
                  <div className="grid gap-5 xl:grid-cols-2">
                    {gallery.data.map(entry => (
                      <article key={entry.id} className="overflow-hidden rounded border border-accent/20">
                        <div className="flex items-center justify-between border-b border-accent/20 px-4 py-3"><div><p className="font-bold">{entry.shirtStyle}</p><p className="text-xs text-muted-foreground">{when(entry.createdAt)}</p></div><span className="text-xs font-bold uppercase text-accent">{entry.status}</span></div>
                        <div className="grid gap-3 p-4 sm:grid-cols-2"><div><p className="mb-2 text-xs text-muted-foreground">UPLOADED</p><AdminImage src={entry.sourceImageUrl} alt="User upload" /></div><div><p className="mb-2 text-xs text-muted-foreground">GENERATED</p><AdminImage src={entry.resultImageUrl} alt="Generated try-on" /></div></div>
                      </article>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">This user does not have processing records yet.</p>}
              </Card>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
