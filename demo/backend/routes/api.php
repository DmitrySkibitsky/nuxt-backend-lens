<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BookController;
use App\Http\Controllers\Api\ReviewController;
use App\Http\Controllers\Api\ScenarioController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login'])->name('login');
Route::post('/logout', [AuthController::class, 'logout'])->name('logout');

Route::get('/user', fn (Request $request) => $request->user())->middleware('auth:sanctum')->name('user');

Route::get('/books', [BookController::class, 'index'])->name('books.index');
Route::get('/stats', [BookController::class, 'stats'])->name('stats');
Route::post('/books/{book}/reviews', [ReviewController::class, 'store'])
    ->middleware('auth:sanctum')
    ->name('books.reviews.store');

Route::controller(ScenarioController::class)->group(function (): void {
    Route::get('/slow', 'slow')->name('scenarios.slow');
    Route::get('/cached', 'cached')->name('scenarios.cached');
    Route::get('/logs', 'logs')->name('scenarios.logs');
    Route::get('/boom', 'boom')->name('scenarios.boom');
    Route::get('/marker/{marker}', 'marker')->whereUuid('marker')->name('scenarios.marker');
});
