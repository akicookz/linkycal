# Fix Activity Cards: Anonymous Name + Time Format + 24h Filter

## Issue 1: Form responses showing "Anonymous"

### Backend: `worker/index.ts` (~line 3990-4017)

After fetching form responses, do a secondary query to get names from field values:

```ts
// After the responses query (line 4005), add:
const responseIds = responses.map((r) => r.id);
const nameValues = responseIds.length
  ? await db
      .select({
        responseId: dbSchema.formFieldValues.responseId,
        value: dbSchema.formFieldValues.value,
      })
      .from(dbSchema.formFieldValues)
      .innerJoin(dbSchema.formFields, eq(dbSchema.formFieldValues.fieldId, dbSchema.formFields.id))
      .where(
        and(
          inArray(dbSchema.formFieldValues.responseId, responseIds),
          like(dbSchema.formFields.label, "%name%"),
          eq(dbSchema.formFields.type, "text")
        )
      )
  : [];

const nameByResponseId = new Map(nameValues.map((n) => [n.responseId, n.value]));
```

Then update line 4014:
```ts
name: nameByResponseId.get(r.id) ?? r.respondentEmail ?? "Anonymous",
```

### Frontend: `src/pages/FormResponses.tsx` (~line 152)

The FormResponses page needs the same treatment. Check if form field values are already fetched on this page. If so, extract the name field value. Update `toDrawerItem` function (line 148-159) similarly.

Need to check what data `responses` contains on this page - if it includes field values, extract name from there.

## Issue 2: Filter out activity >24h past meeting time

### Backend: `worker/index.ts` (~line 3966-3988)

Add a WHERE clause to the bookings query to filter out bookings where endTime is more than 24h ago:

```ts
// Add to the .where() on the bookings query:
.where(
  and(
    eq(dbSchema.eventTypes.projectId, projectId),
    gte(dbSchema.bookings.endTime, sql`datetime('now', '-24 hours')`)
  )
)
```

For form responses, add similar filter on createdAt:
```ts
.where(
  and(
    eq(dbSchema.forms.projectId, projectId),
    gte(dbSchema.formResponses.createdAt, sql`(unixepoch() - 86400)`)
  )
)
```

## Issue 3: Show actual times in browser timezone

### Frontend: `src/components/ActivityCard.tsx` (~line 45-82)

Update `getRelativeTime` to accept `startTime` as a Date-parseable string and include formatted time:

```ts
export function getRelativeTime(startTime: string, endTime: string): { label: string; isHappening: boolean; isUpcoming: boolean; isPast: boolean } {
  const now = Date.now();
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  
  // Format time in browser timezone
  const timeStr = new Date(startTime).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  
  // Format date part for further-out events
  const dateStr = new Date(startTime).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  if (now >= start && now <= end) {
    return { label: "happening now", isHappening: true, isUpcoming: false, isPast: false };
  }

  if (now < start) {
    const diffMs = start - now;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    let label: string;
    if (diffMin < 1) label = "in less than a minute";
    else if (diffMin < 60) label = `${timeStr} (in ${diffMin} min)`;
    else if (diffHours < 24) label = `${timeStr} (in ${diffHours}h)`;
    else if (diffDays === 1) label = `tomorrow, ${timeStr}`;
    else label = `${dateStr}, ${timeStr}`;

    return { label, isHappening: false, isUpcoming: true, isPast: false };
  }

  // Past
  const diffMs = now - end;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  let label: string;
  if (diffMin < 60) label = `${timeStr} (${diffMin}m ago)`;
  else label = `${timeStr} (${diffHours}h ago)`;

  return { label, isHappening: false, isUpcoming: false, isPast: true };
}
```

Note: Past events beyond 24h are now filtered out by the backend, so we don't need labels for those.

## Files to modify

1. `worker/index.ts` - lines 6, 3966-4025
2. `src/components/ActivityCard.tsx` - lines 45-82
3. `src/pages/FormResponses.tsx` - line 152

## Import changes

`worker/index.ts` line 6: Add `like`, `sql`, `gte`, `inArray` to drizzle-orm imports:
```ts
import { eq, and, desc, like, sql, gte, inArray } from "drizzle-orm";
```
