<?php

namespace App\Jobs;

use App\Models\Book;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class RecalculateBookRating implements ShouldQueue
{
    use Queueable;

    public function __construct(public int $bookId) {}

    public function handle(): void
    {
        $book = Book::query()->find($this->bookId);

        if ($book === null) {
            return;
        }

        $book->update(['rating' => round((float) $book->reviews()->avg('stars'), 2)]);
    }
}
