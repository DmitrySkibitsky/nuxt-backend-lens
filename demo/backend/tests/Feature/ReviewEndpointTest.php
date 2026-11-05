<?php

namespace Tests\Feature;

use App\Events\ReviewCreated;
use App\Jobs\RecalculateBookRating;
use App\Models\Book;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class ReviewEndpointTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cannot_post_a_review(): void
    {
        $book = Book::factory()->create();

        $this->postJson("/api/books/{$book->id}/reviews", ['stars' => 5, 'body' => 'Great'])->assertUnauthorized();
    }

    public function test_user_posts_a_review_which_fires_event_and_queues_job(): void
    {
        Event::fake([ReviewCreated::class]);
        Queue::fake();

        $user = User::factory()->create();
        $book = Book::factory()->create();

        $this->actingAs($user)
            ->postJson("/api/books/{$book->id}/reviews", ['stars' => 4, 'body' => 'Solid read'])
            ->assertCreated()
            ->assertJsonPath('data.stars', 4)
            ->assertJsonPath('data.user_id', $user->id);

        $this->assertDatabaseHas('reviews', ['book_id' => $book->id, 'user_id' => $user->id, 'stars' => 4]);
        Event::assertDispatched(ReviewCreated::class);
        Queue::assertPushed(RecalculateBookRating::class, fn (RecalculateBookRating $job): bool => $job->bookId === $book->id);
    }

    public function test_review_validation(): void
    {
        $user = User::factory()->create();
        $book = Book::factory()->create();

        $this->actingAs($user)
            ->postJson("/api/books/{$book->id}/reviews", ['stars' => 9])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['stars', 'body']);
    }

    public function test_recalculate_job_updates_rating(): void
    {
        $book = Book::factory()->hasReviews(2, ['stars' => 4])->create();

        (new RecalculateBookRating($book->id))->handle();

        $this->assertSame('4.00', $book->fresh()->rating);
    }

    public function test_login_and_logout(): void
    {
        $user = User::factory()->create(['email' => 'demo@example.com']);

        // Sanctum starts a session only for requests coming from a stateful SPA domain.
        $this->withHeader('Referer', 'http://localhost/');

        $this->postJson('/api/login', ['email' => 'demo@example.com', 'password' => 'wrong'])
            ->assertUnprocessable();

        $this->postJson('/api/login', ['email' => 'demo@example.com', 'password' => 'password'])
            ->assertNoContent();

        $this->assertAuthenticatedAs($user, 'web');

        $this->postJson('/api/logout')->assertNoContent();

        $this->assertGuest('web');
    }

    public function test_login_attempts_are_rate_limited(): void
    {
        User::factory()->create(['email' => 'demo@example.com']);

        foreach (range(1, 10) as $attempt) {
            $this->postJson('/api/login', ['email' => 'demo@example.com', 'password' => 'wrong'])
                ->assertUnprocessable();
        }

        $this->postJson('/api/login', ['email' => 'demo@example.com', 'password' => 'password'])
            ->assertTooManyRequests();
    }
}
