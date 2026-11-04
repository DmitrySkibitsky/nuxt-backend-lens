<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookResource;
use App\Models\Book;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Endpoints whose only purpose is to produce a specific kind of debug data.
 */
class ScenarioController extends Controller
{
    private const string TOP_BOOKS_CACHE_KEY = 'demo:top-books';

    /**
     * A deliberately slow query (~300 ms on PostgreSQL / MySQL).
     */
    public function slow(): JsonResponse
    {
        $sql = match (DB::connection()->getDriverName()) {
            'pgsql' => 'select pg_sleep(0.3) is not null as slept',
            'mysql', 'mariadb' => 'select sleep(0.3) = 0 as slept',
            default => 'with recursive n(i) as (select 1 union all select i + 1 from n where i < 200000) select count(*) > 0 as slept from n',
        };

        return response()->json(['slept' => (bool) DB::selectOne($sql)->slept]);
    }

    /**
     * Top books through the cache: miss on the first call (or with `?fresh=1`), hit afterwards.
     */
    public function cached(Request $request): JsonResponse
    {
        if ($request->boolean('fresh')) {
            Cache::forget(self::TOP_BOOKS_CACHE_KEY);
        }

        $wasCached = Cache::has(self::TOP_BOOKS_CACHE_KEY);

        $books = Cache::remember(
            self::TOP_BOOKS_CACHE_KEY,
            now()->addMinutes(5),
            fn () => BookResource::collection(
                Book::query()->with('author')->orderByDesc('rating')->limit(5)->get()
            )->resolve(),
        );

        return response()->json(['cache_hit' => $wasCached, 'data' => $books]);
    }

    /**
     * Log entries of several levels.
     */
    public function logs(): JsonResponse
    {
        Log::debug('Demo debug message', ['scenario' => 'logs']);
        Log::info('Demo info message', ['books' => Book::query()->count()]);
        Log::warning('Demo warning message');
        Log::error('Demo error message', ['reason' => 'just a demo']);

        return response()->json(['logged' => 4]);
    }

    /**
     * An unhandled exception that ends in a 500.
     */
    public function boom(): never
    {
        Book::query()->first();

        throw new RuntimeException('Demo exception from /api/boom');
    }

    /**
     * Stands in for a backend without Clockwork or Debugbar (both exclude this URI): it reports its
     * own timing through a Server-Timing header, which the lens's server-timing adapter reads.
     */
    public function timingOnly(Request $request): JsonResponse
    {
        // Per-request start: LARAVEL_START is defined once per Octane worker, not per request.
        $requestStarted = (float) $request->server('REQUEST_TIME_FLOAT', microtime(true));

        $started = microtime(true);
        $books = Book::query()->count();
        $databaseMs = (microtime(true) - $started) * 1000;

        $response = response()->json(['books' => $books]);
        $totalMs = (microtime(true) - $requestStarted) * 1000;

        return $response->header('Server-Timing', sprintf(
            'db;dur=%.2f;desc="Database", total;dur=%.2f;desc="Total"',
            $databaseMs,
            $totalMs,
        ));
    }

    /**
     * Runs a single query carrying the given marker. The Octane leak test checks that every debug
     * record contains exactly its own marker and nothing from other requests.
     */
    public function marker(Request $request, string $marker): JsonResponse
    {
        $sleepMs = min($request->integer('sleep_ms'), 1000);

        if ($sleepMs > 0) {
            usleep($sleepMs * 1000);
        }

        $row = DB::selectOne('select ? as marker', [$marker]);

        Log::info('marker', ['marker' => $marker]);

        return response()->json(['marker' => $row->marker]);
    }
}
