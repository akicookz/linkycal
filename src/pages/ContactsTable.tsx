import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  compareContacts,
  contactStageTagId,
  type SortKey,
  type ViewContact,
  type ViewTag,
} from "@/lib/contacts-view";

interface ContactsTableProps {
  contacts: ViewContact[];
  allTags: ViewTag[];
  pivotTagIds: string[] | null;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function ContactsTable({
  contacts,
  allTags,
  pivotTagIds,
  onSelect,
  onEdit,
  onDelete,
}: ContactsTableProps) {
  const hasStage = !!pivotTagIds && pivotTagIds.length > 0;
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const tagById = useMemo(() => new Map(allTags.map((t) => [t.id, t])), [allTags]);

  const sorted = useMemo(
    () => [...contacts].sort((a, b) => compareContacts(a, b, sortKey, dir, pivotTagIds, allTags)),
    [contacts, sortKey, dir, pivotTagIds, allTags],
  );

  function toggleSort(key: SortKey) {
    if (key === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir("asc");
    }
  }

  const columns: Array<{ key: SortKey; label: string; className?: string }> = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email", className: "hidden md:table-cell" },
    { key: "phone", label: "Phone", className: "hidden lg:table-cell" },
    { key: hasStage ? "stage" : "name", label: hasStage ? "Stage" : "Tags" },
    { key: "lastActivity", label: "Last activity", className: "hidden sm:table-cell" },
  ];

  function Header({ col }: { col: (typeof columns)[number] }) {
    const sortable = !(col.label === "Tags");
    const active = sortable && sortKey === col.key;
    return (
      <th
        className={cn(
          "px-3 py-2 text-left text-xs font-medium text-muted-foreground select-none",
          sortable && "cursor-pointer hover:text-foreground",
          col.className,
        )}
        onClick={sortable ? () => toggleSort(col.key) : undefined}
      >
        <span className="inline-flex items-center gap-1">
          {col.label}
          {active && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </span>
      </th>
    );
  }

  return (
    <div className="overflow-x-auto px-2 pb-2">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <Header key={col.label} col={col} />
            ))}
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((contact) => {
            const stageId = contactStageTagId(contact, pivotTagIds);
            const stageTag = stageId ? tagById.get(stageId) : null;
            return (
              <tr
                key={contact.id}
                className="group/row cursor-pointer border-t border-border/50 hover:bg-muted/40"
                onClick={() => onSelect(contact.id)}
              >
                <td className="px-3 py-2.5 text-sm font-medium">{contact.name}</td>
                <td className="px-3 py-2.5 text-sm text-muted-foreground hidden md:table-cell">
                  {contact.email ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-sm text-muted-foreground hidden lg:table-cell">
                  {contact.phone ?? "—"}
                </td>
                <td className="px-3 py-2.5">
                  {hasStage ? (
                    stageTag ? (
                      <span
                        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: `${stageTag.color ?? "#6366f1"}15`,
                          color: stageTag.color ?? "#6366f1",
                        }}
                      >
                        {stageTag.name}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {contact.tags.slice(0, 3).map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{ backgroundColor: `${t.color ?? "#6366f1"}15`, color: t.color ?? "#6366f1" }}
                        >
                          {t.name}
                        </span>
                      ))}
                      {contact.tags.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-sm text-muted-foreground hidden sm:table-cell">
                  {formatRelative(contact.lastActivityAt)}
                </td>
                <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover/row:opacity-100 hover:bg-accent"
                      onClick={() => onEdit(contact.id)}
                      aria-label={`Edit ${contact.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive opacity-0 group-hover/row:opacity-100 hover:bg-destructive/10"
                      onClick={() => onDelete(contact.id)}
                      aria-label={`Delete ${contact.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
