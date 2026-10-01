# BookScrape Gateway

Production-grade NestJS RESTful API reverse-engineering [books.toscrape.com](https://books.toscrape.com) featuring atomic Redis catalogue synchronization, in-process single-flight request deduplication, resilient error handling, multi-token AND search ranking, rate limiting, and automated health diagnostics.

---

## 1. Architecture Overview

```mermaid
flowchart TD
    subgraph Clients
        WebClient[Web / Mobile Clients]
        CheckScript["scripts/api-check.ts"]
    end

    subgraph BookScrape Gateway (NestJS)
        Middleware["RequestIdMiddleware\n(Correlation ID: X-Request-Id)"]
        Throttler["ThrottlerGuard\n(100 req/60s, /health exempt)"]
        PinoLogger["Pino HTTP Logger\n(Structured JSON, Redaction)"]
        
        BooksController["BooksController\n(/books, /books/search, /books/:id)"]
        CatController["CategoriesController\n(/categories)"]
        HealthController["HealthController\n(/health)"]

        QueryEngine["Query Engine\n(Filter, Stable Sort, AND Search)"]
        CatService["CatalogueService\n(In-memory snapshot, Stale fallback)"]
        DetailService["BookDetailService\n(Single-flight deduplication)"]
        SyncService["SyncService\n(Site crawler, count validation)"]
        SyncLock["SyncLock\n(Distributed Redis SET NX EX)"]
    end

    subgraph Data Store & Upstream
        Redis[(Docker Redis:6379\nContainer: redis)]
        LiveSite["books.toscrape.com\n(ScraperClient + p-limit)"]
    end

    Clients --> Middleware --> Throttler --> PinoLogger
    PinoLogger --> BooksController & CatController & HealthController

    BooksController --> QueryEngine & DetailService
    CatController --> CatService
    HealthController --> CatService & SyncService & Redis

    QueryEngine --> CatService
    DetailService --> CatService
    DetailService --> Redis
    DetailService -. Lazy Scrape .-> LiveSite

    SyncService --> SyncLock --> Redis
    SyncService --> LiveSite
    SyncService -. Atomic RENAME .-> Redis
```

---

## 2. Quickstart (≤ 5 Commands)

```bash
# 1. Start dedicated Redis container (named 'redis' on port 6379)
npm run redis:up

# 2. Install dependencies
npm install

# 3. Perform full catalogue crawl and sync into Redis
npm run sync

# 4. Start the application in development mode
npm run start:dev

# 5. In a separate terminal, run the autonomous test script
npm run api:check
```

The server is available at **`http://localhost:3000/api/v1`**, and interactive Swagger documentation is available at **`http://localhost:3000/docs`**.

---

## 3. Configuration Reference (`.env`)

Copy `.env.example` to `.env`. All environment variables are validated at bootstrap via Zod:

| Variable | Type | Default | Description |
|---|---|---|---|
| `PORT` | `number` | `3000` | Port for the HTTP server |
| `NODE_ENV` | `string` | `development` | Environment (`development`, `production`, `test`) |
| `REDIS_URL` | `string` | `redis://localhost:6379` | Connection URI for Redis |
| `REDIS_DB` | `number` | `0` | Database index (isolated `15` is used for tests) |
| `KEY_PREFIX` | `string` | `bsg:v1:` | Namespace prefix for Redis keys |
| `SOURCE_BASE_URL` | `string` | `https://books.toscrape.com` | Base URL of the scrape target |
| `USER_AGENT` | `string` | `bookscrape-gateway/1.0` | User-Agent header for upstream requests |
| `HTTP_TIMEOUT_MS` | `number` | `10000` | Outbound request timeout (ms) |
| `HTTP_MAX_RETRIES` | `number` | `3` | Max retry attempts for transient upstream failures |
| `HTTP_CONCURRENCY` | `number` | `2` | Politeness limit: max concurrent upstream requests |
| `HTTP_DELAY_MS` | `number` | `300` | Politeness limit: delay between upstream requests |
| `DETAIL_TTL_SECONDS`| `number` | `604800` | Cache TTL for book details (7 days) |
| `SNAPSHOT_TTL_SECONDS`| `number` | `60` | In-memory catalogue snapshot TTL |
| `SYNC_LOCK_TTL_SECONDS`| `number`| `900` | Distributed sync lock timeout (15 minutes) |
| `AUTO_SYNC_ON_BOOT`| `boolean`| `true` | Trigger background sync crawl if Redis is empty |
| `THROTTLE_TTL` | `number` | `60` | Rate limiter window in seconds |
| `THROTTLE_LIMIT` | `number` | `100` | Max requests per IP per throttle window |

---

## 4. API Endpoints & `curl` Examples

### 4.1 Health Check & Diagnostic Status
```bash
curl -X GET http://localhost:3000/api/v1/health
```
**Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2026-10-02T03:00:00.000Z",
  "version": "1.0.0",
  "catalogue": { "status": "ready", "total": 1000, "builtAt": "2026-10-02T02:50:00.000Z" },
  "sync": { "state": "ready", "lastSync": "2026-10-02T02:50:00.000Z", "bookCount": 1000 },
  "redis": { "connected": true, "latencyMs": 2 }
}
```

### 4.2 List Books (Filtered, Sorted & Paginated)
```bash
curl -X GET "http://localhost:3000/api/v1/books?page=1&limit=20&category=travel&minPrice=10&maxPrice=50&rating=4&sort=price&order=asc"
```
- Every data response carries the `X-Cache: HIT | MISS | STALE` header.
- `sort=default` strictly preserves the source website's natural catalogue ordering (1..1000).
- Pages beyond the available range return `200 OK` with `data: []` and accurate `meta`.

### 4.3 Search Books by Title
```bash
curl -X GET "http://localhost:3000/api/v1/books/search?q=light%20attic&page=1&limit=10"
```
- Normalized multi-token AND matching across titles (case-insensitive, diacritics stripped).
- Ranks results: exact title match > prefix title match > full phrase substring match > token match.

### 4.4 Get Book Details (Lazy Scrape & Single-Flight)
```bash
curl -X GET http://localhost:3000/api/v1/books/a-light-in-the-attic_1000
```
- First request lazily scrapes the upstream detail page (`X-Cache: MISS`).
- Subsequent requests serve from Redis (`X-Cache: HIT`).
- Unknown book IDs immediately return `404 Not Found` with zero upstream requests.

### 4.5 List Categories
```bash
curl -X GET http://localhost:3000/api/v1/categories
```
- Returns all categories sorted alphabetically with genuine book counts computed from category subpages.

---

## 5. Architectural & Design Decisions

1. **Two-Stage Data Architecture (Sync vs. Lazy Fetch)**:
   - **Catalogue (Metadata & Listings)**: Crawled atomically during sync and saved as an authoritative catalogue snapshot.
   - **Detail Pages**: Lazily fetched on first request and cached in Redis with a 7-day TTL (`DETAIL_TTL_SECONDS`).
2. **In-Process Single-Flight Deduplication**:
   - Concurrent requests for the same un-cached book ID are deduplicated using an in-memory `Map<string, Promise<BookDetail>>`. If 10 clients concurrently request the same book, exactly 1 upstream scrape occurs.
3. **Atomic Publication via Redis Temporary Keys**:
   - The crawler builds the complete dataset, verifies total counts, writes to `catalogue:tmp`, and executes an atomic Redis `RENAME catalogue:tmp catalogue`. An interrupted crawl never corrupts the active catalogue.
4. **Distributed Sync Lock**:
   - Synchronous crawls are protected via Redis `SET lock:sync <token> NX EX 900`. Lock release uses an atomic Lua script verifying token ownership to prevent clearing expired or reacquired locks.
5. **Route Precedence Defense**:
   - `/books/search` is declared explicitly before `/books/:id` in `BooksController` to prevent NestJS route shadowing.
6. **Strict Security Validation**:
   - All `:id` parameters are validated against `^[a-z0-9-]+_\d+$` via `BookIdPipe`, neutralizing path traversal (`../../`), URL scheme injection, and open-proxy abuse.

---

## 6. Failure Behavior & Runbooks

| Scenario | System Behavior |
|---|---|
| **Redis Outage** | The service falls back to in-memory cached snapshots with `X-Cache: STALE`. Book detail requests fall back to direct on-demand scraping without caching. The `/health` endpoint reports `status: "degraded"` with `redis.connected: false`. |
| **Upstream Site Outage (5xx / Timeout)** | The client retries 3 times with exponential backoff and jitter. If upstream remains unreachable, the gateway responds with standard `502 Bad Gateway` (`UPSTREAM_FAILURE`) or `504 Gateway Timeout` (`UPSTREAM_TIMEOUT`). |
| **Cold Start / Empty Redis** | If `AUTO_SYNC_ON_BOOT=true`, the gateway launches an asynchronous background crawl. Endpoints return `503 Service Unavailable` with `Retry-After: 10` and code `CATALOGUE_NOT_READY` until the catalogue is published. |
| **Sync Killed Mid-Crawl** | The temporary key `catalogue:tmp` is discarded, the active catalogue remains untouched, and the distributed lock expires automatically after `SYNC_LOCK_TTL_SECONDS`. |

---

## 7. Testing Suite

The codebase enforces a comprehensive offline testing pipeline using recorded DOM fixtures:

```bash
# Run unit & contract tests (135 tests)
npm test

# Run end-to-end integration tests (32 tests)
npm run test:e2e

# Run test coverage report (enforces ≥ 90% on core services/parsers)
npm run test:cov

# Run autonomous check against a running server
npm run api:check
```

---

## 8. Docker Deployment

### Run Complete Stack (Gateway + Redis)
```bash
docker compose up -d --build
```

### Run Standalone Redis Only (For External Projects)
```bash
npm run redis:up
```

---

## 9. Limitations

See [`docs/LIMITATIONS.md`](file:///e:/Assignment_Projects/bookscrape-getway-razorpay-assignment/docs/LIMITATIONS.md) for technical trade-offs, upstream dependencies, and recommended long-term production remedies.
