<?php

namespace App\Http\Controllers\Api;

use App\Events\ReviewCreated;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreReviewRequest;
use App\Http\Resources\ReviewResource;
use App\Jobs\RecalculateBookRating;
use App\Models\Book;
use Illuminate\Http\JsonResponse;

class ReviewController extends Controller
{
    /**
     * Writes a review, fires an event and queues a job (write / events / queue scenario).
     */
    public function store(StoreReviewRequest $request, Book $book): JsonResponse
    {
        $review = $book->reviews()->create([
            ...$request->validated(),
            'user_id' => $request->user()->id,
        ]);

        ReviewCreated::dispatch($review);
        RecalculateBookRating::dispatch($book->id);

        return (new ReviewResource($review))->response()->setStatusCode(201);
    }
}
