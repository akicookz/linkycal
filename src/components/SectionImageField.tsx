import { useEffect, useRef, useState } from "react";
import {
  ImageIcon,
  Loader,
  ImagePlus,
  X,
  PanelLeft,
  PanelRight,
  PanelTop,
  Move,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  sectionImageStyle,
  type SectionImage,
  type SectionImageLayout,
} from "@/lib/form-sections";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

const LAYOUTS: Array<{ value: SectionImageLayout; label: string; icon: typeof PanelLeft }> = [
  { value: "left", label: "Left", icon: PanelLeft },
  { value: "right", label: "Right", icon: PanelRight },
  { value: "top", label: "Top", icon: PanelTop },
];

function clampPct(n: number): number {
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

interface SectionImageFieldProps {
  value: SectionImage | null;
  uploadUrl: string;
  onChange: (next: SectionImage | null) => void;
}

export function SectionImageField({ value, uploadUrl, onChange }: SectionImageFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Local copy for smooth pan/zoom; committed to the parent on release.
  const [draft, setDraft] = useState<SectionImage | null>(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Re-sync when the image itself changes (upload / replace / remove from outside).
  useEffect(() => {
    if (!dragging.current) setDraft(value);
  }, [value]);

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 2 MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(uploadUrl, { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = (await res.json()) as { url: string };
      const next: SectionImage = {
        url: data.url,
        layout: draft?.layout ?? "left",
        scale: 1,
        focusX: 50,
        focusY: 50,
      };
      setDraft(next);
      onChange(next);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  function commit(next: SectionImage) {
    setDraft(next);
    onChange(next);
  }

  // ─── Drag to pan the focal point ──────────────────────────────────────────
  function onPointerDown(e: React.PointerEvent) {
    if (!draft) return;
    dragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current || !draft) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    // Grabbing the image and moving the pointer right should reveal the left
    // side, i.e. decrease the focus X — hence the negated deltas.
    const dx = (e.movementX / rect.width) * 100;
    const dy = (e.movementY / rect.height) * 100;
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            focusX: clampPct(prev.focusX - dx),
            focusY: clampPct(prev.focusY - dy),
          }
        : prev,
    );
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!dragging.current) return;
    dragging.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (draft) onChange(draft);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Section image</p>

      {!draft ? (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className={cn(
              "flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-border text-muted-foreground transition-colors hover:bg-accent/50",
              uploading && "pointer-events-none opacity-60",
            )}
          >
            {uploading ? (
              <Loader className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <ImageIcon className="h-5 w-5" />
                <span className="text-xs">Add an image to this section</span>
              </>
            )}
          </button>
        </>
      ) : (
        <>
          {/* Focal / zoom editor */}
          <div
            ref={frameRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="group/frame relative aspect-[16/10] w-full cursor-grab touch-none overflow-hidden rounded-[12px] border border-border bg-muted active:cursor-grabbing"
          >
            <img
              src={draft.url}
              alt="Section"
              draggable={false}
              className="pointer-events-none h-full w-full select-none"
              style={sectionImageStyle(draft)}
            />
            <div className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover/frame:opacity-100">
              <Move className="h-3 w-3" />
              Drag to reposition
            </div>
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={draft.scale}
              onChange={(e) =>
                setDraft((prev) =>
                  prev ? { ...prev, scale: Number(e.target.value) } : prev,
                )
              }
              onPointerUp={() => draft && onChange(draft)}
              onKeyUp={() => draft && onChange(draft)}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
          </div>

          {/* Layout selector */}
          <div className="grid grid-cols-3 gap-1.5">
            {LAYOUTS.map((opt) => {
              const Icon = opt.icon;
              const active = draft.layout === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => commit({ ...draft, layout: opt.value })}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-[10px] border px-2 py-2 text-[11px] font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImagePlus className="h-3.5 w-3.5" />
              )}
              Replace
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                setDraft(null);
                onChange(null);
              }}
            >
              <X className="h-3.5 w-3.5" />
              Remove
            </Button>
          </div>
        </>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={onInputChange}
      />
    </div>
  );
}
