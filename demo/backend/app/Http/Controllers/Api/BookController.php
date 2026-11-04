<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookResource;
use App\Models\Author;
use App\Models\Book;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class BookController extends Controller
{
    /**
     * Latest books. Without `?eager=1` every book lazy-loads its author (N+1 scenario).
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $books = Book::query()
            ->when($request->boolean('eager'), fn ($query) => $query->with('author'))
            ->latest('id')
            ->limit(30)
            ->get();

        return BookResource::collection($books);
    }

    /**
     * Catalog stats. Each metric re-runs the same count queries (duplicate queries scenario).
     */
    public function stats(): JsonResponse
    {
        return response()->json([
            'books' => Book::query()->count(),
            'authors' => Author::query()->count(),
            'books_per_author' => round(Book::query()->count() / max(Author::query()->count(), 1), 2),
            'rated_share' => round(Book::query()->where('rating', '>', 0)->count() / max(Book::query()->count(), 1), 2),
        ]);
    }
}
