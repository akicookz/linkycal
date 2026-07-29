import { useEffect, useState, type ReactNode } from "react";
import { Loader, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type {
  AnalyticsIntegrationConfig,
  ConfigureAnalyticsIntegrationInput,
} from "../../../shared/funnel-analytics";

interface AnalyticsIntegrationCardProps {
  config: AnalyticsIntegrationConfig;
  name: string;
  description: string;
  icon: ReactNode;
  isSaving: boolean;
  error?: string;
  onSave(input: ConfigureAnalyticsIntegrationInput): void;
}

export function AnalyticsIntegrationCard({
  config,
  name,
  description,
  icon,
  isSaving,
  error,
  onSave,
}: AnalyticsIntegrationCardProps) {
  const [enabled, setEnabled] = useState(config.enabled);
  const [identifier, setIdentifier] = useState(function initialIdentifier() {
    if (config.provider === "ga4") return config.measurementId ?? "";
    if (config.provider === "meta_pixel") return config.pixelId ?? "";
    return config.projectKey ?? "";
  });
  const [host, setHost] = useState<"us" | "eu">(
    config.provider === "posthog" ? config.host ?? "us" : "us",
  );

  useEffect(function syncSavedConfig() {
    setEnabled(config.enabled);
    if (config.provider === "ga4") {
      setIdentifier(config.measurementId ?? "");
    } else if (config.provider === "meta_pixel") {
      setIdentifier(config.pixelId ?? "");
    } else {
      setIdentifier(config.projectKey ?? "");
      setHost(config.host ?? "us");
    }
  }, [config]);

  function handleSave() {
    if (config.provider === "ga4") {
      onSave({
        provider: "ga4",
        enabled,
        measurementId: identifier.trim() || undefined,
      });
    } else if (config.provider === "meta_pixel") {
      onSave({
        provider: "meta_pixel",
        enabled,
        pixelId: identifier.trim() || undefined,
      });
    } else {
      onSave({
        provider: "posthog",
        enabled,
        projectKey: identifier.trim() || undefined,
        host,
      });
    }
  }

  const inputLabel = config.provider === "ga4"
    ? "Google Analytics measurement ID"
    : config.provider === "meta_pixel"
      ? "Meta Pixel ID"
      : "PostHog Key";
  const placeholder = config.provider === "ga4"
    ? "G-XXXXXXXXXX"
    : config.provider === "meta_pixel"
      ? "123456789012345"
      : "phc_...";

  return (
    <Card className="rounded-[20px]">
      <CardContent className="space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-muted/60">
            <span className="size-6">{icon}</span>
          </div>
          <div className="min-w-0">
            <h3 className="text-balance text-sm font-semibold">{name}</h3>
            <p className="mt-1 text-pretty text-xs text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-[16px] bg-muted/50 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Enable {name}</p>
            <p className="text-pretty text-xs text-muted-foreground">
              Send safe booking and form funnel events to this provider.
            </p>
          </div>
          <Switch
            aria-label={`Enable ${name}`}
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {config.provider === "posthog"
          ? (
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7.5rem]">
              <div className="space-y-2">
                <label
                  className="text-sm font-medium"
                  htmlFor={`${config.provider}-id`}
                >
                  {inputLabel}
                </label>
                <Input
                  id={`${config.provider}-id`}
                  aria-label={inputLabel}
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder={placeholder}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="posthog-region">
                  Data region
                </label>
                <Select
                  value={host}
                  onValueChange={(value) => setHost(value as "us" | "eu")}
                >
                  <SelectTrigger
                    id="posthog-region"
                    aria-label="PostHog region"
                    className="min-h-10"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="us">🇺🇸 US</SelectItem>
                    <SelectItem value="eu">🇪🇺 EU</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )
          : (
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor={`${config.provider}-id`}
              >
                {inputLabel}
              </label>
              <Input
                id={`${config.provider}-id`}
                aria-label={inputLabel}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder={placeholder}
                autoComplete="off"
              />
            </div>
          )}

        {error && (
          <p role="alert" className="text-pretty text-sm text-destructive">
            {error}
          </p>
        )}

        <Button
          size="sm"
          aria-label={`Save ${name}`}
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving
            ? <Loader className="size-4 animate-spin" />
            : <Save className="size-4" />}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
