import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { McpClientIcon } from "@/components/mcp/McpClientIcon";

interface CopyFieldProps {
  label: string;
  value: string;
}

function CopyField({ label, value }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(function clearCopyTimerOnUnmount() {
    return function clearTimer() {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  async function copyValue(): Promise<void> {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(function resetCopied() {
      setCopied(false);
    }, 2_000);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-col gap-2 rounded-[16px] bg-muted/50 p-3 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-foreground">
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 transition-[transform,background-color,color] active:scale-[0.96]"
          onClick={copyValue}
        >
          {copied ? (
            <Check className="text-emerald-600" aria-hidden="true" />
          ) : (
            <Copy aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function ClientTab({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <McpClientIcon
        clientName={name}
        className="size-7 rounded-[9px] shadow-none"
      />
      {name}
    </span>
  );
}

function InstructionList({ children }: { children: React.ReactNode }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground marker:text-foreground">
      {children}
    </ol>
  );
}

export function McpConnectInstructions() {
  const mcpUrl = `${window.location.origin}/api/mcp`;
  const claudeCommand = `claude mcp add --transport http linkycal ${mcpUrl}`;

  return (
    <section aria-labelledby="mcp-connect-title">
      <Card>
        <CardHeader>
          <CardTitle id="mcp-connect-title">Connect a client</CardTitle>
          <CardDescription>
            Add the LinkyCal MCP URL, then sign in with OAuth and choose one
            project. No API key or custom authorization header is required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="claude">
            <div className="overflow-x-auto pb-1">
              <TabsList className="h-auto min-w-max justify-start">
                <TabsTrigger value="claude">
                  <ClientTab name="Claude" />
                </TabsTrigger>
                <TabsTrigger value="chatgpt">
                  <ClientTab name="ChatGPT" />
                </TabsTrigger>
                <TabsTrigger value="cursor">
                  <ClientTab name="Cursor" />
                </TabsTrigger>
                <TabsTrigger value="lovable">
                  <ClientTab name="Lovable" />
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="claude" className="mt-5 space-y-5">
              <InstructionList>
                <li>Open Settings, then Connectors.</li>
                <li>
                  Click Add custom connector, paste <code>{mcpUrl}</code>, and
                  continue.
                </li>
                <li>Sign in to LinkyCal and select the project to connect.</li>
              </InstructionList>
              <CopyField label="MCP server URL" value={mcpUrl} />
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Claude Code
                </p>
                <CopyField label="Run in a terminal" value={claudeCommand} />
                <p className="text-sm text-muted-foreground">
                  Then run <code>/mcp</code> in a session and select{" "}
                  <code>linkycal</code> to sign in.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="chatgpt" className="mt-5 space-y-5">
              <InstructionList>
                <li>Open Settings, then Apps &amp; Connectors.</li>
                <li>
                  Open Advanced settings, enable Developer mode, and choose
                  Create app.
                </li>
                <li>
                  Paste the MCP URL and complete LinkyCal OAuth in the browser.
                </li>
              </InstructionList>
              <CopyField label="MCP server URL" value={mcpUrl} />
              <p className="text-xs leading-5 text-muted-foreground">
                Availability depends on your current ChatGPT workspace and plan.
              </p>
            </TabsContent>

            <TabsContent value="cursor" className="mt-5 space-y-5">
              <InstructionList>
                <li>Open Settings, then Tools &amp; MCP.</li>
                <li>Choose New MCP server and select Streamable HTTP.</li>
                <li>
                  Paste the MCP URL and complete OAuth in the browser window.
                </li>
              </InstructionList>
              <CopyField label="MCP server URL" value={mcpUrl} />
            </TabsContent>

            <TabsContent value="lovable" className="mt-5 space-y-5">
              <InstructionList>
                <li>Open Settings, then Connectors.</li>
                <li>Open Personal connectors and choose New MCP server.</li>
                <li>
                  Paste the MCP URL, keep OAuth selected, then sign in and
                  select a LinkyCal project.
                </li>
              </InstructionList>
              <CopyField label="MCP server URL" value={mcpUrl} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </section>
  );
}
