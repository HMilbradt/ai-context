---
name: react-mobx-cloudflare-app-builder
description: Build React applications in a Turborepo monorepo on Cloudflare with MobX, IndexedDB local state, D1-backed auth and persistence, organization-first authorization, SEO-friendly prerendered marketing pages, client-only dashboard routes, and ShadCN/Base UI token-based styling. Use when creating or revising a Linear-style local-first SaaS, dashboard, collaborative app, or Cloudflare-native React app.
metadata:
  priority: 8
  docs:
    - https://developers.cloudflare.com/workers/static-assets/
    - https://developers.cloudflare.com/d1/
    - https://developers.cloudflare.com/durable-objects/
    - https://developers.cloudflare.com/queues/
    - https://better-auth.com/docs/concepts/database
    - https://better-auth.com/docs/plugins/organization
    - https://turborepo.dev/docs
    - https://mobx.js.org/react-integration.html
    - https://ui.shadcn.com/docs
    - https://base-ui.com/react/overview/quick-start
retrieval:
  aliases:
    - React MobX Cloudflare app
    - Linear-style Cloudflare app
    - local-first Cloudflare SaaS
    - MobX IndexedDB sync
  intents:
    - build a React app on Cloudflare
    - create a local-first SaaS with MobX
    - design IndexedDB sync with Cloudflare
    - implement Cloudflare multiplayer
    - build SEO marketing pages with a dashboard app
  entities:
    - React
    - MobX
    - IndexedDB
    - Cloudflare Workers
    - Cloudflare D1
    - Cloudflare Durable Objects
    - Cloudflare Queues
    - ShadCN
    - Base UI
---

# React MobX Cloudflare App Builder

## Operating Principle

Build a two-zone React application:

- Marketing zone: prerendered static HTML and assets for SEO.
- Application zone: client-only dashboard shell with MobX, IndexedDB, optimistic writes, and background sync.

Use D1 for app-owned auth data and the canonical relational application database. Choose the rest of the Cloudflare resources by product need. Workers and Static Assets are the default runtime and delivery layer, Durable Objects are appropriate for realtime coordination, and Queues are appropriate for async side effects. Do not force a Cloudflare service into the design when the product requirement does not need it.

## Source Freshness

Before relying on API signatures, compatibility flags, limits, or framework support, check current primary docs:

- Cloudflare Workers Static Assets.
- Cloudflare D1 Workers Binding API.
- Cloudflare Durable Objects WebSockets and storage.
- Cloudflare Queues JavaScript APIs.
- Better Auth database adapters and organization plugin.
- Turborepo workspace configuration.
- MobX React integration.
- ShadCN theming.
- Base UI component APIs.

If current Cloudflare docs still say React Router prerendering and SPA mode are unsupported with the Cloudflare Vite plugin, do not choose React Router framework mode for this architecture. Use React + Vite with React Router as a client library, or use a separate prerender step for marketing pages.

## Default Stack

Use:

- TypeScript.
- React.
- Vite.
- MobX and `mobx-react-lite`.
- IndexedDB through a typed wrapper such as Dexie unless the repo already has a preferred local database layer.
- Turborepo monorepo with `apps/*` and `packages/*`.
- Cloudflare Workers with Static Assets as the default deployment target.
- D1 for auth, organization, membership, and canonical application data.
- Better Auth with the organization plugin for authentication and authorization.
- Optional Durable Objects for organization, room, document, or board coordination.
- Optional Cloudflare Queues for async side effects.
- ShadCN-style owned components.
- Base UI primitives for accessible headless behavior.
- Tailwind and CSS custom properties for tokenized styling.

Avoid:

- Server-rendering dashboard routes by default.
- Treating D1 as a per-keystroke realtime transport.
- Treating Queues as realtime fanout.
- Putting auth tokens in IndexedDB.
- Building new UI primitives outside the design system.
- Starting from a single-package app when the goal is a reusable application framework.

## Monorepo Structure

Use Turborepo as the default repository shape.

Prefer:

- `apps/web`: React marketing pages and dashboard shell.
- `apps/worker`: Cloudflare Worker routes, auth handlers, sync APIs, and service bindings when kept separate from the web build.
- `packages/auth`: Better Auth configuration, organization plugin setup, permission helpers, and shared auth types.
- `packages/db`: D1 schema, migrations, query helpers, and typed database access.
- `packages/sync`: client/server sync primitives, local outbox helpers, and conflict policy helpers.
- `packages/ui`: ShadCN/Base UI-derived components and token definitions.
- `packages/config`: shared TypeScript, lint, Tailwind, and build config.

Keep framework guidance flexible. Co-locate `apps/web` and Worker code when the chosen Cloudflare integration makes that simpler, but keep auth, database, sync, and UI primitives in packages so agents do not couple product screens to infrastructure details.

## Route Model

Use explicit route partitions:

- `/`, `/pricing`, `/customers`, `/docs`, `/blog/*`: prerendered marketing pages.
- `/app/*`: dashboard SPA shell, authenticated, noindexed.
- `/api/*`: JSON API routes.
- `/auth/*`: login, callback, logout, session refresh.
- `/sync/*`: pull, push, bootstrap, and WebSocket upgrade routes.

Marketing pages must have:

- Static HTML output.
- Unique title and description.
- Canonical URL.
- Open Graph metadata.
- Sitemap coverage.
- `robots` policy that allows indexing.

Dashboard routes must have:

- Client-only data loading from IndexedDB and sync APIs.
- `noindex` metadata or equivalent response headers.
- Auth enforcement before sensitive data is returned.
- No marketing bundle dependency unless shared code is demonstrably small.

## Cloudflare Routing

Configure Workers Static Assets so static marketing files are served directly when possible. Use the Worker for `/api/*`, `/auth/*`, and `/sync/*`.

Use `not_found_handling = "single-page-application"` only for the dashboard shell or a build where unknown dashboard routes must return the app shell. Pair it with selective `run_worker_first` for API, auth, and sync routes.

Prefer a Worker fetch handler that:

1. Routes `/api/*`, `/auth/*`, and `/sync/*` first.
2. Applies auth and tenancy checks.
3. Delegates static requests to the assets binding.
4. Serves the dashboard shell only for valid `/app/*` paths.

## State Model

Use MobX for shared domain state, sync state, and high-churn collaborative state.

Create stores by responsibility:

- `SessionStore`: authenticated user, active organization, organization membership, auth freshness.
- `DomainStore`: normalized entities from IndexedDB and server deltas.
- `SyncStore`: local cursor, mutation queue state, network state, conflict state.
- `PresenceStore`: online collaborators, selections, cursors, transient room state.
- `UiStore`: persistent shell preferences only when React local state is insufficient.

Wrap components that read observable data with `observer`.

Prefer named functions inside `observer` so React hook linting and DevTools names stay useful.

Read observable fields inside observer components as late as practical. Pass object references through MobX-aware components. Convert to plain objects before passing data into non-observer third-party components.

Do not put component-only state into MobX unless it is shared, derived, deep, or reused across multiple observer components.

## IndexedDB Local Store

Use IndexedDB as a local replica, not as an independent source of truth.

Persist:

- Entity snapshots scoped by account, organization, and table.
- Sync cursors.
- Durable outbox mutations.
- Client device ID.
- Local schema version.
- Shell preferences that are safe on shared devices.

Do not persist:

- Bearer tokens.
- Raw OAuth tokens.
- Password material.
- Sensitive fields not needed for offline use.
- Cross-organization data without an organization partition key.

Every local table should include enough metadata to support organization scoping, server reconciliation, soft deletion when needed, and local pending state.

Every outbox entry should include enough metadata to support idempotency, retry, organization authorization, conflict detection, and user-visible error recovery.

## Sync Protocol

Use a local-first sync shape without prescribing exact endpoint payloads or tables.

The architecture should include:

- An IndexedDB local replica for the active organization.
- A durable local outbox for optimistic mutations.
- A server-side authority path that authenticates the session and checks organization membership before accepting changes.
- Idempotent mutation handling so retries are safe.
- A durable cursor or version strategy so clients can fetch missed changes after reload or reconnect.
- A conflict policy appropriate to the product domain.
- Optional realtime delivery when another user should see changes immediately.

Prefer D1 as the durable authority for committed application state. Use Durable Objects only when the product needs serialized coordination, presence, low-latency fanout, or WebSocket rooms. Use Queues only for async side effects after the primary write is accepted.

## Server Data Model

Use D1 as the canonical relational database for auth, organizations, memberships, and application data.

Prefer:

- STRICT SQLite tables where practical.
- Prepared statements and typed result rows.
- Foreign keys for ownership and membership boundaries.
- Organization-scoped application records.
- Durable idempotency records for client mutations when offline or retry behavior exists.

Do not prescribe a product data model in this skill. The agent should derive domain entities from the user's app request, but every multi-user entity must belong to an organization or to a child scope of an organization.

## Durable Objects

Use Durable Objects only when coordination is actually needed.

Good fits:

- One object per organization for general sync.
- One object per document, board, canvas, or high-churn room when an organization object would bottleneck.
- Realtime presence, multiplayer cursors, collaborative editing rooms, serialized command handling, or low-latency WebSocket fanout.

Avoid:

- One global object for all tenants.
- Durable Objects for ordinary CRUD that D1 can handle.
- Durable Objects when polling, pull sync, or plain Worker routes are sufficient.

When used, Durable Objects may own:

- Mutation ordering inside their coordination atom.
- WebSocket room membership.
- Presence fanout.
- Low-latency delta broadcast.
- Short-lived in-memory derived state.

D1 owns:

- Canonical persisted data.
- Membership.
- Sync history.
- Audit history.
- Session and identity records.

Persist important state before broadcasting it. In-memory state must be reconstructable after eviction.

Use the Durable Objects hibernation WebSocket API for idle rooms when applicable. Store only small per-connection metadata as WebSocket attachments. Put larger or durable room state in Durable Object storage or D1.

Batch high-frequency messages. Prefer one envelope containing multiple logical messages over many small WebSocket frames.

## Multiplayer

Use WebSockets through Durable Objects for multiplayer and presence when the product needs live collaboration.

Connection flow:

1. Client requests `/sync/ws?organizationId=...&roomId=...`.
2. Worker validates method, upgrade headers, session cookie, organization membership, and room access.
3. Worker routes to the Durable Object by deterministic name.
4. Durable Object accepts the WebSocket.
5. Durable Object attaches user ID, organization ID, room ID, connection ID, and joined timestamp.
6. Durable Object sends bootstrap metadata and current presence.
7. Client pulls missed durable deltas by cursor.

Separate durable deltas from ephemeral presence:

- Durable entity changes go through the mutation protocol and D1.
- Presence, cursor location, selection rectangles, typing state, and hover state stay ephemeral in the Durable Object.

Do not use presence as authorization evidence.

## Queues

Use Cloudflare Queues only for asynchronous work that does not need to complete before UI feedback:

- Email.
- Webhooks.
- Audit enrichment.
- Search indexing.
- Analytics ingestion.
- Large fanout jobs.
- AI background jobs.
- Cleanup and retry work.

Queue messages must be idempotent. Include a stable job ID, organization ID, actor ID, entity IDs, and originating mutation ID.

Do not queue the primary write path if the user expects immediate collaborative visibility. Commit through the Durable Object and D1 first, then enqueue side effects.

## Authentication

Use Better Auth as the default app-owned authentication layer for customer-facing SaaS.

Configure Better Auth with:

- D1-backed database storage. Prefer the built-in SQLite/D1-capable path or a Drizzle SQLite adapter when the project standardizes on Drizzle.
- Organization plugin enabled on server and client.
- HttpOnly, Secure, SameSite cookies.
- CSRF protection for cookie-authenticated writes.
- Session rotation on login and privilege changes.
- Logout that invalidates the server session and clears local IndexedDB data for the affected user and organization.
- Turnstile on signup, login, invitation acceptance, or passwordless email request flows when bot abuse is plausible.

Use Cloudflare Access for internal admin surfaces or private preview environments, not as the default customer auth system.

Do not create bespoke session, membership, invitation, or role systems unless Better Auth cannot satisfy a documented requirement.

## Organizations And Authorization

Make organizations mandatory.

Rules:

- Every user must belong to at least one organization.
- Create a personal organization for each new user during onboarding.
- Product data must be organization-scoped unless it is explicitly global public marketing content.
- The active organization must be explicit in the dashboard UI and request context.
- Organization membership must be checked before every organization-scoped read, write, sync pull, sync push, and WebSocket upgrade.
- Authorization must be expressed through the auth library's organization and access-control system.

Do not hard-code a universal role list in this skill. Instead:

- Define roles and permissions from the product domain.
- Keep roles organization-scoped.
- Use Better Auth organization access control for static role sets.
- Consider Better Auth dynamic access control only when the product needs organization-specific custom roles.
- Keep server-side permission checks authoritative. Client checks are for affordances only.

The default mental model is: user owns identity, organization owns data, membership grants access, role grants capability.

## Conflict Handling

Define conflict policy per entity type before implementing mutations.

Use one of:

- Last writer wins for low-risk scalar fields.
- Field-level merge for independent properties.
- Server rejection with client rollback for protected fields.
- Domain-specific command validation for ordered workflows.
- CRDT only for truly concurrent freeform text, canvas, or rich collaborative editing.

Every mutation must include the client-observed `baseVersion`. The server must return enough information for the client to either confirm, merge, or rollback.

Never silently overwrite another user's protected change.

## UI System

Use ShadCN as the owned component distribution pattern and Base UI for accessible headless primitives.

Rules:

- Components live in the app repo and are editable.
- Shared primitives wrap Base UI parts where Base UI has the matching behavior.
- Styling is token-based through CSS custom properties.
- Tailwind utilities reference semantic tokens, not hard-coded colors.
- New primitives must expose variants through a local variant helper.
- All components must support keyboard and screen-reader behavior inherited from Base UI where applicable.

Required token groups:

- Color: background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring.
- Layout: radius, spacing, sidebar width, content width, toolbar height, row height.
- Typography: font family, sizes, weights, line heights.
- Motion: duration, easing, reduced-motion behavior.
- Data: chart palette and status colors.

## Visual Direction

Aim for a Linear-like product UI without copying Linear assets.

Use:

- Neutral dark and light themes.
- Subtle borders.
- Low-radius controls.
- Dense but breathable layout.
- Small, precise icons.
- Tight tables and lists.
- Clear focus states.
- Reserved accent color.
- Minimal shadows.
- Fast opacity and transform motion.

Avoid:

- Marketing gradients as the dashboard visual language.
- Oversized cards in operational views.
- Decorative background blobs.
- Rounded pill-heavy controls everywhere.
- One-hue palettes.
- Low-contrast muted text.

## SEO And Indexing

Marketing routes must be prerendered and inspectable without JavaScript.

Dashboard routes must not be indexed. Add `noindex` through metadata, headers, or both. Authenticated data must never be embedded in prerendered HTML.

Generate:

- `sitemap.xml` for public pages.
- `robots.txt`.
- canonical URLs.
- Open Graph metadata.
- structured data only when it reflects visible public content.

## Completion Review

Before finishing, confirm the architecture follows the guide:

- The repository is a Turborepo monorepo with clear `apps/*` and `packages/*` boundaries.
- D1 is the chosen store for auth, organizations, memberships, and canonical relational app data.
- Better Auth owns sessions, organizations, invitations, membership, and role or permission checks.
- Every authenticated user gets a personal organization.
- Every multi-user product record is organization-scoped.
- Cloudflare resources beyond D1 are selected by need, not by default.
- Marketing routes are prerendered and indexable.
- Dashboard routes are client-only and noindexed.
- IndexedDB state is local-only, scoped by user and organization, and contains no auth secrets.
- MobX stores are organized by session, domain, sync, presence, and UI responsibilities.
- ShadCN/Base UI components are token-based and can be rethemed without component rewrites.

Report important deviations and why they were chosen.
