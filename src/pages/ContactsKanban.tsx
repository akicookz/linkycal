import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Mail, Phone, GripVertical, Sparkles, Loader } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCorners,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import CopyContactButton from "@/components/CopyContactButton";
import {
  buildKanbanColumns,
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

function KanbanCard({ contact, columnId }: { contact: ViewContact; columnId: string }) {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: contact.id,
    data: { fromColumnId: columnId },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/contact relative bg-card rounded-[12px] border border-border/60 p-3 transition-all",
        isDragging ? "opacity-40" : "hover:border-border hover:shadow-xs",
      )}
    >
      {/* Floating drag handle, revealed on hover; absolute so it never shifts the card. */}
      <span
        className="absolute left-1 top-1/2 -translate-y-1/2 -translate-x-full flex h-6 w-5 cursor-grab items-center justify-center text-muted-foreground/0 transition-colors group-hover/contact:text-muted-foreground/60 active:cursor-grabbing"
        aria-label="Drag to move stage"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>
      <button
        type="button"
        onClick={() => navigate(`/app/projects/${projectId}/contacts/${contact.id}`)}
        className="flex w-full items-start gap-2.5 text-left"
      >
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
          {contact.tags.filter((t) => t.id !== columnId).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {contact.tags
                .filter((t) => t.id !== columnId)
                .slice(0, 3)
                .map((tag) => (
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
      </button>
    </div>
  );
}

function KanbanColumnBox({
  id,
  name,
  color,
  count,
  children,
}: {
  id: string;
  name: string;
  color: string | null;
  count: number;
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
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
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
}: ContactsKanbanProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const columns = useMemo(
    () => buildKanbanColumns({ contacts, allTags, pivotTagIds, showUntagged }),
    [contacts, allTags, pivotTagIds, showUntagged],
  );

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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const contactId = String(active.id);
    const toColumnId = String(over.id);
    const fromColumnId = (active.data.current as { fromColumnId?: string } | undefined)?.fromColumnId;
    if (toColumnId === fromColumnId) return;
    onStageChange(contactId, toColumnId);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto -mx-6 px-6 pb-2">
        <div className="flex gap-4 min-w-max">
          {columns.map((col) => (
            <KanbanColumnBox key={col.id} id={col.id} name={col.name} color={col.color} count={col.contacts.length}>
              {col.contacts.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Drop here</p>
              )}
              {col.contacts.map((contact) => (
                <KanbanCard key={contact.id} contact={contact} columnId={col.id} />
              ))}
            </KanbanColumnBox>
          ))}
        </div>
      </div>
    </DndContext>
  );
}
