<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Lets an allowed cross-origin SPA read the Server-Timing header from resource timing entries.
 * Browsers hide `serverTiming` of cross-origin responses unless Timing-Allow-Origin names the page.
 */
class TimingAllowOrigin
{
    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $origin = $request->headers->get('Origin');

        if ($origin !== null && in_array($origin, config('cors.allowed_origins', []), true)) {
            $response->headers->set('Timing-Allow-Origin', $origin);
        }

        return $response;
    }
}
