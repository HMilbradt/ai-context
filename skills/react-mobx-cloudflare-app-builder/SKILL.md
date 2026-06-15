---
name: react-mobx-cloudflare-app-builder
description: Build React applications on Cloudflare with MobX, IndexedDB sync, Durable Objects multiplayer, D1 persistence, Queues for async work, app-owned authentication, SEO-friendly prerendered marketing pages, client-only dashboard routes, and ShadCN/Base UI token-based styling. Use when creating or revising a Linear-style local-first SaaS, dashboard, collaborative app, or Cloudflare-native React app.
metadata:
  priority: 8
  docs:
    - https://developers.cloudflare.com/workers/static-assets/
    - https://developers.cloudflare.com/d1/
    - https://developers.cloudflare.com/durable-objects/
    - https://developers.cloudflare.com/queues/
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

Use Cloudflare Workers as the application runtime, D1 as the authoritative relational database, Durable Objects as per-workspace or per-document coordination actors, and Queues for async side effects. Do not use Queues for low-latency multiplayer fanout.

## Source Freshness

Before relying on API signatures, compatibility flags, limits, or framework support, check current primary docs:

- Cloudflare Workers Static Assets.
- Cloudflare D1 Workers Binding API.
- Cloudflare Durable Objects WebSockets and storage.
- Cloudflare Queues JavaScript APIs.
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
- Cloudflare Workers with Static Assets.
- D1 for canonical data.
- Durable Objects for workspace, room, document, or board coordination.
- Cloudflare Queues for async side effects.
- ShadCN-style owned components.
- Base UI primitives for accessible headless behavior.
- Tailwind and CSS custom properties for tokenized styling.

Avoid:

- Server-rendering dashboard routes by default.
- Treating D1 as a per-keystroke realtime transport.
- Treating Queues as realtime fanout.
- Putting auth tokens in IndexedDB.
- Building new UI primitives outside the design system.

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

- `SessionStore`: authenticated user, workspace membership, auth freshness.
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

- Entity snapshots scoped by account, workspace, and table.
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
- Cross-workspace data without a workspace partition key.

Every local table must include enough metadata for sync:

- `id`
- `workspaceId`
- `serverVersion`
- `updatedAt`
- `deletedAt`
- `localStatus`

Every outbox entry must include:

- `mutationId`
- `deviceId`
- `clientSeq`
- `workspaceId`
- `entityType`
- `entityId`
- `op`
- `payload`
- `baseVersion`
- `createdAt`
- `attempts`
- `lastError`

## Sync Protocol

Use a mutation-log sync protocol.

Client push flow:

1. Generate `mutationId = deviceId + ":" + clientSeq`.
2. Apply the mutation to MobX state immediately.
3. Persist the mutation to IndexedDB outbox.
4. Send a batch to `/sync/push`.
5. Worker authenticates the user and validates workspace membership.
6. Worker routes the batch to the workspace Durable Object.
7. Durable Object serializes mutations for that workspace or document.
8. Durable Object writes canonical changes and `sync_operations` rows to D1.
9. Durable Object broadcasts accepted deltas to connected clients.
10. Durable Object or Worker enqueues async side effects to Queues.
11. Client receives ack, records committed server versions, and removes outbox entries.

Client pull flow:

1. Read local cursor from IndexedDB.
2. Call `/sync/pull?workspaceId=...&since=...`.
3. Worker authenticates and validates membership.
4. Worker reads committed `sync_operations` from D1.
5. Client applies deltas idempotently.
6. Client advances cursor only after IndexedDB commit succeeds.

Reconnect flow:

1. Open dashboard shell from local IndexedDB.
2. Start WebSocket for live room updates.
3. Pull missed deltas from D1 using the last durable cursor.
4. Resume outbox pushes.
5. Resolve conflicts before clearing affected local mutations.

## Server Data Model

Use D1 as the canonical database.

Prefer STRICT SQLite tables where practical. Use prepared statements and typed result rows.

Minimum tables:

- `users`
- `accounts` or `identities`
- `sessions`
- `workspaces`
- `workspace_members`
- domain tables such as `issues`, `projects`, or `documents`
- `sync_operations`
- `mutation_receipts`
- `audit_events`

`sync_operations` should include:

- `opId`
- `workspaceId`
- `entityType`
- `entityId`
- `operation`
- `payload`
- `actorUserId`
- `deviceId`
- `clientSeq`
- `serverVersion`
- `createdAt`

Use `mutation_receipts` for idempotency. A repeated `mutationId` must return the same committed result, not reapply the mutation.

## Durable Objects

Use Durable Objects for coordination atoms:

- One object per workspace for general sync.
- One object per document, board, canvas, or high-churn room when a workspace object would bottleneck.
- Never one global object for all tenants.

Durable Objects own:

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

Use WebSockets through Durable Objects for multiplayer and presence.

Connection flow:

1. Client requests `/sync/ws?workspaceId=...&roomId=...`.
2. Worker validates method, upgrade headers, session cookie, workspace membership, and room access.
3. Worker routes to the Durable Object by deterministic name.
4. Durable Object accepts the WebSocket.
5. Durable Object attaches user ID, workspace ID, room ID, connection ID, and joined timestamp.
6. Durable Object sends bootstrap metadata and current presence.
7. Client pulls missed durable deltas by cursor.

Separate durable deltas from ephemeral presence:

- Durable entity changes go through the mutation protocol and D1.
- Presence, cursor location, selection rectangles, typing state, and hover state stay ephemeral in the Durable Object.

Do not use presence as authorization evidence.

## Queues

Use Cloudflare Queues for asynchronous work that does not need to complete before UI feedback:

- Email.
- Webhooks.
- Audit enrichment.
- Search indexing.
- Analytics ingestion.
- Large fanout jobs.
- AI background jobs.
- Cleanup and retry work.

Queue messages must be idempotent. Include a stable job ID, workspace ID, actor ID, entity IDs, and originating mutation ID.

Do not queue the primary write path if the user expects immediate collaborative visibility. Commit through the Durable Object and D1 first, then enqueue side effects.

## Authentication

Use app-owned authentication for customer-facing SaaS.

Default requirements:

- HttpOnly, Secure, SameSite cookies.
- D1-backed sessions.
- D1-backed users, identities, and workspace memberships.
- CSRF protection for cookie-authenticated writes.
- Session rotation on login and privilege change.
- Logout that invalidates the server session and clears local IndexedDB workspace data.
- Auth checks in Worker routes before touching D1, Queues, or Durable Objects.
- Membership checks before every workspace-scoped read, write, and WebSocket upgrade.

Use Cloudflare Access for internal admin surfaces or private preview environments, not as the default customer auth system.

Use Turnstile on signup, login, invitation acceptance, or passwordless email request flows when bot abuse is plausible.

Do not store auth secrets or bearer tokens in IndexedDB. Keep local data scoped by user ID, account ID, and workspace ID so logout and account switch can clear the right data.

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

## Verification

Before finishing a generated app or feature:

- Build the app.
- Run typecheck.
- Run tests when present.
- Run D1 migrations locally or against the intended environment.
- Verify marketing HTML exists for public routes.
- Verify `/app/*` is not indexed.
- Verify auth blocks API, sync, and WebSocket access without a valid session.
- Verify one optimistic mutation through IndexedDB, Worker, Durable Object, D1, WebSocket broadcast, and ack cleanup.
- Verify offline mutation persistence and reconnect flush.
- Verify repeated mutation IDs are idempotent.
- Verify Queue consumers tolerate duplicate messages.
- Verify MobX observer components rerender only for relevant observable reads.
- Verify token changes update ShadCN/Base UI-derived components without component rewrites.

Report what was verified and what remains unverified.
