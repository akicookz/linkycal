import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Mail,
  Phone,
  GripVertical,
  Sparkles,
  Loader,
  MoreHorizontal,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import CopyContactButton from "@/components/CopyContactButton";
import {
  buildKanbanColumns,
  UNTAGGED_COLUMN_ID,
  type ViewContact,
  type ViewTag,
} from "@/lib/contacts-view";

interface ContactsKanbanProps {
  contacts: ViewContact[];
  allTags: ViewTag[];
  pivotTagIds: string[] | null;
  showUntagged: boolean;
  onStageChange: (contactId: string, toColumnId: string) => void;
  onStartPipeline?: () => void;
  seedingPipeline?: boolean;
  editable?: boolean;
  onAddStep?: (input: { name?: string; color?: string; tagId?: string }) => void;
  onRenameStep?: (tagId: string, name: string) => void;
  onRecolorStep?: (tagId: string, color: string) => void;
  onSwapStep?: (tagId: string, newTagId: string) => void;
  onRemoveStepFromBoard?: (tagId: string) => void;
  onDeleteStepTag?: (tagId: string) => void;
}

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 45%, 45%)`;
}
function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

function KanbanCard({
  contact,
  columnId,
  pivotTagIds,
}: {
  contact: ViewContact;
  columnId: string;
  pivotTagIds: string[] | null;
}) {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: contact.id,
    data: { fromColumnId: columnId },
  });

  // Exclude ALL stage tags from chips, not just the current column's tag.
  const stageSet =
    pivotTagIds && pivotTagIds.length > 0
      ? new Set(pivotTagIds)
      : new Set([columnId]);
  const visibleChips = contact.tags.filter((t) => !stageSet.has(t.id));

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => navigate(`/app/projects/${projectId}/contacts/${contact.id}`)}
      className={cn(
        "group/contact relative bg-card rounded-[12px] border border-border/60 p-3 transition-all touch-none cursor-grab active:cursor-grabbing",
        isDragging ? "opacity-40" : "hover:border-border hover:shadow-xs",
      )}
    >
      {/* Visual drag affordance — decorative only, not the drag target */}
      <span
        aria-hidden="true"
        className="absolute left-1 top-1/2 -translate-y-1/2 -translate-x-full flex h-6 w-5 items-center justify-center text-muted-foreground/0 transition-colors group-hover/contact:text-muted-foreground/60"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>
      <div className="flex w-full items-start gap-2.5 text-left">
        <div
          className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
          style={{ backgroundColor: getAvatarColor(contact.name) }}
        >
          {getInitial(contact.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{contact.name}</p>
          {contact.email && (
            <div className="flex items-center gap-1 mt-0.5 min-w-0">
              <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                <Mail className="h-3 w-3 shrink-0" />
                {contact.email}
              </p>
              <CopyContactButton name={contact.name} email={contact.email} />
            </div>
          )}
          {contact.phone && (
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
              <Phone className="h-3 w-3 shrink-0" />
              {contact.phone}
            </p>
          )}
          {visibleChips.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {visibleChips.slice(0, 3).map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: `${tag.color ?? "#6366f1"}15`,
                    color: tag.color ?? "#6366f1",
                  }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const STEP_COLORS = [
  "#6b7280", "#ef4444", "#f59e0b", "#10b981",
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
];

function StepMenu({
  tagId,
  name,
  color,
  swappableTags,
  onRename,
  onRecolor,
  onSwap,
  onRemoveFromBoard,
  onDeleteTag,
}: {
  tagId: string;
  name: string;
  color: string | null;
  swappableTags: ViewTag[];
  onRename: (tagId: string, name: string) => void;
  onRecolor: (tagId: string, color: string) => void;
  onSwap: (tagId: string, newTagId: string) => void;
  onRemoveFromBoard: (tagId: string) => void;
  onDeleteTag: (tagId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [renameValue, setRenameValue] = useState(name);

  function close() {
    setOpen(false);
    setConfirmRemove(false);
    setRenameValue(name);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setConfirmRemove(false);
          setRenameValue(name);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded-[8px] text-muted-foreground/70 hover:bg-background hover:text-foreground transition-colors"
          aria-label={`Edit ${name}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-2">
        {confirmRemove ? (
          <div className="space-y-1">
            <p className="px-2 py-1 text-xs text-muted-foreground">
              Remove "{name}" from the board, or delete the tag everywhere?
            </p>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => {
                onRemoveFromBoard(tagId);
                close();
              }}
            >
              <X className="h-3.5 w-3.5" />
              Remove from board
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
              onClick={() => {
                onDeleteTag(tagId);
                close();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete tag everywhere
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => setConfirmRemove(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                onRename(tagId, renameValue);
                close();
              }}
            >
              <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="h-8 flex-1"
                aria-label="Step name"
              />
              <button
                type="submit"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] hover:bg-accent"
                aria-label="Save name"
              >
                <Check className="h-4 w-4" />
              </button>
            </form>

            <div className="flex flex-wrap gap-1.5 px-1">
              {STEP_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="h-5 w-5 rounded-full border transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: c === color ? "var(--foreground)" : c,
                  }}
                  aria-label={`Color ${c}`}
                  onClick={() => {
                    onRecolor(tagId, c);
                    close();
                  }}
                />
              ))}
            </div>

            {swappableTags.length > 0 && (
              <div className="border-t border-border/60 pt-1">
                <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  Swap to tag
                </p>
                <div className="max-h-32 overflow-y-auto">
                  {swappableTags.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm hover:bg-accent"
                      onClick={() => {
                        onSwap(tagId, t.id);
                        close();
                      }}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: t.color ?? "#94a3b8" }}
                      />
                      <span className="truncate">{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-[8px] border-t border-border/60 px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmRemove(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove step
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function AddStepColumn({
  availableTags,
  onAdd,
}: {
  availableTags: ViewTag[];
  onAdd: (input: { name?: string; color?: string; tagId?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(STEP_COLORS[4]);

  return (
    <div className="w-72 shrink-0">
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setName("");
            setColor(STEP_COLORS[4]);
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-border text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add step
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2 space-y-2">
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              onAdd({ name: name.trim(), color });
              setOpen(false);
              setName("");
            }}
          >
            <label
              className="h-8 w-8 shrink-0 cursor-pointer rounded-[8px] border"
              style={{ backgroundColor: color }}
              title="Pick a color"
            >
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-0 w-0 opacity-0"
                aria-label="Step color"
              />
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New step name"
              className="h-8 flex-1"
              aria-label="New step name"
            />
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] hover:bg-accent disabled:opacity-40"
              aria-label="Add step"
            >
              <Plus className="h-4 w-4" />
            </button>
          </form>

          {availableTags.length > 0 && (
            <div className="border-t border-border/60 pt-1">
              <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                Use existing tag
              </p>
              <div className="max-h-40 overflow-y-auto">
                {availableTags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm hover:bg-accent"
                    onClick={() => {
                      onAdd({ tagId: t.id });
                      setOpen(false);
                    }}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: t.color ?? "#94a3b8" }}
                    />
                    <span className="truncate">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function KanbanColumnBox({
  id,
  name,
  color,
  count,
  menu,
  children,
}: {
  id: string;
  name: string;
  color: string | null;
  count: number;
  menu?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col w-72 shrink-0 rounded-[16px] p-3 transition-colors",
        isOver ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/40",
      )}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color ?? "#94a3b8" }} />
          <p className="text-sm font-semibold truncate">{name}</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
          {menu}
        </div>
      </div>
      <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-0.5 pl-2">
        {children}
      </div>
    </div>
  );
}

export default function ContactsKanban({
  contacts,
  allTags,
  pivotTagIds,
  showUntagged,
  onStageChange,
  onStartPipeline,
  seedingPipeline,
  editable,
  onAddStep,
  onRenameStep,
  onRecolorStep,
  onSwapStep,
  onRemoveStepFromBoard,
  onDeleteStepTag,
}: ContactsKanbanProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeContact = useMemo(
    () => (activeId ? contacts.find((c) => c.id === activeId) ?? null : null),
    [activeId, contacts],
  );

  // Pointer-based collision: which column the CURSOR is over decides the drop,
  // not the dragged card's (stationary) rect. Falls back to rect overlap when
  // the cursor is in a gap between columns.
  const collisionDetection: CollisionDetection = (args) => {
    const byPointer = pointerWithin(args);
    return byPointer.length > 0 ? byPointer : rectIntersection(args);
  };
  const columns = useMemo(
    () => buildKanbanColumns({ contacts, allTags, pivotTagIds, showUntagged }),
    [contacts, allTags, pivotTagIds, showUntagged],
  );
  const columnTagIds = useMemo(
    () => columns.filter((c) => c.id !== UNTAGGED_COLUMN_ID).map((c) => c.id),
    [columns],
  );
  const swappableTags = useMemo(() => {
    const used = new Set(columnTagIds);
    return allTags.filter((t) => !used.has(t.id));
  }, [allTags, columnTagIds]);

  if (columns.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-sm font-medium mb-1">No pipeline yet</p>
        <p className="text-sm text-muted-foreground mb-4">
          Start a sales pipeline to get Lead, Prospect, First Contact, Follow Up,
          and Met stages you can drag contacts between.
        </p>
        {onStartPipeline && (
          <Button size="sm" onClick={onStartPipeline} disabled={seedingPipeline}>
            {seedingPipeline ? <Loader className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Start a sales pipeline
          </Button>
        )}
      </Card>
    );
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const contactId = String(active.id);
    const toColumnId = String(over.id);
    const fromColumnId = (active.data.current as { fromColumnId?: string } | undefined)?.fromColumnId;
    if (toColumnId === fromColumnId) return;
    onStageChange(contactId, toColumnId);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="overflow-x-auto -mx-6 px-6 pb-2">
        <div className="flex gap-4 min-w-max">
          {columns.map((col) => (
            <KanbanColumnBox
              key={col.id}
              id={col.id}
              name={col.name}
              color={col.color}
              count={col.contacts.length}
              menu={
                editable && col.id !== UNTAGGED_COLUMN_ID && onRenameStep ? (
                  <StepMenu
                    tagId={col.id}
                    name={col.name}
                    color={col.color}
                    swappableTags={swappableTags}
                    onRename={onRenameStep}
                    onRecolor={onRecolorStep!}
                    onSwap={onSwapStep!}
                    onRemoveFromBoard={onRemoveStepFromBoard!}
                    onDeleteTag={onDeleteStepTag!}
                  />
                ) : undefined
              }
            >
              {col.contacts.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Drop here</p>
              )}
              {col.contacts.map((contact) => (
                <KanbanCard key={contact.id} contact={contact} columnId={col.id} pivotTagIds={pivotTagIds} />
              ))}
            </KanbanColumnBox>
          ))}
          {editable && onAddStep && <AddStepColumn availableTags={swappableTags} onAdd={onAddStep} />}
        </div>
      </div>
      {/* Floating preview that follows the cursor while dragging (portaled,
          so it isn't clipped by the columns' overflow). */}
      <DragOverlay dropAnimation={null}>
        {activeContact ? (
          <div className="w-64 rounded-[12px] border border-border bg-card p-3 shadow-lg cursor-grabbing">
            <div className="flex items-start gap-2.5">
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                style={{ backgroundColor: getAvatarColor(activeContact.name) }}
              >
                {getInitial(activeContact.name)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{activeContact.name}</p>
                {activeContact.email && (
                  <p className="text-xs text-muted-foreground truncate">{activeContact.email}</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
