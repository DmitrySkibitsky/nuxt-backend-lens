<?php

namespace Database\Seeders;

use App\Models\Author;
use App\Models\Book;
use App\Models\Review;
use Illuminate\Database\Seeder;

/**
 * Seeds a catalog large enough to make N+1 and duplicate queries clearly visible.
 */
class CatalogSeeder extends Seeder
{
    public function run(): void
    {
        Author::factory()
            ->count(20)
            ->create()
            ->each(function (Author $author): void {
                Book::factory()
                    ->count(fake()->numberBetween(3, 6))
                    ->for($author)
                    ->create()
                    ->each(function (Book $book): void {
                        $reviews = Review::factory()
                            ->count(fake()->numberBetween(0, 8))
                            ->for($book)
                            ->create();

                        $book->update(['rating' => round((float) $reviews->avg('stars'), 2)]);
                    });
            });
    }
}
