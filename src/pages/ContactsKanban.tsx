import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Mail, Phone } from "lucide-react";
import { Card } from "@/components/ui/card";

interface ContactTag {
  id: string;
  name: string;
  color: string | null;
}

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  tags: ContactTag[];
}

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface ContactsKanbanProps {
  contacts: Contact[];
  allTags: Tag[];
  pivotTagIds: string[] | null;
  showUntagged: boolean;
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

export default function ContactsKanban({
  contacts,
  allTags,
  pivotTagIds,
  showUntagged,
}: ContactsKanbanProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const columns = useMemo(() => {
    const tagsToShow =
      pivotTagIds && pivotTagIds.length > 0
        ? allTags.filter((t) => pivotTagIds.includes(t.id))
        : allTags;

    const tagColumns = tagsToShow.map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      contacts: contacts.filter((c) => c.tags.some((t) => t.id === tag.id)),
    }));

    if (showUntagged) {
      const allowedTagIds = new Set(tagsToShow.map((t) => t.id));
      tagColumns.push({
        id: "__untagged__",
        name: "Untagged",
        color: "#94a3b8",
        contacts: contacts.filter(
          (c) =>
            c.tags.length === 0 ||
            !c.tags.some((t) => allowedTagIds.has(t.id)),
        ),
      });
    }

    return tagColumns;
  }, [contacts, allTags, pivotTagIds, showUntagged]);

  if (columns.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-sm font-medium mb-1">No tags to pivot by</p>
        <p className="text-sm text-muted-foreground">
          Create some tags to use the kanban view, or pick which tags become
          columns from the filters menu.
        </p>
      </Card>
    );
  }

  return (
    <div className="overflow-x-auto -mx-6 px-6 pb-2">
      <div className="flex gap-4 min-w-max">
        {columns.map((col) => (
          <div
            key={col.id}
            className="flex flex-col w-72 shrink-0 rounded-[16px] bg-muted/40 p-3"
          >
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: col.color ?? "#94a3b8" }}
                />
                <p className="text-sm font-semibold truncate">{col.name}</p>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {col.contacts.length}
              </span>
            </div>

            <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-0.5">
              {col.contacts.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No contacts
                </p>
              )}
              {col.contacts.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() =>
                    navigate(
                      `/app/projects/${projectId}/contacts/${contact.id}`,
                    )
                  }
                  className="w-full text-left bg-card rounded-[12px] border border-border/60 p-3 hover:border-border hover:shadow-xs transition-all"
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                      style={{ backgroundColor: getAvatarColor(contact.name) }}
                    >
                      {getInitial(contact.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {contact.name}
                      </p>
                      {contact.email && (
                        <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                          <Mail className="h-3 w-3 shrink-0" />
                          {contact.email}
                        </p>
                      )}
                      {contact.phone && (
                        <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3 shrink-0" />
                          {contact.phone}
                        </p>
                      )}
                      {contact.tags.length > 1 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {contact.tags
                            .filter((t) => t.id !== col.id)
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
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
