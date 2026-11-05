# Features

## Where it shows up

| Surface                                   | When                                    | What                                              |
|-------------------------------------------|-----------------------------------------|---------------------------------------------------|
| **Toolbar** on the page (badge + panel)   | whenever the module is enabled, including staging builds | the full panel                     |
| **Nuxt DevTools tab** "Backend Lens"      | `nuxt dev`                              | the same panel, embedded, updating live           |
| **Vue DevTools timeline** layer "Backend requests" | `nuxt dev`                     | one event group per request, with its summary     |

All three read the same request list, kept in the app. The DevTools tab is a separate page in an
iframe that reads it directly, so the tab and the toolbar never disagree.

## What is captured

- **Every HTTP client.** The module patches `fetch` and `XMLHttpRequest` before other plugins run,
  so it sees `$fetch` / ofetch, `useFetch`, the nuxt-auth-sanctum client (including its own
  identity fetch at startup), axios and raw `fetch` alike. It reads only response headers, never
  bodies.
- **Navigations.** Requests are grouped by client-side navigation. The panel shows the current page;
  "all navigations" shows the whole history (up to `maxRequests`).
- **Records.** For a request with a debug id, the record is loaded in the background with a small
  concurrency limit (`prefetch`). A 404 right after the response is retried, because servers may
  persist the record after responding.

## The panel

**Summary bar** for the current navigation:
- request, query and DB-time totals;
- issue counts and failed requests;
- **repeated requests**: the same method and URL fetched more than once on one screen.

**Request list**: method, path, status, duration, query count and DB time, plus chips for N+1,
duplicates and slow queries.

**Request details**: controller, duration, memory, which adapter read the record, and a link to
the source's own UI and to the raw record. Four tabs:

| Tab       | Shows                                                                                |
|-----------|--------------------------------------------------------------------------------------|
| Queries   | every statement with duration and **call site** (`app/Http/Resources/BookResource.php:29`), bindings when reported separately, and the detected issues |
| Logs      | log entries with level and context                                                    |
| Cache     | hit / miss / write / delete events with keys                                          |
| Timeline  | the server's timeline events and every query on one time axis                         |

Exceptions are shown above the tabs. A "timing only" note marks records from the Server-Timing
fallback.

**Size.**
- The toolbar panel resizes by the two edges that face the page: with the default `bottom-right`
  position, the top edge sets the height and the left edge the width.
- The border between the request list and the details is a splitter.
- In the Nuxt DevTools tab the panel fills the tab, so only the splitter is there.
- Handles also work from the keyboard (focus, then the arrow keys), and a double-click resets one
  to its default.
- The panel never grows past the viewport. Sizes are kept in `localStorage`, separately for the
  toolbar and the tab.

### SQL display

- **Syntax highlighting**: keywords, functions, strings, numbers, identifiers, placeholders, comments.
- **Formatting** over several lines, off by default (`sql.format`). It uses
  [sql-formatter](https://github.com/sql-formatter-org/sql-formatter), which is loaded only when the
  option is on. Keyword case is preserved: the SQL is shown as the server reported it, only laid out.
- Statements that do not parse are shown as they are.

## Issue detection

The analysis runs in the browser on the normalized model, so it is the same for every source.

| Issue         | Rule                                                                                       |
|---------------|--------------------------------------------------------------------------------------------|
| **N+1**       | the same statement *shape* (literals → `?`, `IN (…)` → `IN (?)`, case folded) from **one call site**, at least `nPlusOneThreshold` times (3), with at least two different statements |
| **duplicate** | byte-identical statements, bindings included, from any call site, except queries already inside an N+1 group |
| **slow**      | at or above `slowQueryMs` (100 ms)                                                         |

N+1 and duplicate groups never overlap. In the Queries tab:
- each group is **collapsed into its first query**, which carries a toggle (`N+1 ×30 · show 29
  more`);
- opening it lists the other members **right below that query, indented**, with a coloured left
  border, each with its own number, duration and call site;
- clicking an issue in the summary above the list opens its group and scrolls to it; clicking it
  again closes the group. The summary item and the query's toggle drive the same group.

*Call site* is the first application frame of the query's stack trace: the first frame outside
`vendor/`. When application middleware wraps the whole stack, queries made by vendor middleware
inside it (a session store, for example) are attributed to that application middleware.

## Actions

Requests are linked to the **user action** that caused them: a click, a form submit, a change.
The list shows a header above each group ("⚡ click “Run all”"), and the details say "triggered by
click “Post review” (+12 ms)".

- **Attribution is by time.** A request belongs to the latest action at most `actions.windowMs`
  (1000 ms) before it started. Browsers offer no way to follow an event through to the `fetch` it
  eventually causes.
- **Labels come from markup only**, in this order:
  1. `data-backend-lens-action="…"`;
  2. `aria-label`;
  3. the text of the button or link;
  4. for fields, their placeholder or name.

  **Values typed into fields are never read**, nor the text of a `contenteditable` region.
- Elements inside `data-backend-lens-ignore` are not tracked. The toolbar carries it, so clicks on
  the panel itself are not actions.

## Nuxt DevTools tab

In `nuxt dev`, Nuxt DevTools gets a **Backend Lens** tab. Nuxt DevTools lists module tabs under "⋮".
It is the same panel, embedded:
- it follows **DevTools' own colour mode**, live, which may differ from the OS;
- it uses DevTools' fonts (DM Sans, DM Mono);
- it drops its own title, because the tab already carries one.

Nuxt DevTools asks each browser for authorization once and prints the instructions in the dev
server's terminal (see [Troubleshooting](troubleshooting.md#nuxt-devtools-keeps-asking-for-authorization)).

## Vue DevTools timeline

A **Backend requests** layer joins Vue's own timeline layers:
- each request is a group: a start event, then an end event with status, duration, query count, DB
  time and issues, marked `warning` with issues and `error` for a 5xx;
- the action that triggered the request is the start event's subtitle;
- requests made before Vue DevTools connected are delivered when it connects, none twice.

Vue DevTools keeps plugin layers switched off by default: enable **Backend requests** in its
Timeline.

## Appearance

The palette matches Nuxt DevTools in light and dark.
- The **toolbar** follows the app's colour mode when the page carries a `dark` / `light` class
  (`@nuxtjs/color-mode` does), otherwise the system.
- The **DevTools tab** follows DevTools' own mode.

The toolbar lives in a **Shadow DOM**: the app's CSS cannot reach it, and its CSS cannot reach the
app.
