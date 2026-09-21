---
title: "Best Form Backend Services for Static and Jamstack Sites in 2026"
description: "Compare the best form backend services for static and Jamstack sites in 2026 — spam protection, webhooks, free submission limits, and how to connect HTML forms."
date: "2026-09-21"
author: LinkyCal team
slug: best-form-backend-services
category: Forms
draft: false
encitedRunId: 7b251b34-e2c6-4bc0-b99a-8b71fa7628d3
status: publish
---

Static sites do not have backends. To capture a clean lead, you usually have to stitch together serverless functions, database tables, and SMTP credentials from scratch. A form backend takes over that plumbing: a spam-protected HTTP endpoint, storage, notifications, and a way to fire webhooks or workflows after submit.

This guide is about that job. If you need a visual, shareable hosted form instead of your own markup, see [the best form builders in 2026](/blog/best-online-form-builder). Scheduling and booking APIs are a [separate product surface](/features/scheduling) — we mention them only as an optional handoff, not as the reason to pick an endpoint.

Your setup might be an Astro landing page or a multi-step Next.js lead funnel. The endpoint you pick decides how smoothly you can validate inputs and trigger automations. Here is how the top form backend services in 2026 stack up on integrations, spam protection, feature depth, and pricing.

---

## Why static sites need a dedicated form backend

Static site generators build fast, reliable frontends. Frameworks like Next.js, Nuxt, Astro, Hugo, 11ty, and Gatsby compile source files into pre-rendered HTML, CSS, and client-side JavaScript. Because these setups run without an active application server or a persistent database, they cannot accept incoming HTTP `POST` requests on their own. They have no built-in way to parse multipart payloads, ping transactional email providers, or store incoming customer records. A form backend solves this by exposing a dedicated HTTP endpoint URL configured to receive, validate, process, and retain form data.

```
+------------------------+             POST Request              +----------------------------+
|  Static / Jamstack     | ------------------------------------> |  Headless Form Backend     |
|  Frontend (HTML/React) |                                       |  - Spam Filtering          |
+------------------------+                                       |  - Validation & Storage    |
                                                                 |  - Contact Enrichment      |
                                                                 +----------------------------+
                                                                               |
                                      +----------------------------------------+---------------------------------------+
                                      |                                        |                                       |
                                      v                                        v                                       v
                           +----------------------+               +--------------------------+            +-------------------------+
                           | Transactional Email  |               | Downstream Webhooks      |            | Workflows & lite CRM   |
                           | & Notifications      |               | (Slack, Sheets, CRMs)    |            | (LinkyCal)             |
                           +----------------------+               +--------------------------+            +-------------------------+
```

Without an external backend, your team has to wire up custom serverless functions on AWS Lambda or Cloudflare Workers, connect email APIs like SendGrid or AWS SES, spin up storage, and write bot filters. That work drains engineering capacity. A dedicated backend consolidates that entire maintenance burden into a single target URL.

LinkyCal delivers this as a headless form backend. We provide REST APIs, embeddable widgets, hosted forms, custom CSS on paid plans, Model Context Protocol (MCP) access for AI agents, contact enrichment, automated spam filtering, email alerts, a lite CRM, and clean CSV/JSON exports. You keep complete ownership over your frontend markup and styling. Other tools tackle specialized slices of this pipeline. Formspree and Basin offer HTML and AJAX endpoints to capture payloads and trigger notifications, while services like Static Forms accept static HTML submissions via endpoints like `https://api.staticforms.dev/submit` to sidestep backend server setup entirely.

### What happens during HTML and AJAX POST submissions

Modern endpoints accept incoming submissions through two distinct mechanisms: standard synchronous HTML form actions and asynchronous AJAX `fetch` requests.

1. **Synchronous HTML Form Submissions:**
   In pure HTML setups, your form `action` attribute points straight to the backend URL with `method="POST"`.
   - The browser bundles input values into an `application/x-www-form-urlencoded` or `multipart/form-data` payload.
   - It triggers a standard full-page HTTP POST navigation to the endpoint.
   - The backend absorbs the request, applies spam heuristics, runs validation checks, writes the entry to storage, and issues an HTTP 302/303 redirect sending the visitor to a custom `thank-you.html` URL supplied in a hidden input field.

2. **Asynchronous AJAX / Fetch Submissions:**
   Single-page apps and modern Jamstack setups built on React, Vue, or Svelte hand off submissions through the JavaScript Fetch API instead.
   - The client captures the `onSubmit` event, runs schema checks with libraries like Zod, and formats field values into an `application/json` payload.
   - The browser sends an asynchronous `POST` request to the endpoint alongside an `Accept: application/json` header.
   - The headless backend replies with structured JSON such as `{ "success": true, "submissionId": "..." }` paired with standard HTTP codes like `200 OK`, `400 Bad Request`, or `429 Too Many Requests`.
   - The frontend updates its UI state dynamically, showing inline validation notices or confirmation screens without a full browser refresh.

Once data hits the backend, the system sanitizes every field against injection attacks, runs server-side validation, checks bot signals, logs the record in dashboard storage, and fires off real-time webhooks or transactional notification emails.

## Which form backend is the best option for static and Jamstack sites in 2026?

Picking a form backend comes down to what you actually need under the hood. Some architectures only call for a basic pipe to forward raw POST payloads. Others require lead intake, contact enrichment, and native workflows running inside a unified pipeline.

```
+----------------------------------------------------------------------------------------------------+
|                                    FORM BACKEND SELECTION MATRIX                                   |
+---------------------+-------------------------------+----------------------------------------------+
| Architecture Need   | Primary Focus                 | Recommended Backend Solution                 |
+---------------------+-------------------------------+----------------------------------------------+
| Lead Capture +      | Spam-protected endpoint,      | LinkyCal                                     |
| workflows & APIs    | enrichment, MCP, lite CRM     | (HTML action, API, embed, custom CSS)        |
+---------------------+-------------------------------+----------------------------------------------+
| Pure Form Endpoints | Simple HTML/AJAX endpoint     | FormBackend, Basin, Static Forms,            |
| (inbox + webhooks)  | capture with third-party webhooks | Getform, Formspree, Web3Forms            |
+---------------------+-------------------------------+----------------------------------------------+
```

### What LinkyCal does differently

We built LinkyCal so a custom frontend can POST to one endpoint and get spam filtering, storage, email, and workflows without standing up Lambda, SES, and a spreadsheet glue layer.

LinkyCal provides API-first infrastructure for form collection:

- **Four connection methods:** Point a native HTML form at an **action URL**, send JSON through the **REST API**, **embed** a widget, or keep your own markup and apply **custom CSS** on paid plans when you want tighter brand control.
- **Agent paste setup:** Copy the agent instructions from the dashboard and paste them into Claude, Cursor, Lovable, ChatGPT, or another coding agent so it can wire the action URL, embed, or API for you. MCP is available when the agent should keep talking to the project after the first paste.
- **Developer-first access (REST & MCP):** Full REST APIs cover automated intake and data retrieval, while Model Context Protocol (MCP) support lets autonomous AI agents query submissions without hand-rolled wrappers.
- **Built-in spam, email, workflows, and lite CRM:** Inbound leads get filtered, stored as contacts, routed through conditional workflow triggers, and pushed to your inbox. You are not forced to duct-tape a form inbox to a separate CRM and a Zap for the common path.
- **Data portability:** Export your records anytime through clean CSV and JSON downloads.

If a completed intake should become a booked call, LinkyCal can cover that handoff in the [scheduling](/features/scheduling) product. For this keyword, treat booking as an optional next step — pick the backend on endpoint quality first.

Pricing stays straightforward. The **Free tier is $0/month with 500 submissions per month**. **Pro is $29/month** (10,000 responses) and **Business is $99/month** (50,000 responses).

### Standalone form endpoint alternatives

If your static site only needs payload collection without a lite CRM or native workflows, several hosted backends get the job done:

- **Formspree:** A veteran in this space that handles standard HTML endpoints, autoresponders, email dispatch, team projects, and webhook relays. It includes a limited free tier (50 submissions / month), while locking custom branding, longer data retention, and team permissions behind paid accounts. Personal starts at $15/month for 200 submissions.
- **Basin:** Built with developers in mind, Basin accepts HTML and AJAX submissions alongside honeypots, Cloudflare Turnstile, reCAPTCHA, custom spam rules, CSV downloads, webhooks, and Zapier feeds. The free tier is 50 submissions / month. Starter is $12.50/month when billed annually for 250 submissions.
- **Static Forms:** Built purely for static markup, this service ingests payloads at `https://api.staticforms.dev/submit` authenticated with an API key. Its free tier covers 500 emails/month, backed by Pro ($9/month) and Agency ($19/month) plans with IP masking, GDPR tooling, and integrations for Slack, Google Sheets, and custom webhooks.
- **FormBackend:** Sets up in under sixty seconds without requiring a credit card, bundling spam filtering, file uploads, email alerts, and outbound pipes to Slack, Google Sheets, Airtable, Discord, Notion, Twilio, and Zendesk. Plans start with a free tier before moving to a $5/month base plan for 1,000 submissions.
- **Getform (now Forminit):** Offers hosted forms, embedded components, webhook triggers, and connectors for CRMs and Google Sheets. Forminit's free plan includes 100 submissions / month; Pro is $19/month when billed annually for 5,000. Endpoints can pause when monthly quotas run out.
- **Web3Forms:** A minimal form API designed for Jamstack sites, routing submissions straight to email and webhooks via simple access keys. The free tier covers 250 submissions / month.

| Provider | Starting Price | Free Tier Allowance | AI Agent Access (MCP) | Primary Integrations |
| :--- | :--- | :--- | :--- | :--- |
| **LinkyCal** | $0/mo (Free), $29/mo (Pro), $99/mo (Business) | 500 submissions/month | Supported (MCP & REST) | Workflows, email, lite CRM, REST API, JSON/CSV export |
| **FormBackend** | $5/mo (1k submissions) | Available (start for free) | None | Slack, Sheets, webhooks, Zapier, Airtable, Notion |
| **Static Forms** | $9/mo ($90/yr) | 500 emails/mo (no files) | None | Webhooks, Slack, Sheets, Notion, Airtable, Zapier |
| **Basin** | $12.50/mo billed yearly (Starter, 250 submissions) | 50 submissions/month | None | Webhooks, Zapier, CSV export, Turnstile |
| **Getform / Forminit** | $19/mo billed yearly (Pro, 5,000 submissions) | 100 submissions/month | None | Hosted/embedded, webhooks, Zapier, Sheets, CRMs |
| **Formspree** | $15/mo (Personal, 200 submissions) | 50 submissions/month | None | Webhooks, email, team projects, autoresponders |
| **Web3Forms** | Check current paid pricing | 250 submissions/month | None | Direct form API, email delivery, webhooks |

### Where basic builders and free scripts struggle

Teams building custom Jamstack products usually test out simple workarounds like Google Forms, FormSubmit, or visual form builders before committing to a headless backend.

- **Google Forms:** Free, but clunky. You are stuck embedding sluggish `<iframe>` boxes that clash with your CSS, break client-side validation, ruin mobile views, and load third-party trackers.
- **FormSubmit:** It lets you POST directly to an email inbox without an account, but you must click email confirmation links before it starts forwarding. It lacks granular API controls, skips workflow automations, and introduces real reliability risks for critical revenue funnels.
- **Traditional form builders:** Drag-and-drop visual builders cater to standalone landing pages rather than custom codebases. They rarely supply raw REST endpoints and cannot match the zero-bundle footprint of native React or HTML forms. If you actually want that visual shareable form, use the [builder roundup](/blog/best-online-form-builder) instead of forcing a builder into an endpoint-shaped hole.

## Pricing tiers and free limits across form backends

Form backends structure their plans differently. Some shut down live endpoints the second you hit a monthly cap, while others bill for overages or reserve developer tooling like webhooks and file attachments for top-tier plans.

```
+----------------------------------------------------------------------------------------------------+
|                                    PRICING & LIMIT ARCHITECTURES                                   |
+--------------------+---------------------+---------------------------------------------------------+
| Platform           | Entry Paid Price    | Free Tier & Submission Mechanics                        |
+--------------------+---------------------+---------------------------------------------------------+
| LinkyCal           | $29/month (Pro)     | 500 submissions/month on Free ($0/mo)                   |
| Static Forms       | $9/month (Pro)      | 500 emails/mo free (no files); Pro has 2GB storage       |
| FormBackend        | $5/month (1k subs)  | Free tier available; 1,000 submissions on $5/mo plan    |
| Basin              | $12.50/mo yearly    | 50 free; Starter is 250 submissions billed annually     |
| Getform / Forminit | $19/mo yearly       | 100 free; Pro is 5,000 submissions billed annually      |
| Formspree          | $15/month Personal  | 50 free; 200 submissions on Personal                    |
| Web3Forms          | Check current price | 250 submissions/month on free                           |
+--------------------+---------------------+---------------------------------------------------------+
```

### Free tier limits compared

Free tiers work well for testing staging environments, hobby builds, and docs feedback widgets:

1. **LinkyCal:** The self-serve **Free plan ($0/month)** includes **500 form submissions per month**, headless actions, API submissions, embeds, spam filtering, email notifications, workflows, and the lite CRM. Scale into Pro ($29/month) or Business ($99/month) when volume or custom CSS and analytics matter.
2. **Static Forms:** You get a **free tier of 500 emails per month**. It handles basic forwarding and simple dashboard views, but file storage is excluded and third-party routing requires a paid subscription.
3. **FormBackend:** Their credit-card-free **free tier** lets teams verify endpoints before moving to the $5/month plan for 1,000 monthly submissions.
4. **Basin:** A **50-submission free plan** covers raw HTML/AJAX capture, backed by clear overage billing when you outgrow monthly thresholds.
5. **Getform / Forminit:** Hard limits govern the **free entry tier** (100 submissions / month). If your endpoint hits the monthly ceiling, incoming data can pause until you upgrade or enter the next billing cycle.

### Formspree monthly costs

Formspree places features like team workspaces, file storage, autoresponders, and unbranded confirmation screens behind paid plans. Their free tier works fine for basic contact forms with low volume (50 submissions / month). Upgrading starts at **$15/month (Personal)** for 200 submissions. Those monthly plans raise submission limits, enable custom redirect URLs without third-party badges, permit file uploads, and grant role-based permissions across your engineering team. Professional is $30/month for 2,000 submissions.

### Web3Forms monthly pricing

Web3Forms focuses on API key endpoints paired with straightforward email delivery. Basic contact handling is free at **250 submissions per month**. If you need bigger file attachments, higher monthly caps, and custom webhooks, check the live [Web3Forms pricing](https://web3forms.com/#pricing) page rather than relying on a cached dollar figure.

## Filtering out spam without making users solve puzzles

Bots hit static endpoints constantly. They scrape code, blast junk data into inputs, and push malicious payloads around the clock. At the same time, solving fuzzy image puzzles ruins conversion rates for genuine prospects. Headless form backends resolve this tension by running silent checks in the background.

```
Incoming Form Submission
           │
           ▼
┌──────────────────────────────────────┐
│  Layer 1: Domain Restriction Check   │ ──► [Mismatch] ──► Block Request (403)
└──────────────────────────────────────┘
           │ [Pass]
           ▼
┌──────────────────────────────────────┐
│  Layer 2: CSS / JS Honeypot Fields   │ ──► [Field Filled] ──► Silent Drop / 200 OK
└──────────────────────────────────────┘
           │ [Pass]
           ▼
┌──────────────────────────────────────┐
│  Layer 3: Cryptographic / Heuristics │ ──► [Failed Token] ──► Block Request (400)
│  (Cloudflare Turnstile / reCAPTCHA)  │
└──────────────────────────────────────┘
           │ [Pass]
           ▼
┌──────────────────────────────────────┐
│  Layer 4: Server-Side Ingestion      │
│  - Storage & Contact Enrichment      │
│  - Webhook & Workflow Dispatch       │
└──────────────────────────────────────┘
```

LinkyCal runs automated spam filtering directly on the backend (honeypot-style checks and per-IP rate limits). We screen every incoming payload before firing off notifications or pushing leads to your downstream tools. Third-party verification widgets stay optional.

### Five ways modern backends catch bots

Form services stack several client and server checks together to filter junk payloads:

1. **Honeypot Fields:**
   You add a hidden input named `_gotcha` or `website` into the markup and hide it from human eyes with CSS like `display: none;` or `opacity: 0; position: absolute;`. Simple bots blindly crawl the DOM and fill out every field they find. If the backend sees text inside that trap input, it drops the entry or flags it immediately. Static Forms, Basin, and FormBackend provide native honeypot support.

2. **Domain Restrictions (CORS / Referrer Whitelisting):**
   Endpoints check incoming `Origin` and `Referer` headers on every POST request. Submissions sent from unlisted websites or raw terminal `curl` scripts get dropped with an error. Static Forms includes domain restriction settings to keep outside sites from burning through your endpoint API key.

3. **Cloudflare Turnstile & hCaptcha:**
   Turnstile skips visual puzzles entirely. It runs invisible browser evaluations, checking cryptographic proofs and device telemetry silently in the background while people fill out their information. Both Static Forms and Basin support Cloudflare Turnstile and hCaptcha tokens sent along with form payloads.

4. **Google reCAPTCHA v2 / v3:**
   Version 3 gives each submission a risk score between 0.0 and 1.0 based on visitor behavior. Backends verify the client token against Google's API and throw away any request failing the score cutoff. Static Forms and Basin support reCAPTCHA v2 and v3 token validation.

5. **Proof-of-Work Verification (ALTCHA):**
   ALTCHA makes the visitor's browser solve a small proof-of-work math puzzle locally without tracking cookies or storing personal user profiles. Static Forms natively integrates ALTCHA verification.

## Can you forward static form submissions directly to Google Sheets, webhooks, or automation tools?

Nobody wants isolated data. The second an inbound payload passes validation and clears spam filters, your backend needs to kick that clean data out to spreadsheets, marketing platforms, and internal databases.

```
                               ┌───────────────────────────┐
                               │  LinkyCal Headless API    │
                               └─────────────┬─────────────┘
                                             │
                   ┌─────────────────────────┼─────────────────────────┐
                   │                         │                         │
                   ▼                         ▼                         ▼
        ┌────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
        │ Automated Workflows│    │  Model Context     │    │  Real-Time         │
        │ Email & lite CRM   │    │  Protocol (MCP)    │    │  Webhooks & APIs   │
        └──────────┬─────────┘    └──────────┬─────────┘    └──────────┬─────────┘
                   │                         │                         │
                   ▼                         ▼                         ▼
        ┌────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
        │ Inbound leads &    │    │ AI agent querying  │    │ Google Sheets,     │
        │ tagged contacts    │    │ & automation       │    │ CRMs, JSON exports │
        └────────────────────┘    └────────────────────┘    └────────────────────┘
```

Modern form backends distribute inbound entries through a few common pathways:

- **Webhooks:** The platform fires an HTTP `POST` payload containing the raw submission to your designated URL, feeding right into Zapier, Make, n8n, or a custom API gateway.
- **Direct SaaS Integrations:** FormBackend provides native connectors for Slack, Google Sheets, Airtable, Discord, Notion, MailChimp, ConvertKit, Twilio, and Zendesk. Static Forms supports direct routing to webhooks, Slack, Google Sheets, Notion, Airtable, and Mailchimp on paid plans.
- **Data Export:** Static Forms, Basin, and LinkyCal let you run manual or scheduled CSV and JSON data exports for spreadsheet audits and clean migrations.

### Form automation workflows, REST APIs, and MCP access for AI agents

LinkyCal treats form handling as an active pipeline rather than a static inbox:

1. **Automated workflows, email, and contact enrichment:** When someone submits a form, the backend can enrich the contact record, fire off transactional email notifications, and evaluate conditional workflow steps instantly.
2. **REST API ingestion and extraction:** Product engineers can query submission logs, manage dynamic form schemas, and update contact state programmatically over standard HTTPS endpoints.
3. **Model Context Protocol (MCP) access:** Alongside REST, LinkyCal exposes a native MCP server interface. AI agents running in environments like Claude, Cursor, or ChatGPT can safely read inbound entries and trigger downstream tasks without requiring hand-rolled integration wrappers.

---

## Form setups for HTML and React

Hooking your frontend markup to an endpoint takes five minutes. You do not need complicated infrastructure to capture incoming inquiries, so here is how to handle submissions using plain markup or a component framework.

The fastest path for many teams is **agent paste setup**: copy the agent instructions from the LinkyCal dashboard and paste them into your website builder or coding agent so it can wire the action URL, embed snippet, or API client. Use that when you already have an agent in the loop. Otherwise start with a plain HTML `action` URL.

### Wiring up plain HTML forms

Point your form's `action` attribute at the target URL and set the method to `POST`. Browsers bundle the payload natively, and a hidden honeypot traps basic bots before submissions reach your team.

#### Standard HTML implementation

```html
<!-- Example: Standard HTML Form with Honeypot Field -->
<form
  action="https://linkycal.com/api/public/forms/YOUR_PROJECT/YOUR_FORM/submit"
  method="POST"
  enctype="multipart/form-data"
>
  <!-- Optional: Static Forms uses https://api.staticforms.dev/submit with an apiKey input -->
  <!-- <input type="hidden" name="apiKey" value="YOUR_STATIC_FORMS_API_KEY"> -->

  <!-- Anti-Spam Honeypot Field (Hidden from humans) -->
  <input
    type="text"
    name="_gotcha"
    style="display:none !important;"
    tabindex="-1"
    autocomplete="off"
  />

  <!-- Form Fields — use the field IDs from your LinkyCal form -->
  <div>
    <label for="name">Full Name</label>
    <input type="text" id="name" name="FIELD_ID_FOR_NAME" required placeholder="Alex Mercer" />
  </div>

  <div>
    <label for="email">Work Email</label>
    <input type="email" id="email" name="FIELD_ID_FOR_EMAIL" required placeholder="alex@company.com" />
  </div>

  <div>
    <label for="companySize">Company Size</label>
    <select id="companySize" name="FIELD_ID_FOR_COMPANY_SIZE">
      <option value="1-10">1-10 employees</option>
      <option value="11-50">11-50 employees</option>
      <option value="51-200">51-200 employees</option>
      <option value="201+">201+ employees</option>
    </select>
  </div>

  <div>
    <label for="message">Project Requirements</label>
    <textarea id="message" name="FIELD_ID_FOR_MESSAGE" rows="4" required></textarea>
  </div>

  <button type="submit">Submit Request</button>
</form>
```

### Handling submissions in React and Next.js

Single-page setups need asynchronous requests to avoid full page refreshes. LinkyCal's public API creates a response first, then accepts field values for each step. A `fetch` call inside your submit handler lets you manage loading states and render inline confirmation screens immediately.

#### React and Next.js component

```tsx
import { useState, type FormEvent } from "react";

const responsesUrl =
  "https://linkycal.com/api/public/forms/YOUR_PROJECT/YOUR_FORM/responses";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (honeypot) {
      setStatus("success");
      return;
    }

    setStatus("loading");
    setErrorMessage("");

    try {
      const start = await fetch(responsesUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ metadata: { source: "website" } }),
      });
      if (!start.ok) {
        throw new Error(`Could not start response: ${start.status}`);
      }
      const { response } = await start.json();

      const complete = await fetch(`${responsesUrl}/${response.id}/steps/0`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          fields: [
            { fieldId: "FIELD_ID_FOR_NAME", value: name },
            { fieldId: "FIELD_ID_FOR_EMAIL", value: email },
            { fieldId: "FIELD_ID_FOR_MESSAGE", value: message },
          ],
          complete: true,
        }),
      });
      if (!complete.ok) {
        throw new Error(`Could not complete response: ${complete.status}`);
      }

      setStatus("success");
      setName("");
      setEmail("");
      setMessage("");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "An unexpected error occurred. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div>
        <h3>Submission received</h3>
        <p>Thank you. Our team will review your message and reach out shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        name="_gotcha"
        value={honeypot}
        onChange={(event) => setHoneypot(event.target.value)}
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
      />

      <label htmlFor="name">Name</label>
      <input id="name" name="name" required value={name} onChange={(event) => setName(event.target.value)} />

      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />

      <label htmlFor="message">Message</label>
      <textarea id="message" name="message" rows={4} required value={message} onChange={(event) => setMessage(event.target.value)} />

      {status === "error" ? <p>{errorMessage}</p> : null}

      <button type="submit" disabled={status === "loading"}>
        {status === "loading" ? "Sending..." : "Send Message"}
      </button>
    </form>
  );
}
```

Use the actual field IDs from your LinkyCal form. See the [form endpoint docs](/docs) for the current public routes, embeds, and MCP setup.

## Hosted form backend or a custom self-hosted endpoint?

Engineering teams evaluate this tradeoff regularly. You can either use a specialized service or wire together AWS Lambda, API Gateway, DynamoDB, and Amazon Simple Email Service (SES) by hand.

```
+----------------------------------------------------------------------------------------------------+
|                                HOSTED BACKEND VS. CUSTOM SERVERLESS                                |
+-------------------------------+----------------------------------+---------------------------------+
| Evaluation Criteria           | Dedicated Hosted Backend         | Custom AWS Lambda + SES Stack   |
+-------------------------------+----------------------------------+---------------------------------+
| Initial Setup Time            | < 5 minutes                      | 1 to 3 days                     |
| Maintenance & Patches         | Zero maintenance                 | Ongoing SDK/Node/AWS updates    |
| Spam Defense Architecture     | Built-in honeypots, heuristics   | Must code custom bot logic      |
| Deliverability Infrastructure | Managed DKIM/SPF & IP monitoring | Must manage SES reputation      |
| Regulatory & Compliance       | Built-in GDPR tools, DPAs        | Full custom legal/security audit|
| Workflows / lite CRM          | Native in LinkyCal               | Custom CRM and routing buildout |
+-------------------------------+----------------------------------+---------------------------------+
```

### What developers on Reddit say about Lambda and SES

In developer discussions across `r/webdev`, `r/nextjs`, and `r/jamstack`, engineers usually frame this decision around opportunity cost rather than raw infrastructure bills:

1. **The hidden maintenance overhead:**
   Lambda and SES cost pennies per execution. However, writing Terraform templates, debugging CORS headers, parsing multipart payloads, sanitizing inputs, and monitoring deliverability burns hours of engineering time that should belong to your core product.

2. **Spam mitigation and email deliverability:**
   Bots target unprotected endpoints immediately. Connecting an unshielded function directly to SES invites spammers to abuse your mailer within days, ruining your domain reputation until AWS suspends your sending privileges unless you hand-roll Turnstile checks, honeypots, and custom reputation filters.

3. **Compliance and privacy:**
   Services like Static Forms supply ready-made Data Processing Agreements (DPAs), IP anonymization, and GDPR deletion controls. Roll your own stack, and every deletion routine, audit log, and encryption layer falls entirely on your engineers.

4. **Speed of deployment:**
   FormBackend lets you go live in under a minute without a credit card, having handled over 6 million submissions across 7,600+ forms. LinkyCal takes that same zero-backend approach so teams can launch contact endpoints immediately — including agent paste setup when an AI coding tool is already writing the page.

---

## Picking the right form backend for your stack

Evaluate your 2026 project against four practical technical criteria before locking in a provider:

1. **Inbox vs. workflows and CRM:**
   When your app needs a spam-protected endpoint plus contacts, email, and automation in one place, LinkyCal bundles HTML action URLs, REST APIs, embeds, custom CSS, and MCP access across Free ($0/mo, 500 submissions/month), Pro ($29/mo), and Business ($99/mo) plans. Booking is optional and lives on the [scheduling](/features/scheduling) side if a form should become a call.
2. **Simple static site processing:**
   When your static site only needs basic payload forwarding, tools like Static Forms (500 emails/mo free, $9/mo Pro) or FormBackend ($5/mo for 1,000 submissions) provide rapid HTML and AJAX setup with native spam filters and webhook routing.
3. **Spam protection and validation needs:**
   Your endpoint should run non-intrusive defenses like honeypots, domain origin checks, or Cloudflare Turnstile to keep junk out without adding friction for real users.
4. **Third-party ecosystem and agent integration:**
   Look for structured JSON delivery that feeds your downstream stack cleanly through webhooks, direct SaaS connectors, automated workflows, or Model Context Protocol (MCP) access for AI agents.

## Frequently asked questions

### What is a form backend?

A form backend is an HTTP endpoint that accepts `POST` data from a static or Jamstack frontend, then validates it, filters spam, stores the record, and notifies you — usually by email, webhook, or a workflow. You keep your own HTML or React UI.

### How do I connect a static HTML form?

Point the form `action` at the provider URL and use `method="POST"`. On LinkyCal that looks like `https://linkycal.com/api/public/forms/YOUR_PROJECT/YOUR_FORM/submit`. You can also send JSON through the API, embed a widget, apply custom CSS, or paste the dashboard agent instructions into a coding agent.

### What is LinkyCal's free tier?

500 form submissions per month on the Free plan, plus 500 MB of storage. Pro is $29/month for 10,000 responses. Business is $99/month for 50,000.

### Do I need a form builder or a form backend?

If non-developers will edit fields and you need a link to share, you need a [form builder](/blog/best-online-form-builder). If engineers own the UI and you only need an endpoint, spam filtering, and webhooks, you need a form backend (this article). Some products, including LinkyCal, offer both.

### Can submissions go to Google Sheets or Slack?

Yes, on most backends. Typical paths are native connectors (FormBackend, Static Forms on paid plans), outbound webhooks into Zapier or Make, or LinkyCal workflows that email, tag, and sync without a separate glue layer.

### Does a form backend include scheduling?

Not by default. Most endpoint products stop at storage, email, and webhooks. LinkyCal can hand a completed intake to [scheduling](/features/scheduling), but that is a cross-link, not the reason to choose a form backend.
