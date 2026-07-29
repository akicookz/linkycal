# Detailed funnel analytics deployment runbook

This runbook deploys exact booking/form funnel analytics, customer GA4/Meta
Pixel/PostHog integrations, the analytics dashboard, public REST/MCP exposure,
and generated documentation.

Stop before every production mutation unless the release owner has explicitly
authorized that action. Do not use `bun run deploy:full` for this release: it
combines migrations, widget uploads, and the Worker deployment without the
review checkpoints below.

## What changes

- The existing Cloudflare Analytics Engine dataset receives additive columns
  and bounded context. No analytics D1 table or analytics migration is added.
- Existing high-level event names and Analytics Engine blobs 1–13 remain
  compatible.
- The Worker/SPA, booking widget, and form widget must all be released for
  complete direct/widget attribution.
- Provider configuration is stored under the reserved structured project
  settings subtree. It contains public identifiers, not secrets.
- Migration `0033_persist_booking_calendar_identity.sql` is a pre-existing,
  nullable booking-delivery prerequisite. It is not an analytics migration.

## Required release inputs

Set or record these values in the release ticket; do not paste secrets into the
repository:

```text
RELEASE_GIT_SHA=
PREVIOUS_WORKER_VERSION=
NEW_WORKER_VERSION=
PREVIOUS_BOOKING_WIDGET_SHA256=
PREVIOUS_FORM_WIDGET_SHA256=
NEW_BOOKING_WIDGET_SHA256=
NEW_FORM_WIDGET_SHA256=
ANALYTICS_DETAILED_AVAILABLE_SINCE=
FREE_SMOKE_PROJECT_ID=
PRO_SMOKE_PROJECT_ID=
PRO_EVENT_TYPE_SLUG=
PRO_FORM_SLUG=
```

Use dedicated smoke projects/resources. Do not use a customer project.

## 1. Preflight and record current versions

From the exact reviewed release commit:

```bash
git status --short --branch
git rev-parse HEAD
bun --version
bunx wrangler --version
bunx wrangler versions list
```

Download the currently published widget objects before overwriting them and
record their checksums in the release ticket:

```bash
mkdir -p .release-backup/detailed-funnel-analytics
bunx wrangler r2 object get linkycal-uploads/widgets/booking.js \
  --file .release-backup/detailed-funnel-analytics/booking.previous.js \
  --remote
bunx wrangler r2 object get linkycal-uploads/widgets/form.js \
  --file .release-backup/detailed-funnel-analytics/form.previous.js \
  --remote
shasum -a 256 .release-backup/detailed-funnel-analytics/booking.previous.js
shasum -a 256 .release-backup/detailed-funnel-analytics/form.previous.js
```

Build the candidate widgets locally and record candidate checksums:

```bash
bun run widget:build
shasum -a 256 dist-widget/booking-widget.js
shasum -a 256 dist-widget/form-widget.js
```

Keep `.release-backup/` untracked and out of commits.

## 2. Inspect production D1 migrations

Run the exact preflight command:

```bash
wrangler d1 migrations list DB --remote
```

Review every pending filename and its SQL locally. The only known prerequisite
for this release is:

```text
0033_persist_booking_calendar_identity.sql
```

Its reviewed SQL adds nullable `gcal_ical_uid` and `gcal_organizer_email`
columns to `bookings`.

- If nothing is pending, do not run a migration command.
- If only `0033_persist_booking_calendar_identity.sql` is pending, obtain
  explicit production-migration authorization, then run:

  ```bash
  bun run db:migrate:prod
  ```

- If any other migration is pending, stop. Review it separately and update the
  release scope before applying anything.

After an authorized migration, rerun:

```bash
wrangler d1 migrations list DB --remote
```

Record the output. Do not continue if 0033 failed or remains partially applied.

## 3. Final local release gate

Run from a clean checkout of the release commit:

```bash
bun test
bun run lint
bun run docs:generate
bun run docs:check
bun run widget:build
bun run build
git diff --check
git status --short --branch
```

`docs:generate` must leave no diff. Verify the final review covers:

- no D1 analytics migration;
- no raw script, arbitrary URL, provider secret, answer, email, name, IP, or
  raw-error field in telemetry/report/provider contracts;
- Analytics Engine blobs 1–13 unchanged;
- five analytics MCP tools and six analytics management REST routes;
- anonymous `POST /api/v1/t` single/batch maximum of 20;
- focused forms still persist every rendered step response when analytics
  delivery fails; and
- both widget IIFE bundles exist.

## 4. Deploy Worker and SPA

This is the first release mutation after any approved prerequisite migration.
Obtain explicit Worker deployment authorization, then run:

```bash
bun run deploy
```

Record the new Worker version from the deploy output and confirm it:

```bash
bunx wrangler versions list
```

Do not upload widgets yet. First verify the Worker health endpoint, dashboard
load, session authentication, and one read-only project request.

## 5. Deploy both widgets

After the Worker/SPA is healthy, obtain explicit widget-upload authorization:

```bash
bun run widget:deploy
```

Download the deployed objects again and compare them with the candidate
checksums:

```bash
bunx wrangler r2 object get linkycal-uploads/widgets/booking.js \
  --file .release-backup/detailed-funnel-analytics/booking.deployed.js \
  --remote
bunx wrangler r2 object get linkycal-uploads/widgets/form.js \
  --file .release-backup/detailed-funnel-analytics/form.deployed.js \
  --remote
shasum -a 256 .release-backup/detailed-funnel-analytics/booking.deployed.js
shasum -a 256 .release-backup/detailed-funnel-analytics/form.deployed.js
```

## 6. Verify generated public documentation

```bash
curl -fsS https://linkycal.com/openapi.json -o /tmp/linkycal-openapi.json
curl -fsS https://linkycal.com/llms.txt -o /tmp/linkycal-llms.txt
```

Confirm the live documents contain:

- all six `/analytics` management routes;
- the detailed stage/context schemas and custom date/source/device filters;
- `POST /api/v1/t` one-or-20 event request;
- the five analytics MCP tools and computed count of 40;
- Pro/Business entitlement and project-scope behavior; and
- the explicit privacy exclusions.

Load `/docs` and verify the REST catalog and MCP tool inventory match the
generated artifacts.

## 7. Free-plan smoke checks

Use a Free smoke project and both a dashboard session and its API key where
available:

1. The Analytics dashboard stays locked and offers an icon-plus-text upgrade
   action.
2. Analytics reports and integration collection/mutation return the expected
   entitlement denial; no provider configuration is mutated.
3. Public event type and form configuration contains
   `analyticsIntegrations: []`, even if structured settings were retained from
   a previous paid plan.
4. Direct and widget booking/form flows still render, persist/submit, and
   complete without customer provider scripts.
5. MCP analytics calls return the same entitlement denial and never accept a
   caller-supplied `projectId`.

## 8. Pro-plan direct and widget smoke checks

Use dedicated Pro event type/form resources:

1. Direct booking: view the page, choose a date, inspect availability, choose a
   time, visit details/attached-form stages, and create one test booking.
2. Widget booking: repeat through the deployed booking widget and confirm its
   iframe carries one shared journey attributed as `source=widget`.
3. Direct focused form: complete every visible step and confirm every step
   response persists before final completion.
4. Widget form: repeat through the deployed form widget and confirm one
   `source=widget` journey.
5. Deliberately trigger a safe validation failure and, on a dedicated slot,
   a slot-unavailable failure; confirm only safe categories appear.
6. In the dashboard select the exact event type/form. Confirm rendered stages,
   attached-form stages, skips, continuation/drop-offs, dates, availability
   outcomes, offered/selected local times, source/device filters, and custom
   inclusive dates.
7. Confirm the all-resources view still shows the old high-level totals.

For REST, use a project-scoped API key:

```bash
curl -fsS \
  -H "Authorization: Bearer $LINKYCAL_PRO_SMOKE_API_KEY" \
  "https://linkycal.com/api/projects/$PRO_SMOKE_PROJECT_ID/analytics/bookings?period=7d&resourceSlug=$PRO_EVENT_TYPE_SLUG"

curl -fsS \
  -H "Authorization: Bearer $LINKYCAL_PRO_SMOKE_API_KEY" \
  "https://linkycal.com/api/projects/$PRO_SMOKE_PROJECT_ID/analytics/forms?period=7d&resourceSlug=$PRO_FORM_SLUG&source=widget"
```

Confirm the response is aggregate and contains no journey ID, name, email, raw
answer, IP address, or raw error.

For MCP, initialize a project-scoped connection and call:

```text
get_analytics_overview
get_booking_funnel_analytics { eventTypeId, period: "7d" }
get_form_funnel_analytics { formId, period: "7d", source: "widget" }
list_analytics_integrations
```

REST and MCP report bodies should match for equivalent filters.

## 9. Provider smoke checks

Configure one dedicated test identifier per provider in Project Settings and
repeat through the public direct and widget flows:

- GA4 loads the fixed Google tag URL and receives namespaced LinkyCal events.
- Meta Pixel loads the fixed Meta script and receives custom events, plus
  `Schedule` for booking success and `Lead` for form success.
- PostHog uses a named customer instance and only the allowlisted US or EU host.
- A failure in one provider does not block LinkyCal telemetry, another
  provider, form checkpoint persistence, or booking creation.
- Browser requests contain stable keys/kinds/orders and safe numeric/context
  fields, but no stage label, name, email, answer, note, filename, journey ID,
  IP address, or raw error.
- Disabling a provider stops publication while retaining its validated public
  identifier for later re-enabling.

Attempt invalid IDs, an arbitrary PostHog host, and a raw script-shaped field
against the dedicated smoke project. Each must be rejected without changing
the saved integration.

## 10. Record the detailed-ingestion boundary

Analytics Engine is eventually consistent. After direct and widget events
appear, record the earliest `availableSince` returned by the selected booking
and form reports:

```text
ANALYTICS_DETAILED_AVAILABLE_SINCE=<earliest observed ISO timestamp>
```

The dashboard must show “Detailed step tracking began …”. Do not backfill or
reinterpret earlier high-level events as detailed zeroes.

## Rollback

Rollback is intentionally non-destructive.

1. Stop provider publication first:
   - disable the three providers on dedicated/affected projects through the
     validated integration route, which retains their identifiers; or
   - if publication itself is unsafe globally, deploy a minimal reviewed
     Worker hotfix that makes `getPublished` return an empty list.
2. Restore the previous widget objects captured in step 1:

   ```bash
   bunx wrangler r2 object put linkycal-uploads/widgets/booking.js \
     --file .release-backup/detailed-funnel-analytics/booking.previous.js \
     --content-type application/javascript \
     --cache-control "public, max-age=300, must-revalidate" \
     --remote
   bunx wrangler r2 object put linkycal-uploads/widgets/form.js \
     --file .release-backup/detailed-funnel-analytics/form.previous.js \
     --content-type application/javascript \
     --cache-control "public, max-age=300, must-revalidate" \
     --remote
   ```

3. Roll the Worker back to `PREVIOUS_WORKER_VERSION` using Cloudflare Workers
   Versions after explicit authorization. Record the rollback version and
   deployment output.
4. Re-run the Free/Pro direct/widget health checks against the rolled-back
   Worker and restored widgets.
5. Retain additive Analytics Engine rows and structured provider settings.
   Older Workers ignore them.
6. Do not roll back migration
   `0033_persist_booking_calendar_identity.sql`. Its columns are nullable and
   preserve booking-delivery identity; removing them is destructive and
   unrelated to analytics rollback.

If rollback is caused by incorrect analytics, preserve the rows for diagnosis
but keep the affected provider publication disabled until the sanitized
payload and report contract are re-verified.
