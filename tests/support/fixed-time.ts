import { setSystemTime } from "bun:test";

export function setFixedTime(iso: string): void {
  setSystemTime(new Date(iso));
}

export function restoreRealTime(): void {
  setSystemTime();
}
