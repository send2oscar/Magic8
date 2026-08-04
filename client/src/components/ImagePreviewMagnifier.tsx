import { cn } from "@/lib/utils";
import React, { KeyboardEvent, PointerEvent, useEffect, useRef, useState } from "react";

const LENS_DIAMETER = 176;

type LensState = {
  backgroundPosition: string;
  backgroundSize: string;
  visible: boolean;
  x: number;
  y: number;
};

type ImagePreviewMagnifierProps = {
  alt: string;
  className?: string;
  imageClassName?: string;
  src: string;
  zoom?: number;
};

export function ImagePreviewMagnifier({
  alt,
  className,
  imageClassName,
  src,
  zoom = 3,
}: ImagePreviewMagnifierProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [lens, setLens] = useState<LensState>({
    backgroundPosition: "50% 50%",
    backgroundSize: "100% 100%",
    visible: false,
    x: 0,
    y: 0,
  });

  const hideLens = () => setLens((current) => ({ ...current, visible: false }));

  const updateLens = (clientX: number, clientY: number) => {
    const image = imageRef.current;
    const rect = image?.getBoundingClientRect();
    if (!image || !rect || !rect.width || !rect.height) return;

    const pointerX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const pointerY = Math.max(0, Math.min(clientY - rect.top, rect.height));
    const radius = Math.min(LENS_DIAMETER / 2, rect.width / 2, rect.height / 2);

    setLens({
      backgroundPosition: `${-pointerX * zoom + LENS_DIAMETER / 2}px ${-pointerY * zoom + LENS_DIAMETER / 2}px`,
      backgroundSize: `${rect.width * zoom}px ${rect.height * zoom}px`,
      visible: true,
      x: Math.max(radius, Math.min(pointerX, rect.width - radius)),
      y: Math.max(radius, Math.min(pointerY, rect.height - radius)),
    });
  };

  const handlePointerMove = (event: PointerEvent<HTMLImageElement>) => {
    if (event.pointerType === "touch") return;
    updateLens(event.clientX, event.clientY);
  };

  const handlePointerDown = (event: PointerEvent<HTMLImageElement>) => {
    if (event.pointerType !== "touch") return;
    event.preventDefault();
    if (lens.visible) {
      hideLens();
      return;
    }
    updateLens(event.clientX, event.clientY);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLImageElement>) => {
    if (event.key === "Escape") {
      hideLens();
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (lens.visible) {
      hideLens();
      return;
    }
    const rect = imageRef.current?.getBoundingClientRect();
    if (rect) updateLens(rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  useEffect(() => {
    hideLens();
  }, [src]);

  return (
    <div className={cn("relative inline-block max-w-full overflow-hidden rounded-[inherit]", className)}>
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        tabIndex={0}
        className={cn(
          "block max-w-full cursor-crosshair select-none touch-manipulation outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          imageClassName,
        )}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerLeave={hideLens}
        onPointerMove={handlePointerMove}
        aria-describedby="image-preview-magnifier-hint"
      />
      <span id="image-preview-magnifier-hint" className="sr-only">Hover to magnify. Press Enter or Space to toggle magnification. Press Escape to hide it.</span>
      <span aria-hidden="true" className="pointer-events-none absolute bottom-2 right-2 rounded border border-accent/60 bg-background/80 px-2 py-1 text-[10px] font-bold tracking-[0.12em] text-accent backdrop-blur">
        {zoom}× DETAIL
      </span>
      {lens.visible ? (
        <span
          aria-hidden="true"
          data-testid="image-preview-magnifier-lens"
          className="pointer-events-none absolute z-10 rounded-full border-2 border-accent shadow-[0_0_0_3px_oklch(0.12_0.025_330_/_0.72),0_0_28px_oklch(0.74_0.23_342_/_0.62)]"
          style={{
            backgroundImage: `url("${src}")`,
            backgroundPosition: lens.backgroundPosition,
            backgroundRepeat: "no-repeat",
            backgroundSize: lens.backgroundSize,
            height: LENS_DIAMETER,
            left: lens.x,
            top: lens.y,
            transform: "translate(-50%, -50%)",
            width: LENS_DIAMETER,
          }}
        />
      ) : null}
    </div>
  );
}
