import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Check, Loader, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/query-client";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PickerTag {
  id: string;
  name: string;
  color: string | null;
}

// ─── Tag Picker ──────────────────────────────────────────────────────────────
//
// Popover body for assigning tags: lists every tag with a check on the ones
// already assigned (click toggles), plus an inline create row at the bottom.
// Newly created tags are assigned immediately.

export function TagPickerContent({
  projectId,
  assignedTagIds,
  onToggle,
  pendingTagId,
}: {
  projectId: string;
  assignedTagIds: string[];
  onToggle: (tag: PickerTag, currentlyAssigned: boolean) => void;
  pendingTagId?: string | null;
}) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");

  const { data: tags = [] } = useQuery<PickerTag[]>({
    queryKey: ["projects", projectId, "tags"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/tags`);
      if (!res.ok) throw new Error("Failed to fetch tags");
      const data = await res.json();
      return data.tags ?? [];
    },
    enabled: !!projectId,
  });

  const createTagMutation = useMutation({
    mutationFn: async (data: { name: string; color?: string }) => {
      const res = await fetch(`/api/projects/${projectId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create tag");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "tags"] });
      setNewName("");
      const tag = data?.tag as PickerTag | undefined;
      if (tag) onToggle(tag, false);
    },
  });

  const assignedSet = new Set(assignedTagIds);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!newName.trim() || createTagMutation.isPending) return;
    createTagMutation.mutate({ name: newName.trim(), color: newColor || undefined });
  }

  return (
    <div className="space-y-1">
      {tags.length === 0 ? (
        <p className="text-xs text-muted-foreground px-2 py-2 text-center">
          No tags yet. Create one below.
        </p>
      ) : (
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {tags.map((tag) => {
            const assigned = assignedSet.has(tag.id);
            const pending = pendingTagId === tag.id;
            return (
              <button
                key={tag.id}
                type="button"
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-[8px] text-sm hover:bg-accent transition-colors text-left"
                onClick={() => onToggle(tag, assigned)}
                disabled={pending}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: tag.color ?? "#94a3b8" }}
                />
                <span className="truncate flex-1">{tag.name}</span>
                {pending ? (
                  <Loader className="h-3 w-3 animate-spin shrink-0" />
                ) : (
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-primary transition-opacity",
                      assigned ? "opacity-100" : "opacity-0",
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      <form onSubmit={handleCreate} className="flex items-center gap-1.5 pt-1.5">
        <label
          className="h-8 w-8 shrink-0 cursor-pointer rounded-[10px] border transition-transform hover:scale-105"
          style={{ backgroundColor: newColor }}
          title="Pick a color"
        >
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(newColor) ? newColor : "#6366f1"}
            onChange={(e) => setNewColor(e.target.value)}
            className="h-0 w-0 opacity-0"
            aria-label="Tag color"
          />
        </label>
        <Input
          placeholder="New tag..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="h-8 flex-1 text-xs"
        />
        <Button
          type="submit"
          size="sm"
          className="h-8 w-8 shrink-0 p-0"
          aria-label="Create tag"
          disabled={createTagMutation.isPending || !newName.trim()}
        >
          {createTagMutation.isPending ? (
            <Loader className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
        </Button>
      </form>
    </div>
  );
}
