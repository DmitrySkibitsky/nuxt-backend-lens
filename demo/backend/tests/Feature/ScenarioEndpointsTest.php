<?php

namespace Tests\Feature;

use App\Models\Author;
use App\Models\Book;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class ScenarioEndpointsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Author::factory()->count(5)->has(Book::factory()->count(4))->create();
    }

    /**
     * Runs the callback and returns the SQL statements it executed.
     *
     * @return list<string>
     */
    private function captureQueries(callable $callback): array
    {
        DB::flushQueryLog();
        DB::enableQueryLog();

        $callback();

        $queries = array_column(DB::getQueryLog(), 'query');
        DB::disableQueryLog();

        return $queries;
    }

    public function test_books_without_eager_loading_produce_n_plus_one(): void
    {
        $queries = $this->captureQueries(function (): void {
            $this->getJson('/api/books')->assertOk()->assertJsonCount(20, 'data');
        });

        $this->assertCount(1 + 20, $queries);
    }

    public function test_books_with_eager_loading_use_two_queries(): void
    {
        $queries = $this->captureQueries(function (): void {
            $this->getJson('/api/books?eager=1')
                ->assertOk()
                ->assertJsonCount(20, 'data')
                ->assertJsonStructure(['data' => [['id', 'title', 'published_year', 'rating', 'author' => ['id', 'name']]]]);
        });

        $this->assertCount(2, $queries);
    }

    public function test_stats_repeat_identical_queries(): void
    {
        $queries = $this->captureQueries(function (): void {
            $this->getJson('/api/stats')->assertOk()->assertJson(['books' => 20, 'authors' => 5]);
        });

        $duplicates = array_filter(array_count_values($queries), fn (int $count): bool => $count > 1);

        $this->assertNotEmpty($duplicates);
    }

    public function test_slow_endpoint_runs(): void
    {
        $this->getJson('/api/slow')->assertOk()->assertJson(['slept' => true]);
    }

    public function test_cached_endpoint_misses_then_hits(): void
    {
        $this->getJson('/api/cached?fresh=1')->assertOk()->assertJson(['cache_hit' => false])->assertJsonCount(5, 'data');
        $this->getJson('/api/cached')->assertOk()->assertJson(['cache_hit' => true]);
    }

    public function test_logs_endpoint_writes_entries(): void
    {
        $this->getJson('/api/logs')->assertOk()->assertJson(['logged' => 4]);
    }

    public function test_boom_endpoint_returns_server_error(): void
    {
        $this->getJson('/api/boom')->assertServerError();
    }

    public function test_marker_endpoint_echoes_marker_through_the_database(): void
    {
        $marker = (string) Str::uuid();

        $queries = $this->captureQueries(function () use ($marker): void {
            $this->getJson("/api/marker/{$marker}")->assertOk()->assertExactJson(['marker' => $marker]);
        });

        $this->assertSame(['select ? as marker'], $queries);
    }

    public function test_timing_only_endpoint_reports_its_own_server_timing(): void
    {
        $response = $this->getJson('/api/timing-only')->assertOk()->assertJson(['books' => 20]);

        $this->assertMatchesRegularExpression(
            '/^db;dur=\d+\.\d{2};desc="Database", total;dur=\d+\.\d{2};desc="Total"$/',
            (string) $response->headers->get('Server-Timing'),
        );
    }

    public function test_marker_endpoint_rejects_non_uuid(): void
    {
        $this->getJson('/api/marker/not-a-uuid')->assertNotFound();
    }
}
