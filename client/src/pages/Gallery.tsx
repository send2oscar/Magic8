import { useAuth } from "@/_core/hooks/useAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CircleAlert, Download, Images, LoaderCircle, Maximize2, Shirt, Trash2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";

type GalleryPreview = {
  alt: string;
  downloadName: string;
  src: string;
  title: string;
};

function when(value: Date | string | null) {
  if (!value) return "In progress";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
}

function imageExtension(src: string) {
  const filename = src.split(/[?#]/)[0]?.split("/").pop()?.toLowerCase() ?? "";
  const extension = filename.split(".").pop() ?? "";
  return ["gif", "jpeg", "jpg", "png", "webp"].includes(extension) ? extension : "jpg";
}

function downloadName(historyId: number, kind: "generated" | "original", src: string) {
  return `shirt-changer-${historyId}-${kind}.${imageExtension(src)}`;
}

function ImageTile({
  alt,
  downloadFileName,
  onPreview,
  src,
  title,
}: {
  alt: string;
  downloadFileName: string;
  onPreview: (preview: GalleryPreview) => void;
  src: string | null;
  title: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <div className="flex aspect-[4/3] items-center justify-center rounded border border-border bg-muted/30 px-3 text-center text-xs text-muted-foreground">{title} unavailable</div>;
  }

  const preview = { alt, downloadName: downloadFileName, src, title };

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="group relative block w-full overflow-hidden rounded border border-accent/20 bg-muted/20 text-left outline-none transition hover:border-accent/70 focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onPreview(preview)}
        aria-label={`Preview ${title}`}
      >
        <img src={src} alt={alt} className="aspect-[4/3] w-full object-cover transition duration-200 group-hover:scale-[1.02]" onError={() => setFailed(true)} />
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-background/80 px-3 py-2 text-xs font-bold opacity-0 backdrop-blur transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
          <Maximize2 className="h-3.5 w-3.5 text-accent" /> CLICK TO ENLARGE
        </span>
      </button>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">Click image to enlarge</p>
        <a
          href={src}
          download={downloadFileName}
          aria-label={`Download ${title}`}
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded border border-accent/50 px-2.5 text-xs font-bold text-accent transition hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Download className="h-3.5 w-3.5" /> DOWNLOAD
        </a>
      </div>
    </div>
  );
}

export default function Gallery() {
  const { isAuthenticated, loading } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/login" });
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const gallery = trpc.gallery.list.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const [entryToDelete, setEntryToDelete] = useState<{ id: number; shirtStyle: string } | null>(null);
  const [preview, setPreview] = useState<GalleryPreview | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const removeGalleryEntry = trpc.gallery.remove.useMutation({
    onSuccess: async () => {
      setEntryToDelete(null);
      setDeleteError(null);
      await utils.gallery.list.invalidate();
    },
    onError: (error) => setDeleteError(error.message || "This Gallery item could not be deleted."),
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const confirmDeletion = () => {
    if (!entryToDelete) return;
    setDeleteError(null);
    removeGalleryEntry.mutate({ historyId: entryToDelete.id });
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><LoaderCircle className="h-8 w-8 animate-spin text-accent" /></div>;
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b-2 border-accent/30 bg-background/85 backdrop-blur">
        <div className="container flex items-center justify-between gap-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Images className="h-7 w-7 shrink-0 text-accent" />
            <div>
              <p className="text-2xl font-bold neon-pink">MY GALLERY</p>
              <p className="text-xs text-muted-foreground">Private AI processing history</p>
            </div>
          </div>
          <Button onClick={() => setLocation("/dashboard")} className="bg-secondary font-bold text-background">
            <ArrowLeft className="mr-2 h-4 w-4" /> TRY-ON
          </Button>
        </div>
      </header>

      <main className="container py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold neon-cyan">YOUR PROCESSING GALLERY</h1>
          <p className="mt-2 text-muted-foreground">Only you can view these uploaded and generated images. Click an image to enlarge it or download a copy.</p>
        </div>

        {gallery.isLoading ? (
          <div className="flex min-h-60 justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-accent" /></div>
        ) : gallery.isError ? (
          <Card className="hud-frame max-w-xl bg-card/50 p-6">
            <CircleAlert className="mb-3 h-6 w-6 text-destructive" />
            <p className="text-destructive">Your gallery could not be loaded.</p>
            <Button variant="outline" className="mt-4" onClick={() => gallery.refetch()}>TRY AGAIN</Button>
          </Card>
        ) : gallery.data?.length ? (
          <div className="grid gap-6 xl:grid-cols-2">
            {gallery.data.map((entry) => (
              <Card key={entry.id} className="hud-frame overflow-hidden bg-card/50 p-0">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-accent/20 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Shirt className="h-5 w-5 text-accent" />
                    <div>
                      <p className="font-bold">{entry.shirtStyle} {entry.creditsDeducted ? `(${entry.creditsDeducted} Credit${entry.creditsDeducted === 1 ? "" : "s"})` : ""}</p>
                      <p className="text-xs text-muted-foreground">{when(entry.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded border px-2 py-1 text-xs font-bold uppercase ${entry.status === "success" ? "border-secondary/60 bg-secondary/15 text-secondary" : entry.status === "failed" ? "border-destructive/60 bg-destructive/10 text-destructive" : "border-accent/60 bg-accent/10 text-accent"}`}>{entry.status}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-destructive/60 text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        setDeleteError(null);
                        setEntryToDelete({ id: entry.id, shirtStyle: entry.shirtStyle });
                      }}
                      disabled={removeGalleryEntry.isPending}
                      aria-label={`Delete ${entry.shirtStyle} generation`}
                    >
                      <Trash2 className="mr-1 h-4 w-4" /> DELETE
                    </Button>
                  </div>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-bold text-muted-foreground">UPLOADED</p>
                    <ImageTile
                      title="Original image"
                      src={entry.sourceImageUrl}
                      alt="Your uploaded source image"
                      downloadFileName={entry.sourceImageUrl ? downloadName(entry.id, "original", entry.sourceImageUrl) : "shirt-changer-original.jpg"}
                      onPreview={setPreview}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-bold text-muted-foreground">GENERATED</p>
                    <ImageTile
                      title="Generated image"
                      src={entry.resultImageUrl}
                      alt="Your generated try-on result"
                      downloadFileName={entry.resultImageUrl ? downloadName(entry.id, "generated", entry.resultImageUrl) : "shirt-changer-generated.jpg"}
                      onPreview={setPreview}
                    />
                  </div>
                </div>
                <p className="border-t border-accent/20 px-5 py-3 text-xs text-muted-foreground">{entry.completedAt ? `Completed ${when(entry.completedAt)}` : "Processing record retained"}</p>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="hud-frame flex min-h-72 flex-col items-center justify-center bg-card/50 p-8 text-center">
            <Images className="mb-4 h-10 w-10 text-accent" />
            <h2 className="text-xl font-bold">NO HISTORY YET</h2>
            <p className="mt-2 text-sm text-muted-foreground">Completed and failed try-on attempts will appear here.</p>
            <Button onClick={() => setLocation("/dashboard")} className="mt-6 bg-secondary font-bold text-background">START A TRY-ON</Button>
          </Card>
        )}
      </main>

      <AlertDialog open={entryToDelete !== null} onOpenChange={(open) => {
        if (!open && !removeGalleryEntry.isPending) {
          setEntryToDelete(null);
          setDeleteError(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this Gallery item?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the {entryToDelete?.shirtStyle ?? "selected"} generation from your Gallery and removes the app&apos;s storage-key reference. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? <p role="alert" className="text-sm text-destructive">{deleteError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeGalleryEntry.isPending}>KEEP ITEM</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); confirmDeletion(); }} disabled={removeGalleryEntry.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {removeGalleryEntry.isPending ? "DELETING…" : "DELETE PERMANENTLY"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={preview !== null} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <DialogContent className="max-w-5xl border-accent/40 bg-card p-4 sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{preview?.title ?? "Image"} preview</DialogTitle>
            <DialogDescription>Full-size Gallery preview. Use the download button to save a copy.</DialogDescription>
          </DialogHeader>
          {preview ? (
            <div className="flex max-h-[70vh] min-h-48 items-center justify-center overflow-hidden rounded border border-accent/20 bg-black/30">
              <img src={preview.src} alt={preview.alt} className="max-h-[70vh] w-auto max-w-full object-contain" />
            </div>
          ) : null}
          <DialogFooter>
            {preview ? (
              <a
                href={preview.src}
                download={preview.downloadName}
                aria-label={`Download ${preview.title}`}
                className="inline-flex h-9 items-center justify-center gap-2 rounded bg-secondary px-3 text-sm font-bold text-background transition hover:bg-secondary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Download className="h-4 w-4" /> DOWNLOAD
              </a>
            ) : null}
            <Button variant="outline" onClick={() => setPreview(null)}>CLOSE</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
