import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AdminCreditPaymentControls } from "@/components/AdminCreditPaymentControls";
import { trpc } from "@/lib/trpc";
import { CircleAlert, FileWarning, GalleryHorizontalEnd, LoaderCircle, LogOut, ShieldCheck, UserRound, Users } from "lucide-react";
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
  const profile = trpc.admin.userProfile.useQuery(
    { userId: selectedUserId ?? 0 },
    { enabled: authorized && selectedUserId !== null, retry: false },
  );
  const gallery = trpc.admin.userGallery.useQuery(
    { userId: selectedUserId ?? 0 },
    { enabled: authorized && selectedUserId !== null, retry: false },
  );
  const taskErrors = trpc.admin.userTaskErrors.useQuery(
    { userId: selectedUserId ?? 0 },
    { enabled: authorized && selectedUserId !== null, retry: false },
  );
  const taskDiagnostics = trpc.admin.userTaskDiagnostics.useQuery(
    { userId: selectedUserId ?? 0 },
    { enabled: authorized && selectedUserId !== null, retry: false },
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
    return <div className="flex min-h-screen items-center justify-center bg-background"><LoaderCircle className="h-8 w-8 animate-spin text-accent" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b-2 border-accent/30 bg-background/85 backdrop-blur">
        <div className="container flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-accent" />
            <div>
              <p className="text-2xl font-bold neon-pink">ADMIN WORKSPACE</p>
              <p className="text-xs text-muted-foreground">Restricted user, route, gallery, and image-generation error-log review</p>
            </div>
          </div>
          <Button onClick={() => logout.mutate()} disabled={logout.isPending} className="bg-destructive font-bold text-destructive-foreground">
            <LogOut className="mr-2 h-4 w-4" /> LOGOUT
          </Button>
        </div>
      </header>

      <main className="container grid gap-6 py-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="hud-frame h-fit bg-card/50 p-4">
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
                  onClick={() => setSelectedUserId(user.id)}
                  className={`w-full rounded border p-3 text-left ${selectedUserId === user.id ? "border-secondary bg-secondary/15" : "border-border hover:border-accent/60"}`}
                >
                  <p className="truncate font-semibold">{user.name || "Unnamed user"}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email || "No email recorded"}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Last sign-in: {when(user.lastSignedIn)}</p>
                </button>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">No users have signed in yet.</p>}
        </Card>

        <section className="min-w-0 space-y-6">
          <AdminCreditPaymentControls />
          {selectedUserId === null ? (
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
