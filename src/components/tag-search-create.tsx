import { useEffect, useMemo, useState } from "react";
import { Loader, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface TagSearchOption {
  id: string;
  name: string;
  color: string | null;
}

interface TagSearchCreateProps {
  tags: TagSearchOption[];
  allTags?: TagSearchOption[];
  search: string;
  newTagColor: string;
  loading?: boolean;
  creating?: boolean;
  updatingTagId?: string | null;
  deletingTagId?: string | null;
  emptyText?: string;
  autoFocus?: boolean;
  listClassName?: string;
  onSearchChange: (value: string) => void;
  onNewTagColorChange: (value: string) => void;
  onCreate: (input: { name: string; color: string }) => void;
  onUpdate?: (input: { id: string; name?: string; color?: string }) => void;
  onDelete?: (tagId: string) => void;
  onSelect?: (tag: TagSearchOption) => void;
}

function EditableTagRow({
  tag,
  deleting,
  updating,
  onUpdate,
  onDelete,
}: {
  tag: TagSearchOption;
  deleting: boolean;
  updating: boolean;
  onUpdate: (input: { id: string; name?: string; color?: string }) => void;
  onDelete?: (tagId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);

  useEffect(() => {
    if (!editing) setName(tag.name);
  }, [editing, tag.name]);

  function saveName() {
    const nextName = name.trim();
    setEditing(false);
    if (!nextName) {
      setName(tag.name);
      return;
    }
    if (nextName !== tag.name) onUpdate({ id: tag.id, name: nextName });
  }

  return (
    <div className="group flex items-center justify-between gap-3 rounded-[12px] px-3 py-2 hover:bg-muted/50">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <label
          className="group/swatch relative flex h-3.5 w-3.5 shrink-0 cursor-pointer rounded-full"
          title={`Change ${tag.name} color`}
          aria-busy={updating}
        >
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute -inset-1 rounded-full border-2 border-transparent",
              updating && "animate-spin border-primary/25 border-t-primary",
            )}
          />
          <span
            className="h-full w-full rounded-full ring-2 ring-transparent transition-shadow group-hover/swatch:ring-primary/20"
            style={{ backgroundColor: tag.color ?? "#94a3b8" }}
          />
          <input
            type="color"
            value={tag.color ?? "#94a3b8"}
            onChange={(event) =>
              onUpdate({ id: tag.id, color: event.target.value })
            }
            className="absolute -inset-[13px] h-10 w-10 cursor-pointer opacity-0"
            aria-label={`Color for ${tag.name}`}
          />
        </label>

        {editing ? (
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={saveName}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveName();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setName(tag.name);
                setEditing(false);
              }
            }}
            className="h-7 min-w-0 flex-1 rounded-[8px] bg-background px-2 text-sm font-medium outline-none ring-1 ring-primary/35 focus:ring-2 focus:ring-primary/45"
            aria-label={`Edit ${tag.name} name`}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-sm font-medium outline-none hover:text-primary focus-visible:text-primary"
            onClick={() => setEditing(true)}
            title={`Rename ${tag.name}`}
          >
            {tag.name}
          </button>
        )}
      </div>

      {onDelete && (
        <button
          type="button"
          className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-muted-foreground opacity-0 outline-none transition-[color,opacity,scale] after:absolute after:-inset-1.5 hover:text-destructive focus-visible:opacity-100 focus-visible:text-destructive group-hover:opacity-100 active:scale-[0.96]"
          onClick={() => onDelete(tag.id)}
          disabled={deleting}
          aria-label={`Delete ${tag.name}`}
          title={`Delete ${tag.name}`}
        >
          {deleting ? (
            <Loader className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <X className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

export function TagSearchCreate({
  tags,
  allTags = tags,
  search,
  newTagColor,
  loading = false,
  creating = false,
  updatingTagId,
  deletingTagId,
  emptyText = "No tags yet",
  autoFocus = false,
  listClassName,
  onSearchChange,
  onNewTagColorChange,
  onCreate,
  onUpdate,
  onDelete,
  onSelect,
}: TagSearchCreateProps) {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredTags = useMemo(
    () =>
      normalizedSearch
        ? tags.filter((tag) =>
            tag.name.toLocaleLowerCase().includes(normalizedSearch),
          )
        : tags,
    [normalizedSearch, tags],
  );
  const canCreate =
    normalizedSearch.length > 0 &&
    !allTags.some(
      (tag) => tag.name.toLocaleLowerCase() === normalizedSearch,
    );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canCreate || creating) return;
    onCreate({ name: search.trim(), color: newTagColor });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search or create a tag"
          className="pl-9"
          autoFocus={autoFocus}
          disabled={creating}
        />
      </div>

      <div className={cn("max-h-72 space-y-1 overflow-y-auto pr-1", listClassName)}>
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 px-3 py-2">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        )}

        {!loading && filteredTags.length === 0 && !canCreate && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {emptyText}
          </p>
        )}

        {filteredTags.map((tag) =>
          onSelect ? (
            <button
              key={tag.id}
              type="button"
              className="flex min-h-10 w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-sm font-medium hover:bg-muted/50 disabled:opacity-50"
              onClick={() => onSelect(tag)}
              disabled={creating}
            >
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color ?? "#94a3b8" }}
              />
              <span className="truncate">{tag.name}</span>
            </button>
          ) : onUpdate ? (
            <EditableTagRow
              key={tag.id}
              tag={tag}
              deleting={deletingTagId === tag.id}
              updating={updatingTagId === tag.id}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ) : null,
        )}

        {canCreate && (
          <div className="flex items-center justify-between gap-3 rounded-[12px] bg-muted/50 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <label
                className="relative flex h-3.5 w-3.5 shrink-0 cursor-pointer rounded-full"
                title="Choose tag color"
                aria-busy={creating}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute -inset-1 rounded-full border-2 border-transparent",
                    creating && "animate-spin border-primary/25 border-t-primary",
                  )}
                />
                <span
                  className="h-full w-full rounded-full"
                  style={{ backgroundColor: newTagColor }}
                />
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(event) => onNewTagColorChange(event.target.value)}
                  className="absolute -inset-[13px] h-10 w-10 cursor-pointer opacity-0"
                  aria-label="New tag color"
                  disabled={creating}
                />
              </label>
              <span className="truncate text-sm">Create “{search.trim()}”</span>
            </div>
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
