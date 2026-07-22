import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CircleAlert, Images, LoaderCircle, Shirt } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

function when(value: Date | string | null) {
  if (!value) return "In progress";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
}

function ImageTile({ src, alt, title }: { src: string | null; alt: string; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className="flex aspect-[4/3] items-center justify-center rounded border border-border bg-muted/30 px-3 text-center text-xs text-muted-foreground">{title} unavailable</div>;
  }
  return <img src={src} alt={alt} className="aspect-[4/3] w-full rounded object-cover" onError={() => setFailed(true)} />;
}

export default function Gallery() {
  const { isAuthenticated, loading } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const [, setLocation] = useLocation();
  const gallery = trpc.gallery.list.useQuery(undefined, { enabled: isAuthenticated, retry: false });

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><LoaderCircle className="h-8 w-8 animate-spin text-accent" /></div>;
  if (!isAuthenticated) return null;

  return <div className="min-h-screen bg-background">
    <header className="sticky top-0 z-40 border-b-2 border-accent/30 bg-background/85 backdrop-blur">
      <div className="container flex items-center justify-between gap-4 py-4">
        <div className="flex min-w-0 items-center gap-3"><Images className="h-7 w-7 shrink-0 text-accent" /><div><p className="text-2xl font-bold neon-pink">MY GALLERY</p><p className="text-xs text-muted-foreground">Private AI processing history</p></div></div>
        <Button onClick={() => setLocation("/dashboard")} className="bg-secondary text-background font-bold"><ArrowLeft className="mr-2 h-4 w-4" /> TRY-ON</Button>
      </div>
    </header>
    <main className="container py-10">
      <div className="mb-8"><h1 className="text-3xl font-bold neon-cyan">YOUR PROCESSING GALLERY</h1><p className="mt-2 text-muted-foreground">Only you can view these uploaded and generated images.</p></div>
      {gallery.isLoading ? <div className="flex min-h-60 justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-accent" /></div> : gallery.isError ? <Card className="hud-frame max-w-xl bg-card/50 p-6"><CircleAlert className="mb-3 h-6 w-6 text-destructive" /><p className="text-destructive">Your gallery could not be loaded.</p><Button variant="outline" className="mt-4" onClick={() => gallery.refetch()}>TRY AGAIN</Button></Card> : gallery.data?.length ? <div className="grid gap-6 xl:grid-cols-2">{gallery.data.map((entry) => <Card key={entry.id} className="hud-frame overflow-hidden bg-card/50 p-0"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-accent/20 px-5 py-4"><div className="flex items-center gap-3"><Shirt className="h-5 w-5 text-accent" /><div><p className="font-bold">{entry.shirtStyle}</p><p className="text-xs text-muted-foreground">{when(entry.createdAt)}</p></div></div><span className={`rounded border px-2 py-1 text-xs font-bold uppercase ${entry.status === "success" ? "border-secondary/60 bg-secondary/15 text-secondary" : entry.status === "failed" ? "border-destructive/60 bg-destructive/10 text-destructive" : "border-accent/60 bg-accent/10 text-accent"}`}>{entry.status}</span></div><div className="grid gap-4 p-5 sm:grid-cols-2"><div><p className="mb-2 text-xs font-bold text-muted-foreground">UPLOADED</p><ImageTile title="Original image" src={entry.sourceImageUrl} alt="Your uploaded source image" /></div><div><p className="mb-2 text-xs font-bold text-muted-foreground">GENERATED</p><ImageTile title="Generated image" src={entry.resultImageUrl} alt="Your generated try-on result" /></div></div><p className="border-t border-accent/20 px-5 py-3 text-xs text-muted-foreground">{entry.completedAt ? `Completed ${when(entry.completedAt)}` : "Processing record retained"}</p></Card>)}</div> : <Card className="hud-frame flex min-h-72 flex-col items-center justify-center bg-card/50 p-8 text-center"><Images className="mb-4 h-10 w-10 text-accent" /><h2 className="text-xl font-bold">NO HISTORY YET</h2><p className="mt-2 text-sm text-muted-foreground">Completed and failed try-on attempts will appear here.</p><Button onClick={() => setLocation("/dashboard")} className="mt-6 bg-secondary text-background font-bold">START A TRY-ON</Button></Card>}
    </main>
  </div>;
}
