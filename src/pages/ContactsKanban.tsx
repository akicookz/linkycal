import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ChevronDown,
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
import { TagSearchCreate } from "@/components/tag-search-create";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import CopyContactButton from "@/components/CopyContactButton";
import { useMinuteNow } from "@/hooks/use-minute-now";
import {
  formatNextActionRelativeCompact,
  formatTimeInStage,
  nextActionTimingClass,
} from "@/lib/contact-time";
import {
  buildKanbanColumns,
  UNTAGGED_COLUMN_ID,
  type ViewContact,
  type ViewTag,
} from "@/lib/contacts-view";
import { cn } from "@/lib/utils";

interface ContactsKanbanProps {
  allTags: ViewTag[];
  pivotTagIds: string[] | null;
  showUntagged: boolean;
  filters: ContactQueryFilters;
  onStageChange: (contactId: string, toColumnId: string) => void;
  onStartPipeline?: () => void;
  seedingPipeline?: boolean;
  editable?: boolean;
  onAddStep?: (input: {
    name?: string;
    color?: string;
    tagId?: string;
  }) => Promise<void>;
  onRenameStep?: (tagId: string, name: string) => void;
  onRecolorStep?: (tagId: string, color: string) => void;
  onSwapStep?: (tagId: string, newTagId: string) => void;
  onRemoveStepFromBoard?: (tagId: string) => void;
  onDeleteStepTag?: (tagId: string) => void;
  onReorderSteps?: (fromIndex: number, toIndex: number) => void;
}

interface ContactQueryFilters {
  search?: string;
  tagIds?: string[];
  matchAllTags?: boolean;
  activityType?: string;
  activitySinceDays?: number;
  noActivitySinceDays?: number;
  bookingStatus?: string;
}

interface ContactsPage {
  contacts: ViewContact[];
  total: number;
}

const STAGE_PAGE_SIZE = 20;

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

function buildStageQueryParams(
  filters: ContactQueryFilters,
  columnId: string,
  stageTagIds: string[],
  offset: number,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  for (const tagId of filters.tagIds ?? []) params.append("tagIds", tagId);
  if (filters.matchAllTags) params.set("matchAllTags", "true");
  if (filters.activityType) params.set("activityType", filters.activityType);
  if (filters.activitySinceDays !== undefined) {
    params.set("activitySinceDays", String(filters.activitySinceDays));
  }
  if (filters.noActivitySinceDays !== undefined) {
    params.set("noActivitySinceDays", String(filters.noActivitySinceDays));
  }
  if (filters.bookingStatus) {
    params.set("bookingStatus", filters.bookingStatus);
  }
  if (columnId === UNTAGGED_COLUMN_ID) {
    for (const tagId of stageTagIds) {
      params.append("excludeStageTagIds", tagId);
    }
  } else {
    params.set("stageTagId", columnId);
  }
  params.set("limit", String(STAGE_PAGE_SIZE));
  params.set("offset", String(offset));
  return params;
}

function KanbanCard({
  contact,
  columnId,
  now,
}: {
  contact: ViewContact;
  columnId: string;
  now: Date;
}) {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: contact.id,
    data: { type: "card", fromColumnId: columnId, contact },
  });

  const timeInStage =
    columnId === UNTAGGED_COLUMN_ID
      ? null
      : formatTimeInStage(contact.enteredAtByTagId?.[columnId], now);
  const nextActionDeadline = contact.nextAction?.deadline ?? null;
  const nextActionRelative = nextActionDeadline
    ? formatNextActionRelativeCompact(nextActionDeadline, now)
    : null;
  const nextActionColor = nextActionDeadline
    ? nextActionTimingClass(nextActionDeadline, now)
    : "text-muted-foreground";

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() =>
        navigate(`/app/projects/${projectId}/contacts/${contact.id}`, {
          state: { contactPreview: contact },
        })
      }
      className={cn(
        "group/contact relative cursor-grab touch-none rounded-[12px] border border-border/60 bg-card p-2.5 transition-[border-color,box-shadow,opacity] active:cursor-grabbing",
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
      <div className="flex min-w-0 items-start gap-2 text-left">
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
          style={{ backgroundColor: getAvatarColor(contact.name) }}
        >
          {getInitial(contact.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-5">{contact.name}</p>
          {contact.email && (
            <div className="mt-0.5 flex min-w-0 items-center gap-1">
              <p className="min-w-0 truncate text-xs leading-4 text-muted-foreground">
                {contact.email}
              </p>
              <CopyContactButton
                name={contact.name}
                email={contact.email}
                className="-my-0.5"
              />
            </div>
          )}
        </div>
      </div>
      {(timeInStage || nextActionRelative) && (
        <p className="mt-2 flex min-w-0 items-center gap-1.5 pl-8 text-[11px] tabular-nums text-muted-foreground">
          {timeInStage && <span className="shrink-0">{timeInStage}</span>}
          {timeInStage && nextActionRelative && (
            <span
              aria-hidden="true"
              className="h-1 w-1 shrink-0 rounded-full bg-current opacity-40"
            />
          )}
          {nextActionRelative && (
            <span className={cn("truncate font-medium", nextActionColor)}>
              {nextActionRelative}
            </span>
          )}
        </p>
      )}
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
  allTags,
  availableTags,
  onAdd,
}: {
  allTags: ViewTag[];
  availableTags: ViewTag[];
  onAdd: (input: {
    name?: string;
    color?: string;
    tagId?: string;
  }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [color, setColor] = useState(STEP_COLORS[4]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  function close() {
    setOpen(false);
    setSearch("");
    setColor(STEP_COLORS[4]);
    setCreateError("");
  }

  async function handleCreate(input: { name: string; color: string }) {
    setCreating(true);
    setCreateError("");
    try {
      await onAdd(input);
      close();
    } catch {
      setCreateError("Couldn’t create this step. Try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="w-72 shrink-0">
      <Popover
        open={open}
        onOpenChange={(o) => {
          if (!o && creating) return;
          setOpen(o);
          if (!o) {
            setSearch("");
            setColor(STEP_COLORS[4]);
            setCreateError("");
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
        <PopoverContent align="start" className="w-72 p-3">
          <TagSearchCreate
            tags={availableTags}
            allTags={allTags}
            search={search}
            newTagColor={color}
            creating={creating}
            emptyText="All tags are already in this pipeline"
            autoFocus
            listClassName="max-h-56"
            onSearchChange={setSearch}
            onNewTagColorChange={setColor}
            onCreate={handleCreate}
            onSelect={(tag) => {
              void onAdd({ tagId: tag.id });
              close();
            }}
          />
          {createError && (
            <p role="alert" className="mt-2 px-1 text-xs text-destructive">
              {createError}
            </p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function KanbanColumnBox({
  id,
  tagId,
  name,
  color,
  count,
  editable,
  menu,
  children,
}: {
  id: string;
  tagId?: string;
  name: string;
  color: string | null;
  count: number;
  editable?: boolean;
  menu?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });
  const draggable = useDraggable({
    id: `col:${tagId ?? id}`,
    data: { type: "column", tagId },
    disabled: !editable || !tagId,
  });
  return (
    <div
      ref={setDropRef}
      className={cn(
        "flex flex-col w-72 shrink-0 rounded-[16px] p-3 transition-colors",
        isOver ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/40",
        draggable.isDragging && "opacity-50",
      )}
    >
      <div
        ref={draggable.setNodeRef}
        className="flex items-center justify-between mb-3 px-1"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {editable && tagId && (
            <span
              {...draggable.listeners}
              {...draggable.attributes}
              className="flex h-5 w-4 cursor-grab items-center justify-center text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
              aria-label={`Reorder ${name}`}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>
          )}
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color ?? "#94a3b8" }} />
          <p className="text-sm font-semibold truncate">{name}</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
          {menu}
        </div>
      </div>
      <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pl-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  );
}

function KanbanStageColumn({
  projectId,
  column,
  stageTagIds,
  filters,
  now,
  editable,
  menu,
}: {
  projectId: string;
  column: {
    id: string;
    name: string;
    color: string | null;
  };
  stageTagIds: string[];
  filters: ContactQueryFilters;
  now: Date;
  editable?: boolean;
  menu?: React.ReactNode;
}) {
  const stageMembershipKey =
    column.id === UNTAGGED_COLUMN_ID ? [...stageTagIds].sort() : undefined;
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [
      "projects",
      projectId,
      "contacts",
      "kanban-stage",
      column.id,
      filters,
      stageMembershipKey,
    ],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<ContactsPage> => {
      const params = buildStageQueryParams(
        filters,
        column.id,
        stageTagIds,
        pageParam,
      );
      const response = await fetch(
        `/api/projects/${projectId}/contacts?${params.toString()}`,
      );
      if (!response.ok) throw new Error("Failed to fetch stage contacts");
      const result = await response.json();
      return {
        contacts: result.contacts ?? [],
        total: result.total ?? 0,
      };
    },
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce(
        (count, page) => count + page.contacts.length,
        0,
      );
      return loaded < lastPage.total ? loaded : undefined;
    },
  });
  const contacts = data?.pages.flatMap((page) => page.contacts) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  return (
    <KanbanColumnBox
      id={column.id}
      tagId={column.id === UNTAGGED_COLUMN_ID ? undefined : column.id}
      name={column.name}
      color={column.color}
      count={total}
      editable={editable}
      menu={menu}
    >
      {isLoading && (
        <div className="flex justify-center py-6">
          <Loader className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      {isError && (
        <p className="py-6 text-center text-xs text-destructive">
          Couldn&apos;t load this stage
        </p>
      )}
      {!isLoading && !isError && contacts.length === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Drop here
        </p>
      )}
      {contacts.map((contact) => (
        <KanbanCard
          key={contact.id}
          contact={contact}
          columnId={column.id}
          now={now}
        />
      ))}
      {hasNextPage && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          disabled={isFetchingNextPage}
          onClick={() => fetchNextPage()}
        >
          {isFetchingNextPage ? (
            <Loader className="h-4 w-4 animate-spin" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          Load more
        </Button>
      )}
    </KanbanColumnBox>
  );
}

export default function ContactsKanban({
  allTags,
  pivotTagIds,
  showUntagged,
  filters,
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
  onReorderSteps,
}: ContactsKanbanProps) {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeContact, setActiveContact] = useState<ViewContact | null>(null);
  const now = useMinuteNow();

  // Pointer-based collision: which column the CURSOR is over decides the drop,
  // not the dragged card's (stationary) rect. Falls back to rect overlap when
  // the cursor is in a gap between columns.
  const collisionDetection: CollisionDetection = (args) => {
    const byPointer = pointerWithin(args);
    return byPointer.length > 0 ? byPointer : rectIntersection(args);
  };
  const columns = useMemo(
    () =>
      buildKanbanColumns({
        contacts: [],
        allTags,
        pivotTagIds,
        showUntagged,
      }),
    [allTags, pivotTagIds, showUntagged],
  );
  const columnTagIds = useMemo(
    () => columns.filter((c) => c.id !== UNTAGGED_COLUMN_ID).map((c) => c.id),
    [columns],
  );
  const contactFilters = useMemo<ContactQueryFilters>(
    () => ({
      search: filters.search,
      tagIds: filters.tagIds,
      matchAllTags: filters.matchAllTags,
      activityType: filters.activityType,
      activitySinceDays: filters.activitySinceDays,
      noActivitySinceDays: filters.noActivitySinceDays,
      bookingStatus: filters.bookingStatus,
    }),
    [
      filters.search,
      filters.tagIds,
      filters.matchAllTags,
      filters.activityType,
      filters.activitySinceDays,
      filters.noActivitySinceDays,
      filters.bookingStatus,
    ],
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
          Start a sales pipeline to get Lead, Contacted, Meeting scheduled,
          Follow up, and Closed stages you can drag contacts between.
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
    const data = event.active.data.current as
      | { contact?: ViewContact }
      | undefined;
    setActiveContact(data?.contact ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveContact(null);
    const { active, over } = event;
    if (!over) return;
    const activeType = (active.data.current as { type?: string } | undefined)?.type;

    if (activeType === "column") {
      const fromTagId = (active.data.current as { tagId?: string } | undefined)?.tagId;
      const overId = String(over.id);
      const fromIndex = columnTagIds.indexOf(fromTagId ?? "");
      const toIndex = columnTagIds.indexOf(overId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
      onReorderSteps?.(fromIndex, toIndex);
      return;
    }

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
      onDragCancel={() => setActiveContact(null)}
    >
      <div className="overflow-x-auto -mx-6 px-6 pb-2">
        <div className="flex gap-4 min-w-max">
          {columns.map((col) => (
            <KanbanStageColumn
              key={col.id}
              projectId={projectId}
              column={col}
              stageTagIds={columnTagIds}
              filters={contactFilters}
              now={now}
              editable={editable}
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
            />
          ))}
          {editable && onAddStep && (
            <AddStepColumn
              allTags={allTags}
              availableTags={swappableTags}
              onAdd={onAddStep}
            />
          )}
        </div>
      </div>
      {/* Floating preview that follows the cursor while dragging (portaled,
          so it isn't clipped by the columns' overflow). */}
      <DragOverlay dropAnimation={null}>
        {activeContact ? (
          <div className="w-64 cursor-grabbing rounded-[12px] border border-border bg-card p-2.5 shadow-lg">
            <div className="flex items-start gap-2">
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
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
