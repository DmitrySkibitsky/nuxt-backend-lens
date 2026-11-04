#!/bin/sh
# Demo backend entrypoint.
#
#   BACKEND_MODE=octane     - Laravel Octane on FrankenPHP worker mode (long-lived workers, the main target)
#   BACKEND_MODE=classic    - FrankenPHP classic mode (fresh bootstrap per request, the PHP-FPM-like baseline)
#
#   DEBUG_BACKEND=clockwork - Clockwork serves the Clockwork protocol
#   DEBUG_BACKEND=debugbar  - Laravel Debugbar serves it through its Clockwork emulation
#   (unset)                 - nothing is touched, e.g. for the test suite
#
# `serve` starts the HTTP server; any other command is executed as is (e.g. `php artisan queue:work`).
set -e

case "${DEBUG_BACKEND:-}" in
    clockwork)
        export CLOCKWORK_ENABLE=true DEBUGBAR_ENABLED=false
        ;;
    debugbar)
        # Open storage: the record endpoint must answer requests that do not come from localhost.
        export CLOCKWORK_ENABLE=false DEBUGBAR_ENABLED=true DEBUGBAR_CLOCKWORK=true DEBUGBAR_OPEN_STORAGE=true
        ;;
    "")
        ;;
    *)
        echo "Unknown DEBUG_BACKEND: ${DEBUG_BACKEND}" >&2
        exit 1
        ;;
esac

if [ "$1" != "serve" ]; then
    exec "$@"
fi

mkdir -p /tmp/caddy/config /tmp/caddy/data

case "${BACKEND_MODE:-octane}" in
    octane)
        exec php artisan octane:frankenphp \
            --host=0.0.0.0 \
            --port=8000 \
            --workers="${OCTANE_WORKERS:-4}" \
            --max-requests="${OCTANE_MAX_REQUESTS:-500}" \
            --log-level=info
        ;;
    classic)
        exec frankenphp php-server --listen 0.0.0.0:8000 --root public/
        ;;
    *)
        echo "Unknown BACKEND_MODE: ${BACKEND_MODE}" >&2
        exit 1
        ;;
esac
