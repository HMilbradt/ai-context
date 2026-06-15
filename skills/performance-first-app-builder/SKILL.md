---
name: performance-first-app-builder
description: Build and revise high-performance frontend applications with local-first data flow, optimistic mutations, granular rendering, fast startup, disciplined loading, durable local schema migrations, application performance instrumentation, keyboard-first interaction, and measured verification. Use when asked to create an app, framework, dashboard, SaaS tool, internal tool, CRUD app, collaborative app, offline-capable app, or performance-sensitive UI.
metadata:
  priority: 7
retrieval:
  aliases:
    - fast app builder
    - local-first app builder
    - Linear-style performance
    - performance-first frontend
  intents:
    - build a fast application
    - create a performance-sensitive frontend
    - optimize app startup and interaction latency
    - design local-first optimistic UI
  entities:
    - IndexedDB
    - optimistic mutations
    - performance marks
    - code splitting
    - service worker
---

# Performance First App Builder

## Operating Principle

Optimize perceived speed first. UI responsiveness must not depend on network latency unless correctness requires it.

Prefer:

- Local reads before remote reads.
- Optimistic writes before server confirmation.
- Background reconciliation before blocking flows.
- Granular subscriptions before broad rerenders.
- Cached assets before repeated network fetches.
- Keyboard paths before pointer-only workflows.
- Measured verification before subjective claims.

## Initial Assessment

Before implementing, identify:

1. The critical user loop.
2. The data needed for first useful paint.
3. Which data can live locally.
4. Which mutations can be optimistic.
5. Which views need real-time reconciliation.
6. Which routes and dependencies are critical path.
7. Which local schemas require migration support.
8. Which interactions must work from keyboard and command palette.
9. Which performance instrumentation and checks will prove the result.

If the product is mostly read-only, prioritize startup, cache, and render cost.
If the product is collaborative or CRUD-heavy, prioritize local-first state and sync.
If the product is an internal operational tool, prioritize dense UI, low-latency actions, shortcuts, and predictable navigation.

## Performance Contract

Before implementation, define explicit budgets for the app:

- First useful paint target.
- Initial JavaScript budget.
- Critical request count.
- Largest route chunk budget.
- Mutation feedback latency target.
- Maximum acceptable rerender scope.
- Local database open and hydration target.
- Local schema migration target.
- Offline or retry requirement.
- Keyboard coverage for critical actions.
- Animation duration and property constraints.

If a budget cannot be measured in the current environment, state the proxy check.

Never leave performance as an aesthetic claim. Convert it into observable behavior.

## Architecture Defaults

Use a client-side application model unless server rendering clearly improves the first useful user task.

Use:

- IndexedDB or equivalent durable browser storage for local domain data.
- An in-memory observable or subscribable object graph for UI reads.
- Durable mutation queue for optimistic writes.
- Background sync for server reconciliation.
- WebSocket, SSE, polling, or delta fetch for remote updates.
- Field-level or selector-level subscriptions.
- Route-level code splitting.
- Stable shell layout that can render before app data loads.
- Service worker asset caching when the app is used repeatedly.
- Versioned local schema migrations before persisted data is used.
- App-level performance marks and measures for startup and mutation flows.

Do not block common interactions on request completion.

## Data Flow

For reads:

1. Open the local database.
2. Run required migrations.
3. Hydrate local durable data.
4. Populate in-memory state.
5. Render from local state.
6. Fetch or sync deltas in the background.
7. Reconcile conflicts explicitly.

For writes:

1. Validate locally.
2. Apply local state immediately.
3. Persist the mutation to a durable queue.
4. Mark mutation enqueue time.
5. Send in the background.
6. Confirm, merge, retry, or rollback.
7. Measure confirmation or rollback latency.

The server remains authoritative for correctness. It should not be the synchronous source for every UI transition.

## Local Schema Migrations

Any durable local store must have an explicit schema version and migration path.

Implement:

- Monotonic schema versions.
- Idempotent migration steps where practical.
- Migrations that run before hydration into UI state.
- Corruption detection for critical stores.
- Recovery behavior for failed migrations.
- A reset path that clears local state only after preserving unsynced mutations when possible.
- Tests or manual verification for new migrations.

Do not introduce IndexedDB, SQLite, OPFS, localStorage domain records, or durable caches without stating how schema changes will be handled.

When a migration changes queued mutations, include a compatibility rule for older pending mutation payloads.

## Instrumentation

Add lightweight instrumentation around the critical path before claiming speed.

Use `performance.mark` and `performance.measure` or the framework equivalent for:

- App start.
- Shell render.
- Local database open.
- Local schema migration start and end.
- Local hydration start and end.
- First useful paint proxy.
- First sync request.
- First sync completion.
- Mutation enqueue.
- Optimistic UI apply.
- Mutation send.
- Mutation confirm.
- Mutation retry.
- Mutation rollback.

Expose measurements through the lowest-friction local mechanism available, such as console table output in development, debug panel, test assertion, trace export, or browser Performance panel markers.

Instrumentation must not add noticeable production overhead. Gate verbose reporting to development unless the app already has telemetry infrastructure.

## Rendering Rules

Use granular subscriptions. A field update should rerender only components that read that field.

Avoid:

- Global context updates for high-churn data.
- Parent list rerenders for cell-level changes.
- Server refetch after every mutation.
- Derived state that recomputes across whole collections.
- Layout shifts caused by late fonts, images, or unknown dimensions.

Prefer:

- Stable IDs.
- Normalized data.
- Memoized selectors.
- Virtualization for large lists.
- Explicit loading boundaries by route or panel.
- Fixed dimensions for repeated UI elements.

## Startup Rules

First useful paint should not wait for full app readiness.

Implement:

- Minimal inline shell CSS.
- Persisted shell preferences such as theme, sidebar width, density, and last workspace.
- Font preload with matching CORS mode.
- `font-display: swap`.
- Modern ESM build target.
- Aggressive code splitting.
- Module preloads for critical chunks.
- Fine-grained vendor chunks where supported.
- Lazy loading for non-critical routes, editors, charts, AI panels, and admin screens.

Avoid:

- Blocking startup on `/me` when local data can safely render first.
- Loading the full editor, charting, AI, or admin stack for the default screen.
- One large vendor bundle.
- Legacy browser transforms unless explicitly required.

## Interaction Model

Every common action must have a fast path.

Implement:

- Global command palette.
- Keyboard shortcuts for frequent actions.
- Contextual commands for the current selection or route.
- Pointer support for discoverability.
- Visible shortcut hints in menus.
- Local command search over in-memory data when possible.

A fast renderer cannot compensate for a slow input model.

## Animation Rules

Animate only cheap properties by default:

- `transform`.
- `opacity`.
- Short color transitions when acceptable.

Avoid animating:

- `height`.
- `width`.
- `top`.
- `left`.
- `margin`.
- `padding`.
- Layout-dependent list movement.

Use short durations:

- 0ms for immediate feedback.
- 80ms to 150ms for frequent UI feedback.
- 150ms to 250ms for popovers, panels, and spatial transitions.
- Longer only when the motion carries user orientation.

No `transition: all`.

## Verification

Before finishing, run the strongest practical checks available.

For web apps:

- Build the app.
- Run typecheck and tests when present.
- Open the app in a browser.
- Verify the first useful screen renders.
- Verify one critical optimistic mutation.
- Verify local schema migration behavior when durable local data changed.
- Verify performance marks appear for the critical path.
- Verify keyboard navigation or command palette.
- Capture performance evidence when tooling is available.

Use browser tooling to inspect:

- Initial JavaScript size.
- Number of critical requests.
- Waterfalls.
- Layout shifts.
- Long tasks.
- Rerender behavior for high-churn updates.
- Offline or retry behavior when relevant.

Do not claim performance improved without measurement or direct behavioral verification.

## Completion Standard

A change is complete only when:

- The critical user loop feels immediate.
- Common writes do not wait on the network.
- Startup renders a useful shell quickly.
- High-churn updates avoid broad rerenders.
- Durable local data has a migration path.
- Critical flows emit usable performance measurements.
- Keyboard paths exist for common actions.
- Animation does not trigger layout work.
- Verification results are reported.
