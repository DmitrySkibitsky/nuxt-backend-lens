# Demo backend image: FrankenPHP (worker mode via Octane, or classic per-request mode).
# The application source is bind-mounted at /app by docker-compose, so this image only carries PHP itself.
FROM dunglas/frankenphp:1-php8.5

RUN install-php-extensions pdo_pgsql pdo_sqlite pcntl intl zip opcache

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Caddy (embedded in FrankenPHP) writes its state to XDG dirs; keep them writable for a non-root user.
ENV XDG_CONFIG_HOME=/tmp/caddy/config \
    XDG_DATA_HOME=/tmp/caddy/data

COPY backend-entrypoint.sh /usr/local/bin/backend-entrypoint
RUN chmod 0755 /usr/local/bin/backend-entrypoint

WORKDIR /app

ENTRYPOINT ["backend-entrypoint"]
CMD ["serve"]
