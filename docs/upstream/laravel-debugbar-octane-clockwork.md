# Draft issue: Clockwork integration under Octane — headers only on the first request, later records carry the first request's data

> Draft for `fruitcake/laravel-debugbar`. Not published yet. Found on 2026-11-04 while building the
> nuxt-backend-lens demo stand. See "Before publishing" at the end.

---

## Summary

With `debugbar.clockwork` enabled (`DEBUGBAR_CLOCKWORK=true`) and the app running on Laravel Octane:

1. **The `X-Clockwork-*` headers are added only to the first response a worker serves.** Every later
   response from that worker has `phpdebugbar-id` but no `X-Clockwork-Id`, `X-Clockwork-Version` or
   `X-Clockwork-Path`, so Clockwork clients stop seeing requests.
2. **Every later record's `clockwork` data belongs to the worker's first request.** The record of
   request B, read through `_debugbar/clockwork/{id}`, shows request A's `uri`, `method`, `getData`,
   `postData`, `headers`, `cookies`, `responseStatus` and `sessionData`. The same stale data is also
   stored under the `clockwork` key of the native record (`_debugbar/open?op=get&id=…`). That
   record's `__meta` is still correct.

Without Octane (PHP-FPM, or FrankenPHP in classic mode) everything works: every response gets the
headers, and every record holds its own data.

## Environment

| Component                  | Version                       |
|----------------------------|-------------------------------|
| fruitcake/laravel-debugbar | 4.4.5                         |
| php-debugbar/php-debugbar  | 3.8.1                         |
| laravel/framework          | 13.40.0                       |
| laravel/octane             | 2.23.0 (driver: `frankenphp`) |
| FrankenPHP                 | 1.13.4 (Caddy 2.11.7)         |
| PHP                        | 8.5.12                        |

Only the FrankenPHP driver was tested. The code paths involved (see Root cause) do not depend on the
driver, so Swoole and RoadRunner are likely affected too. That is unverified.

## Steps to reproduce

1. Create a fresh app with Octane and Debugbar:

   ```bash
   composer create-project laravel/laravel debugbar-octane-repro
   cd debugbar-octane-repro
   composer require laravel/octane
   composer require --dev fruitcake/laravel-debugbar
   php artisan octane:install --server=frankenphp
   ```

2. In `.env`:

   ```dotenv
   APP_DEBUG=true
   DEBUGBAR_ENABLED=true
   DEBUGBAR_CLOCKWORK=true
   ```

3. Add a route in `routes/web.php`:

   ```php
   Route::get('/probe', fn () => response()->json(['ok' => true]));
   ```

4. Start Octane with a **single worker**, so consecutive requests go to the same worker:

   ```bash
   php artisan octane:start --workers=1 --port=8000
   ```

5. Send two requests that can be told apart:

   ```bash
   curl -s -D - -o /dev/null -H 'X-Probe: request-A' -b 'probe=cookie-A' 'http://localhost:8000/probe?from=A'
   curl -s -D - -o /dev/null -H 'X-Probe: request-B' -b 'probe=cookie-B' 'http://localhost:8000/probe?from=B'
   ```

6. Take the `phpdebugbar-id` of the **second** response and read its record:

   ```bash
   curl -s 'http://localhost:8000/_debugbar/clockwork/<id-of-B>'
   ```

## Expected

- Both responses carry `X-Clockwork-Id`, `X-Clockwork-Version` and `X-Clockwork-Path`.
- The record of B has `uri: /probe?from=B`, `getData: {from: "B"}`, `headers.x-probe: ["request-B"]`
  and `cookies: {probe: "cookie-B"}`.

## Actual

Response headers (observed on the demo stand; the route there was `/api/marker/{uuid}`):

```text
--- response A
Phpdebugbar-Id: 01M6M371TR3RGNG4533EBEM82R
X-Clockwork-Id: 01M6M371TR3RGNG4533EBEM82R
X-Clockwork-Path: _debugbar/clockwork/
X-Clockwork-Version: 9
--- response B
Phpdebugbar-Id: 01M6M371VS2G8N3XDA5TR084ZD
```

Record of B (`/_debugbar/clockwork/01M6M371VS2G8N3XDA5TR084ZD`): the `id` is B's, everything taken
from the request is A's:

```json
{
  "id": "01M6M371VS2G8N3XDA5TR084ZD",
  "uri": "/api/marker/c00f0bcc-aa7a-4d44-b73f-6ea550bc4a0e?from=A",
  "method": "GET",
  "getData": { "from": "A" },
  "headers": { "x-probe": ["request-A"], "...": "..." },
  "cookies": { "probe": "cookie-A" }
}
```

Native record of B (`/_debugbar/open?op=get&id=01M6M371VS2G8N3XDA5TR084ZD`):

```text
__meta.uri      = /api/marker/ebeb9ff0-a8c9-41cd-9a2d-1e8510820435?from=B   <- correct
clockwork.uri   = /api/marker/c00f0bcc-aa7a-4d44-b73f-6ea550bc4a0e?from=A   <- stale, request A
```

A load test confirmed it at scale: 4 Octane workers, 100 + 100 concurrent requests. **None** of the
responses carried `X-Clockwork-Id`, because the worker's first request was the readiness probe. With
the same app in FrankenPHP classic mode, all 800 out of 800 responses carried the headers and every
record held its own data.

## Root cause

Line numbers refer to fruitcake/laravel-debugbar 4.4.5 and php-debugbar 3.8.1.

**`src/LaravelDebugbar.php`, `handleResponse()`, lines 509–518:**

```php
if ($config->get('debugbar.clockwork') && ! $this->hasCollector('clockwork')) {
    try {
        $clockworkCollector = new ClockworkCollector($request, $response);
        $this->addCollector($clockworkCollector);
    } catch (Exception $e) {
        $this->addCollectorException('Cannot add ClockworkCollector', $e);
    }

    $this->addClockworkHeaders($response);
}
```

**`src/Support/Clockwork/ClockworkCollector.php`:**
- The constructor stores the `Request` and the `Response`.
- `collect()` (lines 50–74) reads `uri`, `method`, query, post data, headers, cookies, session and
  status from those stored objects.
- The class does not implement `Resettable`, and has no way to receive a new request or response.

**`src/Support/Octane/ResetDebugbar.php`** calls `$debugbar->reset()` on every `RequestReceived`.
**`DebugBar::reset()`** (php-debugbar `src/DebugBar.php`, lines 305–315) resets collectors that
implement `Resettable`, but **keeps every collector registered**.

Under Octane the `LaravelDebugbar` instance lives as long as the worker:

1. On the worker's first request, `hasCollector('clockwork')` is false. The collector is created with
   request A and response A, and the headers are added.
2. On every later request, `hasCollector('clockwork')` is true, so the whole block is skipped:
   - no headers are added (symptom 1);
   - the old collector stays registered and keeps collecting from request A and response A
     (symptom 2).

The `RequestCollector` right above (lines 502–506) already avoids this: the existing instance is
updated with `setResponse($response)`. The Clockwork collector needs the same treatment.

## Suggested fix

Keep a single collector, but give it the current request and response on every response, and add the
headers unconditionally:

```php
// LaravelDebugbar::handleResponse()
if ($config->get('debugbar.clockwork')) {
    try {
        if ($this->hasCollector('clockwork')) {
            $collector = $this->getCollector('clockwork');
            if ($collector instanceof ClockworkCollector) {
                $collector->setRequest($request);
                $collector->setResponse($response);
            }
        } else {
            $this->addCollector(new ClockworkCollector($request, $response));
        }
    } catch (Exception $e) {
        $this->addCollectorException('Cannot add ClockworkCollector', $e);
    }

    $this->addClockworkHeaders($response);
}
```

```php
// ClockworkCollector
public function setRequest(Request $request): void
{
    $this->request = $request;
}

public function setResponse(Response $response): void
{
    $this->response = $response;
}
```

Alternatives:
- Call `$this->removeCollector('clockwork')` (php-debugbar `DebugBar::removeCollector()`, line 118)
  before adding a fresh one.
- Drop the collector in `ResetDebugbar`.

A regression test can simulate two requests on one application instance, with
`RequestReceived` dispatched between them. It should then assert two things: the second response has
`X-Clockwork-Id`, and the second record's `uri` is the second request's.

## Workaround

Under Octane, keep `DEBUGBAR_CLOCKWORK=false` and read Debugbar's native records instead:
`phpdebugbar-id` → `_debugbar/open?op=get&id=…`. Ignore the `clockwork` key in those records.
The native data (`__meta`, `queries`, `messages`, …) is reset correctly between requests. A load test
of 400 + 400 concurrent requests on 4 Octane workers found no cross-request data in it.

---

## Before publishing (notes for us, not part of the issue)

- **Public issue or private report?** Symptom 2 puts one request's headers, cookies and session data
  into another request's record. `SECURITY.md` of the package asks for security issues to go by email
  to the maintainer (address in `vendor/fruitcake/laravel-debugbar/SECURITY.md`).
  - **Argument for a public issue:** anyone who can read record B through the open handler can read
    record A the same way. So no access boundary is crossed: the leak mislabels data rather than
    exposing new data, and Debugbar is a dev-only tool.
  - **Argument for a private report:** session data and cookies are involved. Some teams run Debugbar
    on shared staging servers.
  - Your call. If in doubt, a short email first costs little.
- **Re-run on a clean app before posting.** The steps above are the minimal version, but the evidence
  comes from our demo stand (route `/api/marker/{uuid}`). A run on a fresh
  `composer create-project` app would let the issue quote its own output.
- **Search existing issues first** for "octane clockwork" in fruitcake/laravel-debugbar and the old
  barryvdh/laravel-debugbar.
- **Check whether Swoole / RoadRunner reproduce it**, if we want to claim more than FrankenPHP.
