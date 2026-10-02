# Thon Hub — Powered by Edutantr

Complete GitHub/Vercel export of the event hub, preserving the design and all implemented features.

## Included features

- Responsive event catalog, category/search/fee filters and live countdowns.
- Gen Z motion: animated hero, energy trail, scrolling text, card effects, scroll reveals and pause/reduced-motion support.
- Email sign-in and account creation with one-use, 15-minute links delivered through Resend.
- Admin-only workspace, verified on the server against `ADMIN_EMAIL`.
- Event creation, separate title edits, drafts, publication, capacity limits, fee/payment links and joining links.
- Event posters, PDFs and optional mentor biographies, portfolio links and attachments; 10 MB per file, 12 files per event.
- Registrations, personal event tickets, payment-reference review and confirmed-only access for paid events.
- Attendee filters by event/status/search, filtered CSV export and email to filtered recipients.
- Message filters by event, attendee status, delivery status, type and search, with pagination and event-scoped retries.
- Bulk email composer with subject/body, selected recipients, preview and optional joining links for confirmed attendees.
- Resend batching, durable queues, provider IDs, accepted timestamps and idempotent retry protection.
- One-hour-before reminders are queued; the admin sends due messages from Messages. No automatic scheduler is configured.
- Feature-detected WebMCP event tools remain included.

## Deploy

Follow [DEPLOYMENT.md](DEPLOYMENT.md). Use the entire project, not only `index.html`, for a working public site with login, records, uploads and email.

The project runs as a standard Next.js application on Vercel. Turso replaces the Sites-only D1 database, private Vercel Blob replaces R2, and verified email sign-in replaces Sites-only ChatGPT identity headers. Resend remains the email provider.

## Local development

Install Node.js 22.13 or later, then run:

```sh
npm ci
cp .env.example .env.local
npm run db:migrate
npm run dev
```

Set your Resend key in `.env.local` if you want to test real sign-in locally. Tests use a fake provider and send no real emails. A connected private Blob store is needed for uploads. The database defaults to a local SQLite file in `.local`, which is ignored by Git; production must use Turso.

## Build and checks

```sh
npm test
npm run typecheck
npm run build
```

The build applies tracked database migrations, generates the single-file `index.html`, and builds the Next.js site. Database migrations are tracked and only run once. Keep applied migrations unchanged; add new SQL files for schema updates.

## index.html

`index.html` includes the complete compiled browser app, styles, icons and embedded brand images. It works with the included `/api` backend when hosted with this project. Opening it as a local file shows a read-only preview with working search, filters, details and animations. Admin access is never simulated in the preview. Editable React/TypeScript source is in `app`, `components`, `lib` and `html`; regenerate the HTML with `npm run build:html`.

## Secrets and production data

Runtime keys belong in Vercel environment settings. Your Resend key is not included in any downloaded file. `EMAIL_FROM` is configured as `Thon Hub <events@thonhub.com>`. Configure `ADMIN_EMAIL` privately in Vercel to grant admin access to your verified administrator account.

This export includes the complete source, assets and database schema. It does not contain production attendee records, queued messages, uploaded files or current database events from the hosted Site. Those records remain in that Site and need a separate data migration if you want to move them. The portable app starts with an empty catalog and offers sample drafts to the administrator.

This individual-file delivery contains the complete portable GitHub/Vercel project. Upload the files and folders inside the saved project folder to the root of your GitHub repository in two browser uploads: the components folder first (62 files), then all remaining items (68 files). Follow DEPLOYMENT.md. Each browser, server, configuration, image, and migration file is included separately.
