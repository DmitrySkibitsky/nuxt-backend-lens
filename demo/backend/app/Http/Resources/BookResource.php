<?php

namespace App\Http\Resources;

use App\Models\Book;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Book
 */
class BookResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * The author is read unconditionally on purpose: without eager loading this produces
     * the N+1 pattern the devtools module has to detect.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'published_year' => $this->published_year,
            'rating' => $this->rating,
            'author' => new AuthorResource($this->author),
        ];
    }
}
