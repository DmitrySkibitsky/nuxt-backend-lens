<?php

/*
|--------------------------------------------------------------------------
| Cross-Origin Resource Sharing (CORS) Configuration
|--------------------------------------------------------------------------
|
| The demo serves the SPA same-origin through the proxy, and also from a second origin
| (CROSS_ORIGIN_PORT) that calls this API directly. For that second origin to see debug data:
|   - the debug record endpoints (__clockwork/*, _debugbar/*) need CORS like the API itself;
|   - the debug id headers must be exposed, or browser JS cannot read them;
|   - credentials are allowed, so origins must be listed explicitly (no "*").
|
*/

return [

    'paths' => ['api/*', 'sanctum/csrf-cookie', '__clockwork/*', '_debugbar/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('CORS_ALLOWED_ORIGINS', '')),
    ))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => ['X-Clockwork-Id', 'X-Clockwork-Path', 'X-Clockwork-Version', 'phpdebugbar-id'],

    'max_age' => 0,

    'supports_credentials' => true,

];
