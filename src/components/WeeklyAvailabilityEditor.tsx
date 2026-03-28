import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  createDefaultAvailabilityBlock,
  type DayAvailabilityConfig,
  getTimeOptions,
  minutesToTime,
  parseTimeToMinutes,
  WEEKDAY_LABELS,
} from "@/lib/availability";

interface WeeklyAvailabilityEditorProps {
  dayConfigs: DayAvailabilityConfig[];
  onChange: (dayConfigs: DayAvailabilityConfig[]) => void;
  disabled?: boolean;
}

export function WeeklyAvailabilityEditor({
  dayConfigs,
  onChange,
  disabled = false,
}: WeeklyAvailabilityEditorProps) {
  function handleToggleDay(dayIndex: number, enabled: boolean) {
    const nextDayConfigs = [...dayConfigs];
    const current = nextDayConfigs[dayIndex];

    nextDayConfigs[dayIndex] = enabled
      ? {
          enabled: true,
          blocks:
            current.blocks.length > 0
              ? current.blocks
              : [createDefaultAvailabilityBlock()],
        }
      : {
          enabled: false,
          blocks: [],
        };

    onChange(nextDayConfigs);
  }

  function handleUpdateBlock(
    dayIndex: number,
    blockIndex: number,
    field: "startTime" | "endTime",
    value: string,
  ) {
    const nextDayConfigs = [...dayConfigs];
    const dayConfig = nextDayConfigs[dayIndex];
    const nextBlocks = [...dayConfig.blocks];
    nextBlocks[blockIndex] = {
      ...nextBlocks[blockIndex],
      [field]: value,
    };

    nextDayConfigs[dayIndex] = {
      ...dayConfig,
      blocks: nextBlocks,
    };

    onChange(nextDayConfigs);
  }

  function handleAddBlock(dayIndex: number) {
    const nextDayConfigs = [...dayConfigs];
    const dayConfig = nextDayConfigs[dayIndex];
    const lastBlock = dayConfig.blocks[dayConfig.blocks.length - 1];
    if (!lastBlock) return;

    const startMinutes = parseTimeToMinutes(lastBlock.endTime) + 15;
    const endMinutes = Math.min(startMinutes + 60, 24 * 60);
    if (startMinutes > 23 * 60 + 45 || endMinutes <= startMinutes) return;

    nextDayConfigs[dayIndex] = {
      ...dayConfig,
      enabled: true,
      blocks: [
        ...dayConfig.blocks,
        {
          startTime: minutesToTime(startMinutes),
          endTime: minutesToTime(endMinutes),
        },
      ],
    };

    onChange(nextDayConfigs);
  }

  function handleDeleteBlock(dayIndex: number, blockIndex: number) {
    const nextDayConfigs = [...dayConfigs];
    const dayConfig = nextDayConfigs[dayIndex];
    const nextBlocks = dayConfig.blocks.filter((_, index) => index !== blockIndex);

    nextDayConfigs[dayIndex] = {
      enabled: nextBlocks.length > 0,
      blocks: nextBlocks,
    };

    onChange(nextDayConfigs);
  }

  return (
    <div className="space-y-3">
      {WEEKDAY_LABELS.map((dayLabel, dayIndex) => {
        const dayConfig = dayConfigs[dayIndex];

        return (
          <div
            key={dayLabel}
            className="grid grid-cols-[auto_7rem_minmax(0,1fr)] items-start gap-4 py-2"
          >
            <div className="flex h-10 items-center">
              <Switch
                checked={dayConfig.enabled}
                onCheckedChange={(checked) =>
                  handleToggleDay(dayIndex, checked)
                }
                disabled={disabled}
              />
            </div>
            <div
              className={`flex h-10 items-center text-sm font-medium ${
                dayConfig.enabled ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {dayLabel}
            </div>

            {dayConfig.enabled ? (
              <div className="flex-1 space-y-2">
                {dayConfig.blocks.map((block, blockIndex) => {
                  const startOptions = getTimeOptions({
                    minMinutes: getMinStartMinutes(dayConfig.blocks, blockIndex),
                    maxMinutes: getMaxStartMinutes(
                      dayConfig.blocks,
                      blockIndex,
                      block.endTime,
                    ),
                    includeMidnight: false,
                  });
                  const endOptions = getTimeOptions({
                    minMinutes:
                      parseTimeToMinutes(block.startTime) + 15,
                    maxMinutes: getMaxEndMinutes(dayConfig.blocks, blockIndex),
                    includeMidnight: true,
                  });
                  const isLastBlock =
                    blockIndex === dayConfig.blocks.length - 1;
                  const canAddAnotherBlock =
                    isLastBlock &&
                    parseTimeToMinutes(block.endTime) + 15 <= 23 * 60 + 45;

                  return (
                    <div
                      key={`${dayLabel}-${blockIndex}`}
                      className="flex items-center gap-2"
                    >
                      <TimeSelect
                        value={block.startTime}
                        options={startOptions}
                        onValueChange={(value) =>
                          handleUpdateBlock(dayIndex, blockIndex, "startTime", value)
                        }
                        disabled={disabled}
                      />
                      <span className="text-sm text-muted-foreground">to</span>
                      <TimeSelect
                        value={block.endTime}
                        options={endOptions}
                        onValueChange={(value) =>
                          handleUpdateBlock(dayIndex, blockIndex, "endTime", value)
                        }
                        disabled={disabled}
                      />
                      {canAddAnotherBlock && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-[12px]"
                          onClick={() => handleAddBlock(dayIndex)}
                          disabled={disabled}
                          aria-label={`Add block for ${dayLabel}`}
                          title={`Add block for ${dayLabel}`}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-[12px]"
                        onClick={() => handleDeleteBlock(dayIndex, blockIndex)}
                        disabled={disabled}
                        aria-label={`Delete block ${blockIndex + 1} for ${dayLabel}`}
                        title={`Delete block ${blockIndex + 1} for ${dayLabel}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <span className="flex h-10 items-center text-sm text-muted-foreground">
                Unavailable
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TimeSelect(props: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onValueChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <Select
      value={props.value}
      onValueChange={props.onValueChange}
      disabled={props.disabled}
    >
      <SelectTrigger className="w-[140px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {props.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function getMinStartMinutes(
  blocks: DayAvailabilityConfig["blocks"],
  blockIndex: number,
): number {
  if (blockIndex === 0) return 0;

  return parseTimeToMinutes(blocks[blockIndex - 1].endTime) + 15;
}

function getMaxStartMinutes(
  blocks: DayAvailabilityConfig["blocks"],
  blockIndex: number,
  endTime: string,
): number {
  return Math.min(
    parseTimeToMinutes(endTime) - 15,
    getMaxEndMinutes(blocks, blockIndex) - 15,
  );
}

function getMaxEndMinutes(
  blocks: DayAvailabilityConfig["blocks"],
  blockIndex: number,
): number {
  const nextBlock = blocks[blockIndex + 1];
  if (!nextBlock) return 24 * 60;

  return parseTimeToMinutes(nextBlock.startTime) - 15;
}

