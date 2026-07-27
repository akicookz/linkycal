export const CONFIRMATION_LEAD_TIME_MS = 60 * 60 * 1000;

export function getBookingWindowStart(
  startTime: Date,
  bufferBeforeMinutes: number,
): Date {
  return new Date(startTime.getTime() - bufferBeforeMinutes * 60 * 1000);
}

export function isBookableStartTime(
  startTime: Date,
  requiresConfirmation: boolean,
  bufferBeforeMinutes: number,
  now: Date,
): boolean {
  const leadTime = requiresConfirmation ? CONFIRMATION_LEAD_TIME_MS : 0;
  const bookingWindowStart = getBookingWindowStart(
    startTime,
    bufferBeforeMinutes,
  );
  return bookingWindowStart.getTime() > now.getTime() + leadTime;
}
