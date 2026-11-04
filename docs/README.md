# nuxt-backend-lens documentation

A Debugbar-like panel for Nuxt SPAs. For every request a page makes to the backend, it shows the
SQL, logs, cache events and timing the backend recorded, and it flags N+1 queries and duplicates.
Data comes from Clockwork or Laravel Debugbar, or from a plain `Server-Timing` header for any other
backend.

| Guide                                          | For                                                         |
|------------------------------------------------|-------------------------------------------------------------|
| [Getting started](getting-started.md)          | backend package, same-origin or CORS setup, the Nuxt module, staging builds |
| [Features](features.md)                        | what the toolbar, the DevTools tab and the Vue DevTools timeline show, and how issues are detected |
| [Configuration](configuration.md)              | every module option with its default                        |
| [Adapters](adapters.md)                        | the normalized model, the built-in adapters, writing your own |
| [Architecture](architecture.md)                | how the pieces fit, and why                                 |
| [Development](development.md)                  | workspace, demo stand, tests, CI, Nix                       |
| [Troubleshooting](troubleshooting.md)          | no badge, no debug data, DevTools authorization, …          |

Upstream findings: [Laravel Debugbar's Clockwork collector under Octane](upstream/laravel-debugbar-octane-clockwork.md)
(draft issue).
