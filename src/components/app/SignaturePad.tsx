import { Button } from "@/components/ui/button";
import { Eraser, PenLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * On-screen pledge-agreement signature capture (PRD Module 1).
 *
 * Strokes are drawn with pointer events so it works with a stylus, a finger
 * and a mouse. The canvas is trimmed to the inked area before export so a
 * signature taken in a small corner still saves a tight image.
 */
export function SignaturePad({
  onSave,
  disabled,
}: {
  onSave: (dataUrl: string) => Promise<void> | void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);

  const ctxOf = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // Match the backing store to the device pixel ratio for a crisp stroke.
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1a1613";
    }
    return { ctx, rect };
  };

  useEffect(() => {
    const o = ctxOf();
    o?.ctx;
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const o = ctxOf();
    if (!o) return;
    drawing.current = true;
    const { x, y } = pos(e);
    o.ctx.beginPath();
    o.ctx.moveTo(x, y);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const move = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const o = ctxOf();
    if (!o) return;
    const { x, y } = pos(e);
    o.ctx.lineTo(x, y);
    o.ctx.stroke();
    setHasInk(true);
  }, []);

  const end = useCallback(() => {
    drawing.current = false;
  }, []);

  const clear = () => {
    const o = ctxOf();
    if (!o) return;
    o.ctx.fillStyle = "#ffffff";
    o.ctx.fillRect(0, 0, o.rect.width, o.rect.height);
    setHasInk(false);
  };

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    await onSave(trim(canvas).toDataURL("image/png"));
    setBusy(false);
  };

  return (
    <div className="space-y-2">
      <div className="relative rounded-lg border border-dashed border-border bg-white">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="block h-32 w-full touch-none rounded-lg"
          style={{ cursor: "crosshair" }}
        />
        {!hasInk && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-[#8a8079]">
            <PenLine className="size-5" />
            <span className="text-xs">Sign here with a stylus or finger</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-6 bottom-6 border-b border-dashed border-[#c8bdb4]" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clear}
          disabled={!hasInk}
        >
          <Eraser className="size-3.5" />
          Clear
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={!hasInk || busy || disabled}>
          {busy ? "Saving…" : "Accept signature"}
        </Button>
      </div>
    </div>
  );
}

/** Crop the canvas to its inked bounds so we store a tight image. */
function trim(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      // Anything not near-white counts as ink.
      if (alpha > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (minX > maxX || minY > maxY) return canvas;

  const pad = 8;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width, maxX + pad);
  maxY = Math.min(height, maxY + pad);

  const out = document.createElement("canvas");
  out.width = maxX - minX;
  out.height = maxY - minY;
  out.getContext("2d")?.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}
