import { useState, useRef, useCallback } from "react";
import { X, Loader2, ImageIcon, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  uploadUrl: string;
  label?: string;
  className?: string;
  aspectHint?: "landscape" | "square";
}

export function ImageUpload({
  value,
  onChange,
  uploadUrl,
  label,
  className,
  aspectHint = "landscape",
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return;
      if (file.size > 5 * 1024 * 1024) return;

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(uploadUrl, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        onChange(data.url);
      } catch (err) {
        console.error("Upload error:", err);
      } finally {
        setUploading(false);
      }
    },
    [uploadUrl, onChange],
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
  }

  const heightClass = aspectHint === "landscape" ? "h-28" : "h-28";

  if (value) {
    return (
      <div className={cn("relative group", className)}>
        {label && (
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            {label}
          </label>
        )}
        <div
          className={cn(
            "relative rounded-[12px] border border-border overflow-hidden",
            heightClass,
          )}
        >
          <img
            src={value}
            alt={label ?? "Uploaded image"}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 text-xs"
                onClick={() => inputRef.current?.click()}
              >
                <ImagePlus className="h-3 w-3" />
                Replace
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={handleRemove}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={handleInputChange}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      {label && (
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        disabled={uploading}
        className={cn(
          "w-full rounded-[12px] border border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-muted-foreground transition-colors cursor-pointer hover:bg-accent/50",
          heightClass,
          dragOver && "border-primary bg-primary/5",
          uploading && "pointer-events-none opacity-60",
        )}
      >
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <ImageIcon className="h-5 w-5" />
            <span className="text-xs">Click or drag to upload</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={handleInputChange}
      />
    </div>
  );
}
