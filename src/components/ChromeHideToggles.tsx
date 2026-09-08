import { Switch } from "@/components/ui/switch";
import {
  CHROME_FLAG_KEYS,
  type ChromeFlags,
  type ChromeId,
} from "../../shared/public-chrome";

interface ChromeHideRow {
  id: ChromeId;
  title: string;
  description: string;
}

const FORM_ROWS: ChromeHideRow[] = [
  {
    id: "banner",
    title: "Hide banner",
    description: "Remove the project banner image from the public form.",
  },
  {
    id: "title",
    title: "Hide title",
    description: "Hide the form name. Focused forms already omit it.",
  },
  {
    id: "intro",
    title: "Hide intro",
    description: "Hide section titles and descriptions.",
  },
  {
    id: "media",
    title: "Hide section image",
    description: "Do not show section images on the public form.",
  },
  {
    id: "branding",
    title: "Hide LinkyCal branding",
    description: "Remove the Powered by footer. Pro and Business only.",
  },
];

const BOOKING_ROWS: ChromeHideRow[] = [
  {
    id: "banner",
    title: "Hide banner",
    description: "Remove the project banner image from the booking page.",
  },
  {
    id: "title",
    title: "Hide title",
    description: "Hide the event name on the first step.",
  },
  {
    id: "intro",
    title: "Hide intro",
    description: "Hide the event description on the first step.",
  },
  {
    id: "avatar",
    title: "Hide avatar",
    description: "Hide the host photo.",
  },
  {
    id: "branding",
    title: "Hide LinkyCal branding",
    description: "Remove the Powered by footer. Pro and Business only.",
  },
];

export interface ChromeHideTogglesProps {
  variant: "form" | "booking";
  flags: ChromeFlags;
  canHideBranding: boolean;
  onChange: (flags: ChromeFlags) => void;
  onBrandingLocked?: () => void;
}

export function ChromeHideToggles(props: ChromeHideTogglesProps) {
  const rows = props.variant === "form" ? FORM_ROWS : BOOKING_ROWS;

  function setFlag(id: ChromeId, hidden: boolean) {
    if (id === "branding" && hidden && !props.canHideBranding) {
      props.onBrandingLocked?.();
      return;
    }
    props.onChange({
      ...props.flags,
      [CHROME_FLAG_KEYS[id]]: hidden || undefined,
    });
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const key = CHROME_FLAG_KEYS[row.id];
        return (
          <div
            key={row.id}
            className="flex items-center justify-between rounded-[16px] bg-muted/50 px-4 py-3"
          >
            <div className="pr-3">
              <p className="text-sm font-medium">{row.title}</p>
              <p className="text-xs text-muted-foreground">{row.description}</p>
            </div>
            <Switch
              checked={props.flags[key] === true}
              onCheckedChange={(checked) => setFlag(row.id, checked)}
            />
          </div>
        );
      })}
    </div>
  );
}
