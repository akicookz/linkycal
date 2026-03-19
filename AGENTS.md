# LinkyCal - Form & Scheduling infrastructure

## Product Overview

LinkyCal is a form and Scheduling infrastructure SaaS. Users create projects, build multi-step forms, set up booking/calendar links, manage contacts with tagging (mini CRM), and automate workflows. Everything is API-first with embeddable widgets.

## Tech Stack

| Layer        | Technology                               |
| ------------ | ---------------------------------------- |
| Runtime      | Bun                                      |
| Frontend     | React 19 SPA, Vite, React Router 7       |
| Styling      | Tailwind CSS v4 + shadcn/ui (customized) |
| Backend      | Hono on Cloudflare Workers               |
| Database     | Cloudflare D1 via Drizzle ORM (SQLite)   |
| Cache        | Cloudflare KV                            |
| File Storage | Cloudflare R2                            |
| Queue        | Cloudflare Queues (workflow execution)   |
| Auth         | Better Auth (Google + Facebook OAuth + Email OTP (5-step onboarding: project, event type, form, branding, plan))      |
| Payments     | Stripe (Free / Pro / Business)           |
| Email        | Resend                                   |
| Validation   | Zod                                      |
| Calendar     | Google Calendar API (per-event-type destination + freeBusy) |
| Widgets      | Self-contained IIFE bundles on R2        |

## Directory Structure

```
app/
├── src/                    # React SPA (dashboard)
│   ├── components/
│   │   ├── ui/             # shadcn/ui base components (squircle theme)
│   │   ├── Layout.tsx      # Main dashboard sidebar layout
│   │   ├── AccountLayout.tsx
│   │   ├── AuthGuard.tsx
│   │   ├── OnboardingGuard.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── Logo.tsx
│   │   └── PageHeader.tsx
│   ├── pages/              # Route-level page components
│   ├── hooks/
│   ├── lib/                # auth-client, query-client, utils
│   ├── main.tsx
│   ├── App.tsx
│   └── index.css           # Tailwind theme tokens
├── worker/                 # Cloudflare Worker API
│   ├── index.ts            # Hono routes + middleware
│   ├── auth.ts             # Better Auth config
│   ├── types.ts            # AppEnv, HonoAppContext, Plan
│   ├── validation.ts       # All Zod schemas
│   └── db/
│       ├── auth.schema.ts  # Better Auth tables
│       ├── schema.ts       # 24 domain tables
│       ├── index.ts
│       └── drizzle/        # SQL migrations
├── widget/                 # Embeddable IIFE widgets (TODO)
│   ├── booking/
│   └── form/
├── wrangler.jsonc
├── vite.config.ts
├── drizzle.config.ts
└── package.json
```

## Code Conventions

### General

- **Bun** as package manager (never npm/yarn)
- **Function declarations** for all named functions and React components
- Arrow functions only for inline callbacks
- `export default` for page/layout components; named exports for everything else
- `import type` for type-only imports

### Naming

- **PascalCase**: Components, types, interfaces, pages
- **camelCase**: Variables, functions, hooks
- **kebab-case**: UI component files, service files
- **PascalCase filenames**: Page components

### Imports

- `@/` alias for `src/` directory
- Order: React, third-party, `@/components/ui/*`, `@/components/*`, `@/lib/*`, relative

### TypeScript

- Strict mode, `verbatimModuleSyntax: true`
- `interface` for object shapes, `type` for unions/compositions and Drizzle row types
- Three tsconfig project references: app, node, worker

### Backend

- Section divider comments: `// ─── Section Name ───`
- One service class per domain in `worker/services/`
- Services accept `DrizzleD1Database` in constructor, instantiated per-request
- All Zod schemas centralized in `worker/validation.ts`
- Generic `validate<T>(schema, data)` helper
- JSON response format: `c.json({ ... })`

### Database Schema

- `text("id").primaryKey()` with `crypto.randomUUID()` for all IDs
- `integer("col", { mode: "timestamp" })` with `.default(sql\`(unixepoch())\`)` for timestamps
- `.$onUpdate(() => new Date())` on all `updatedAt` columns
- Export `FooRow` (select) and `NewFooRow` (insert) types after every table
- Cascade deletes on parent FKs
- Indexes as third argument array to `sqliteTable`

## UI/Branding

| Element       | Value                                                                            |
| ------------- | -------------------------------------------------------------------------------- |
| Font          | Satoshi (loaded from Fontshare)                                                  |
| Primary color | Dark forest green `#1B4332`                                                      |
| CTA style     | Squircle `rounded-[16px]`, `.glow-surface` class                                 |
| Glow effect   | `box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 0 20px rgba(27,67,50,0.25)` |
| Dashboard     | White background, green accents used sparingly                                   |
| Card radius   | `rounded-[20px]`                                                                 |
| Input radius  | `rounded-[12px]`                                                                 |
| Theme         | Light-first design                                                               |

## UI Conventions

### Buttons
- **All buttons must have icon + text** — no icon-only buttons, no text-only buttons
- **Exception**: Cancel/Close buttons in dialogs may be text-only
- **Loading state**: Replace the primary icon with `<Loader2 className="animate-spin" />`, keep the text. Never show both the original icon and the spinner simultaneously.
- **Disabled state**: The icon stays as-is (Tailwind `disabled:opacity-50` handles the visual). Do not swap to a Ban icon unless explicitly needed.
- Use lucide-react icons consistently (e.g., Save, Plus, Trash2, Pencil, ArrowRight, ArrowLeft, etc.)

### Separators
- **Never use borders as visual separators between list rows** — no `<Separator />`, no `divide-y`, no `border-b`, no `border-t` between items in a list
- Use `space-y-*` or `gap-*` for spacing between rows/items instead
- **Structural borders are fine** — page headers, sidebars, layout boundaries, card borders
- **Decorative borders are fine** — mock browser UIs on the landing page

### Lists & Tables
- Use the Dashboard "recent bookings" pattern: avatar circle + flex row + badge, inside a `<Card>`
- No table headers — use clean list layouts
- Expandable rows indent with `pl-14` to align past the avatar

## Commands

```bash
bun run dev              # Start dev server
bun run build            # TypeScript check + Vite build
bun run deploy           # Build + deploy to Cloudflare
bun run db:generate      # Generate Drizzle migration
bun run db:migrate:dev   # Apply migrations locally
bun run db:migrate:prod  # Apply migrations to production
bun run cf-typegen       # Regenerate worker-configuration.d.ts
bun run widget:build     # Build embeddable widgets
bun run deploy:full      # Full deploy (app + widgets + migrations)
```

## Key Features

1. **Multi-step forms** - Visual builder, field types, conditional logic, step-by-step submission
2. **Booking/calendar links** - Event types, availability schedules, Google Calendar sync
3. **Contact management** - Tags, activity timeline, mini CRM
4. **Embeddable widgets** - IIFE bundles for booking and form widgets
5. **Public API** - REST API with API key auth for all operations
6. **Workflows** - Trigger-based automation (form submitted, booking created, etc.)
7. **AI-friendly docs** - OpenAPI spec, llms.txt, markdown docs

## Plan Limits

| Feature          | Free | Pro   | Business  |
| ---------------- | ---- | ----- | --------- |
| Projects         | 1    | 5     | 20        |
| Forms/project    | 3    | 20    | Unlimited |
| Event types      | 3    | 20    | Unlimited |
| Contacts/project | 100  | 5,000 | Unlimited |
| Workflows        | 1    | 10    | Unlimited |
| Calendar sync    | No   | Yes   | Yes       |
| API access       | No   | Yes   | Yes       |
| Custom widgets   | No   | No    | Yes       |
