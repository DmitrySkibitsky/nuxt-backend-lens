<?php

namespace Database\Factories;

use App\Models\Author;
use App\Models\Book;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Book>
 */
class BookFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'author_id' => Author::factory(),
            'title' => rtrim(fake()->sentence(fake()->numberBetween(2, 5)), '.'),
            'published_year' => fake()->numberBetween(1900, 2026),
            'rating' => 0,
        ];
    }
}
