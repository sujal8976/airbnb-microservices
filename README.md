# Waypost — Airbnb-style Booking Marketplace (Microservices)

A full end-to-end home-stay marketplace built as 6 independent services
plus a React frontend. Built to be a realistic, runnable reference for
microservices patterns: database-per-service, sync REST for
read-immediately needs, async events for everything decoupled, a
distributed lock for a real race condition, and a service that talks to
*nobody* directly (Notification) to show pure event-driven design.

---

## Table of contents

1. [Architecture diagram](#1-architecture-diagram)
2. [Services at a glance](#2-services-at-a-glance)
3. [Data model / database-per-service](#3-data-model--database-per-service)
4. [API reference (routing)](#4-api-reference-routing)
5. [Event catalog (RabbitMQ)](#5-event-catalog-rabbitmq)
6. [How a booking actually works, step by step](#6-how-a-booking-actually-works-step-by-step)
7. [Preventing double-booking](#7-preventing-double-booking)
8. [State machines](#8-state-machines)
9. [Caching strategy](#9-caching-strategy)
10. [Auth](#10-auth)
11. [Running it](#11-running-it)
12. [Project structure](#12-project-structure)
13. [Design decisions & tradeoffs](#13-design-decisions--tradeoffs)
14. [What's intentionally simplified](#14-whats-intentionally-simplified)

---

## 1. Architecture diagram

```
                                    ┌─────────────────────────┐
                                    │        Frontend          │
                                    │   React + Vite  :5173    │
                                    │        "Waypost"         │
                                    └────┬───┬───┬───┬─────────┘
                                         │   │   │   │
                     REST                │   │   │   │  REST
              ┌──────────────────────────┘   │   │   └──────────────────────┐
              │                    ┌──────────┘   └──────────┐              │
              ▼                    ▼                          ▼              ▼
    ┌──────────────────┐  ┌──────────────────┐      ┌──────────────────┐  ┌──────────────────┐
    │   User Service    │  │  Listing Service  │      │  Search Service   │  │ Booking Service  │
    │      :4001        │  │      :4002        │      │      :4003        │  │      :4004       │
    │  register / login  │  │  CRUD listings    │      │  search / filter  │  │  create booking  │
    │  JWT issuing        │  │                    │      │                    │  │  cancel booking  │
    │                    │  │  ┌──────────────┐  │      │  ┌──────────────┐  │  │                  │
    │  Postgres:user_db  │  │  │ Redis cache  │  │      │  │ Redis cache  │  │  │ Postgres:        │
    │                    │  │  └──────────────┘  │      │  └──────────────┘  │  │  booking_db      │
    └─────────┬──────────┘  │  Postgres:         │      │  Postgres:         │  │ ┌──────────────┐ │
              │             │   listing_db       │      │   search_db        │  │ │ Redis LOCK   │ │
              │             └─────────┬──────────┘      └─────────▲──────────┘  │ └──────────────┘ │
              │                       │                            │             └───┬──────┬───────┘
              │                       │ listing.created             │ consumes         │      │
              │                       │ listing.updated ────────────┘ listing.*        │      │
              │                       │ listing.deleted                                │      │
              │                       ▼                                                │      │
              │             ┌──────────────────────────────────────────────┐           │      │
              │             │      RabbitMQ topic exchange "airbnb.events"  │◀──────────┘      │
              │◀────────────┤                                                │◀─────────────────┘
   user.registered          │   every service below publishes AND/OR        │  payment.requested
   (published on             consumes here — nobody calls Notification      │
    register)                directly, it only listens                     │
              │             └───┬───────────────────────┬────────────────┬─┘
              │                 │ consumes               │ consumes       │ payment.success
              │                 │ user.registered         │ booking.*      │ payment.failed
              │                 │ booking.confirmed        │ payment.*      │ (published back)
              │                 │ booking.failed            │                │
              │                 │ booking.cancelled          │                ▼
              │                 │ payment.success              │   ┌──────────────────┐
              │                 │ payment.failed                 ▼  │  Payment Service │
              │                 ▼                        ┌──────────────────┐  :4005    │
              │        ┌──────────────────────┐          │ (consumes         │           │
              │        │ Notification Service  │          │  payment.requested,│ Postgres: │
              │        │       :4006            │          │  publishes result) │ payment_db│
              │        │  (event listener only  │          └──────────────────┘           │
              │        │   — no inbound REST     │                                          │
              │        │   calls from any        │◀── GET /users/:id ──────────────────────┘
              │        │   other service)         │    GET /listings/:id
              │        │  Postgres:                │    (sync REST, dashed lines above =
              │        │   notification_db          │     Booking calling out synchronously)
              │        └──────────────────────────┘
              │
              └── GET /users/:id  ◀── called synchronously by Booking Service
```

**Legend**
- **Solid arrows into the exchange** = a service *publishes* an event (fire-and-forget).
- **Solid arrows out of the exchange** = a service *consumes* (subscribes to) an event.
- **Direct arrows between two services** (User↔Booking, Listing↔Booking) = synchronous REST calls, used only where an immediate answer is required.
- Every service owns its own Postgres database — no service reaches into another's tables.

---

## 2. Services at a glance

| # | Service | Port | Owns | Talks to (sync) | Publishes (async) | Consumes (async) |
|---|---|---|---|---|---|---|
| 1 | **User** | 4001 | `user_db` | — | `user.registered` | — |
| 2 | **Listing** | 4002 | `listing_db`, Redis cache | — | `listing.created`, `listing.updated`, `listing.deleted` | — |
| 3 | **Search** | 4003 | `search_db`, Redis cache | — | — | `listing.created`, `listing.updated`, `listing.deleted` |
| 4 | **Booking** | 4004 | `booking_db`, Redis lock | Listing (`GET /listings/:id`), User (`GET /users/:id`) | `payment.requested`, `booking.confirmed`, `booking.failed`, `booking.cancelled` | `payment.success`, `payment.failed` |
| 5 | **Payment** | 4005 | `payment_db` | — | `payment.success`, `payment.failed` | `payment.requested` |
| 6 | **Notification** | 4006 | `notification_db` | — | — | `user.registered`, `booking.confirmed`, `booking.failed`, `booking.cancelled`, `payment.success`, `payment.failed` |

**Why each service exists as its own service (not folded into another):**

- **User** is identity — every other service needs to trust "this user exists" without owning auth itself.
- **Listing** is the write-heavy CRUD "product catalog" — hosts editing their own places.
- **Search** is split from Listing on purpose: search read patterns (filtering, high query volume, tolerant of slight staleness) are completely different from Listing's CRUD read/write patterns. Scaling and caching them independently is the point.
- **Booking** is the transactional core — the only service that needs a distributed lock and cross-service validation before writing.
- **Payment** is isolated because it's the most likely piece to be swapped for a real gateway (Stripe, etc.) later, and because "payment processing" has fundamentally different failure modes (timeouts, retries, idempotency) than the rest.
- **Notification** exists purely to prove out event-driven decoupling — it can be deleted, replaced, or crashed without any other service knowing or caring.

---

## 3. Data model / database-per-service

Each service owns one Postgres database. No cross-database joins, no shared tables. `init-db/init.sql` creates all six on first Postgres boot.

```
user_db
└── users(id UUID PK, name, email UNIQUE, password_hash, role, created_at)

listing_db
└── listings(id UUID PK, host_id, title, description, price, location,
              amenities TEXT[], images TEXT[], available_from, available_to,
              is_active, created_at, updated_at)

search_db
└── listings_search(id UUID PK, host_id, title, description, price, location,
                      amenities TEXT[], images TEXT[], available_from, available_to,
                      is_active, updated_at)
    -- denormalized copy of `listings`, kept in sync via listing.* events
    -- indexed on lower(location), price, (available_from, available_to)

booking_db
└── bookings(id UUID PK, listing_id, guest_id, host_id, start_date, end_date,
             total_price, status, created_at, updated_at)
    -- partial index on (listing_id, start_date, end_date) WHERE status IN ('pending','confirmed')

payment_db
└── payments(id UUID PK, booking_id, guest_id, amount, status, created_at)

notification_db
└── notifications(id UUID PK, user_id, type, message, status, created_at)
    -- history/audit trail of every mock notification sent
```

`listings_search` deliberately duplicates data from `listings`. That
duplication *is* the pattern — Search never queries Listing's database or
calls it over REST for read traffic; it keeps its own eventually-consistent
copy, updated by consuming `listing.*` events.

---

## 4. API reference (routing)

### User Service — `:4001`

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| GET | `/health` | — | — | Liveness check |
| POST | `/auth/register` | — | `{ name, email, password, role }` | Creates a user, returns `{ user, token }`. Publishes `user.registered`. |
| POST | `/auth/login` | — | `{ email, password }` | Returns `{ user, token }` |
| GET | `/me` | Bearer JWT | — | Returns the authenticated user's profile |
| GET | `/users/:id` | — | — | Public/internal lookup — used by Booking Service to verify a guest exists |

### Listing Service — `:4002`

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| GET | `/health` | — | — | Liveness check |
| POST | `/listings` | Bearer JWT (host/both) | `{ title, description, price, location, amenities[], images[], availableFrom, availableTo }` | Creates a listing. Publishes `listing.created`. |
| GET | `/listings/:id` | — | — | Fetches one listing. **Cache-aside via Redis** (`X-Cache: HIT/MISS` header shows it). Used synchronously by Booking Service. |
| GET | `/listings?hostId=` | — | — | Lists a host's listings (or latest 50 if no `hostId`) |
| PUT | `/listings/:id` | Bearer JWT (owner only) | partial listing fields | Updates a listing, invalidates cache, publishes `listing.updated` |
| DELETE | `/listings/:id` | Bearer JWT (owner only) | — | Soft-deletes (`is_active=false`), invalidates cache, publishes `listing.deleted` |

### Search Service — `:4003`

| Method | Path | Auth | Query params | Description |
|---|---|---|---|---|
| GET | `/health` | — | — | Liveness check |
| GET | `/search` | — | `location, startDate, endDate, minPrice, maxPrice` | Searches `listings_search`. **Cached in Redis with a 30s TTL** per unique query. |

### Booking Service — `:4004`

| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| GET | `/health` | — | — | Liveness check |
| POST | `/bookings` | Bearer JWT | `{ listingId, startDate, endDate }` | Acquires Redis lock → validates listing (sync REST) → validates guest (sync REST) → checks overlap → inserts `pending` booking → publishes `payment.requested` → releases lock → returns `202` immediately |
| GET | `/bookings/:id` | Bearer JWT | — | Fetch one booking |
| GET | `/bookings` | Bearer JWT | — | All bookings where the caller is guest OR host |
| POST | `/bookings/:id/cancel` | Bearer JWT (guest or host) | — | Cancels a booking, publishes `booking.cancelled` |

### Payment Service — `:4005`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Liveness check |
| GET | `/payments/booking/:bookingId` | — | Polls the latest payment record for a booking (optional convenience endpoint — the real outcome is delivered via events) |

*(Payment has no create endpoint — it only reacts to `payment.requested` events. This is intentional: nothing should be able to trigger a charge except the booking flow itself.)*

### Notification Service — `:4006`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | Liveness check |
| GET | `/notifications/:userId` | — | Optional history/activity feed. **Nothing else in the system depends on this endpoint existing** — it's the only inbound route Notification has, and it's read-only. |

---

## 5. Event catalog (RabbitMQ)

All events go through a single **topic exchange**: `airbnb.events`.
Each service declares its own durable queue and binds it to the routing
keys it cares about — this is standard fan-out/pub-sub, so adding a new
consumer never requires changing the publisher.

| Routing key | Published by | Consumed by | Payload |
|---|---|---|---|
| `user.registered` | User | Notification | `{ userId, name, email }` |
| `listing.created` | Listing | Search | full listing DTO |
| `listing.updated` | Listing | Search | full listing DTO |
| `listing.deleted` | Listing | Search | `{ id }` |
| `payment.requested` | Booking | Payment | `{ bookingId, guestId, amount }` |
| `payment.success` | Payment | Booking, Notification | `{ bookingId, guestId, paymentId, amount, status }` |
| `payment.failed` | Payment | Booking, Notification | `{ bookingId, guestId, paymentId, amount, status }` |
| `booking.confirmed` | Booking | Notification | `{ bookingId, guestId, hostId, listingId, startDate, endDate, totalPrice }` |
| `booking.failed` | Booking | Notification | same shape as above |
| `booking.cancelled` | Booking | Notification | full booking DTO |

Each consumer queue is named `<service>-service.<purpose>` (e.g.
`search-service.listing-events`) and messages are acked only after the
handler succeeds — a failed handler `nack`s without requeue, so a bad
message doesn't infinite-loop the queue.

---

## 6. How a booking actually works, step by step

```
Guest (frontend)          Booking Svc            Redis        Listing Svc      User Svc      RabbitMQ           Payment Svc         Notification Svc
      │                        │                    │               │              │              │                    │                    │
      │  POST /bookings        │                    │               │              │              │                    │                    │
      ├───────────────────────▶│                    │               │              │              │                    │                    │
      │                        │  SET NX PX lock:listing:{id}        │              │              │                    │                    │
      │                        ├───────────────────▶│               │              │              │                    │                    │
      │                        │◀── OK (acquired) ──┤               │              │              │                    │                    │
      │                        │                    │               │              │              │                    │                    │
      │                        │  GET /listings/:id (sync REST)      │              │              │                    │                    │
      │                        ├────────────────────────────────────▶│              │              │                    │                    │
      │                        │◀── price, availability window ──────┤              │              │                    │                    │
      │                        │                    │               │              │              │                    │                    │
      │                        │  GET /users/:id (sync REST)                        │              │                    │                    │
      │                        ├───────────────────────────────────────────────────▶│              │                    │                    │
      │                        │◀── guest confirmed ─────────────────────────────────┤              │                    │                    │
      │                        │                    │               │              │              │                    │                    │
      │                        │  overlap check against own booking_db (SQL)         │              │                    │                    │
      │                        │  INSERT booking status='pending'                    │              │                    │                    │
      │                        │                    │               │              │              │                    │                    │
      │                        │  publish "payment.requested"                        │              │                    │                    │
      │                        ├──────────────────────────────────────────────────────────────────▶│                    │                    │
      │                        │  DEL lock (Lua script, token-checked)               │              │                    │                    │
      │                        ├───────────────────▶│               │              │              │                    │                    │
      │◀── 202 pending ────────┤                    │               │              │              │                    │                    │
      │  (frontend starts      │                    │               │              │              │                    │                    │
      │   polling)              │                    │               │              │              │  consumes payment.requested ─────────────▶│
      │                        │                    │               │              │              │                    │  simulate ~800ms    │
      │                        │                    │               │              │              │                    │  processing, insert │
      │                        │                    │               │              │              │                    │  payment row,       │
      │                        │                    │               │              │              │                    │  ~90% succeed       │
      │                        │                    │               │              │              │◀── publish payment.success/failed ────────┤
      │                        │  consumes payment.success/failed                    │              │                    │                    │
      │                        │◀─────────────────────────────────────────────────────────────────┤                    │                    │
      │                        │  UPDATE booking SET status='confirmed'/'failed'     │              │                    │                    │
      │                        │  publish booking.confirmed/booking.failed           │              │                    │                    │
      │                        ├──────────────────────────────────────────────────────────────────────────────────────────────────────────▶│
      │                        │                    │               │              │              │                    │  send mock email    │
      │                        │                    │               │              │              │                    │  to guest AND host  │
      │  GET /bookings (poll)  │                    │               │              │              │                    │  insert notification │
      ├───────────────────────▶│                    │               │              │              │                    │                    │
      │◀── status: confirmed ──┤                    │               │              │              │                    │                    │
```

**Why the split between sync and async here matters:** the two REST calls
(Listing, User) happen *inside* the lock and *before* the response — they're
things Booking cannot proceed without knowing right now. Payment happens
*after* the response is already sent — the guest doesn't need to wait on a
simulated 800ms gateway call before getting an answer, and Booking doesn't
need to know or care how Payment does its job, only that it will eventually
emit `payment.success` or `payment.failed`.

---

## 7. Preventing double-booking

Two independent layers, deliberately redundant:

1. **Redis distributed lock** (the fast path)
   `SET lock:listing:{id} {token} PX 10000 NX` — atomic acquire, 10s
   auto-expiring TTL so a crashed holder can't wedge the lock forever.
   Released via a Lua script that only deletes the key if the caller's
   token still matches (`GET` + compare + `DEL` in one atomic op), so one
   request can never accidentally release another's lock.

   This serializes **all** booking attempts for a given listing through the
   check-then-write section, closing the race where two guests both pass
   the availability check before either has written a row.

2. **Postgres partial index + overlap query** (the durable backstop)
   ```sql
   CREATE INDEX idx_bookings_overlap ON bookings (listing_id, start_date, end_date)
     WHERE status IN ('pending', 'confirmed');
   ```
   Every booking attempt runs:
   ```sql
   SELECT id FROM bookings
   WHERE listing_id = $1 AND status IN ('pending','confirmed')
     AND start_date < $3 AND end_date > $2;
   ```
   This exists in case the lock is ever bypassed, expires mid-request under
   unusual latency, or a future caller writes to `bookings` outside this
   code path. Relying on Redis alone for a correctness-critical invariant
   is a single point of failure; the DB check is what actually guarantees
   no double-booking can persist.

---

## 8. State machines

**Booking**
```
        payment.requested fires,
        booking created here
              │
              ▼
          [pending] ──payment.success──▶ [confirmed] ──user/host cancels──▶ [cancelled]
              │
              └──payment.failed──▶ [failed]

  (pending can also go straight to [cancelled] if cancelled before payment resolves)
```

**Payment**
```
  payment.requested received
              │
              ▼
      simulate ~800ms processing
              │
      ┌───────┴───────┐
      ▼               ▼
  [success]        [failed]     (~10% failure rate, by design — demonstrates
   (90%)             (10%)       the async failure path end-to-end)
```

---

## 9. Caching strategy

| Service | What's cached | Key pattern | TTL | Invalidation |
|---|---|---|---|---|
| Listing | Single listing reads | `listing:{id}` | 300s | Explicit `DEL` on update/delete |
| Search | Full query result sets | `search:{sorted query params}` | 30s | None — short TTL only, since search results churn with every new/updated/deleted listing and are read far more often than they need to be perfectly fresh |
| Booking | N/A (uses Redis for the distributed lock, not caching) | `lock:listing:{id}` | 10s | Explicit release, or auto-expiry if the holder crashes |

Listing's cache uses a long-ish TTL with explicit invalidation because
listing reads vastly outnumber writes (classic cache-aside). Search's cache
uses a short TTL with *no* explicit invalidation, because query result sets
are numerous and hard to invalidate precisely — it's cheaper to just let
them expire quickly than to track every cached query key affected by a
given listing change.

---

## 10. Auth

- Stateless **JWT**, signed with a shared secret (`JWT_SECRET` env var)
  across services that verify it — issued only by User Service on
  `/auth/register` and `/auth/login`.
- Token payload: `{ id, email, role }`, 7-day expiry.
- `requireAuth` middleware (duplicated in User, Listing, Booking — the
  services with protected routes) validates the `Authorization: Bearer
  <token>` header and attaches `req.user`.
- Listing and Booking both do **ownership checks** beyond just "is this
  token valid" — e.g. only the host who created a listing can edit/delete
  it; only the guest or host on a booking can cancel it.

---

## 11. Running it

Requires Docker and Docker Compose.

```bash
docker compose up --build
```

This starts, in dependency order:
- **Postgres** — auto-creates all 6 databases + tables from `init-db/init.sql`
- **Redis**
- **RabbitMQ** (management UI at `http://localhost:15672`, guest/guest)
- All 6 services
- **Frontend** at `http://localhost:5173`

| Component | URL |
|---|---|
| Frontend | http://localhost:5173 |
| User Service | http://localhost:4001 |
| Listing Service | http://localhost:4002 |
| Search Service | http://localhost:4003 |
| Booking Service | http://localhost:4004 |
| Payment Service | http://localhost:4005 |
| Notification Service | http://localhost:4006 |
| RabbitMQ management UI | http://localhost:15672 |

### Running a single service locally (without Docker)

```bash
cd services/user
npm install
# bring up just the infra it needs:
docker compose up postgres redis rabbitmq
# point DATABASE_URL / REDIS_URL / RABBITMQ_URL in your shell or a .env
npm run dev
```

### Trying the flow end-to-end

1. Sign up as a **host** (`role: host`) — frontend "Sign up" or `POST
   /auth/register` on User Service.
2. Create a listing as that host — frontend "New listing" or `POST
   /listings` on Listing Service.
3. Sign up as a **guest**.
4. Search for the listing (Search Service) and book it — Booking Service
   returns `202 pending` immediately; the frontend polls "My bookings"
   until it flips to `confirmed` or `failed`.
5. Watch the `notification-service` container logs (or query
   `notification_db.notifications`) to see the mock emails fire for every
   step — welcome email, booking confirmed (guest + host both notified),
   or payment failed.

---

## 12. Project structure

```
.
├── docker-compose.yml
├── init-db/
│   └── init.sql                # creates all 6 databases + tables on first boot
├── services/
│   ├── user/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts        # Express app + routes
│   │       ├── db.ts           # Postgres pool
│   │       ├── rabbitmq.ts     # publish/subscribe helpers
│   │       └── middleware/auth.ts
│   ├── listing/                # + src/redis.ts (cache-aside)
│   ├── search/                 # + src/redis.ts, src/consumer.ts (listing.* sync)
│   ├── booking/                # + src/redis.ts (lock), src/httpClients.ts, src/consumer.ts
│   ├── payment/                # + src/consumer.ts (payment.requested handler)
│   └── notification/           # + src/consumer.ts (listens to everything)
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx             # routes
        ├── main.tsx
        ├── index.css           # design system (boarding-pass/ticket motif)
        ├── lib/
        │   ├── api.ts          # typed fetch clients, one per service
        │   └── auth.tsx        # session context (JWT in localStorage)
        ├── components/
        │   ├── Nav.tsx
        │   └── Ticket.tsx      # booking-as-boarding-pass component
        └── pages/
            ├── Browse.tsx      # search/home
            ├── Login.tsx / Register.tsx
            ├── ListingDetail.tsx  # view + book
            ├── CreateListing.tsx  # host form
            ├── MyListings.tsx     # host management
            └── MyBookings.tsx     # guest/host ticket view, polls while pending
```

---

## 13. Design decisions & tradeoffs

- **Search is a separate service from Listing**, not just a cached
  endpoint on Listing — because search read volume, query shape, and
  scaling needs are fundamentally different from listing CRUD. It also
  means Search can move to Elasticsearch/OpenSearch later without touching
  Listing at all, since the only coupling is the event contract.
- **Booking owns the availability decision**, not Listing — because
  "is this listing available for these dates" depends on Booking's own
  reservation data, which Listing has no reason to know about. Listing
  only knows the listing's *overall* available window; Booking is the
  source of truth for which specific dates are already taken.
- **Payment confirmation is async**, not a blocking call from Booking —
  so a slow or flaky payment gateway (simulated here with an 800ms delay)
  never makes the booking request itself slow or flaky. The guest gets an
  immediate `202 pending` and the frontend polls; a production system
  would more likely push this over a WebSocket/SSE rather than polling,
  but polling keeps the demo dependency-free.
- **Notification has no inbound routes from other services on purpose** —
  it's the clearest illustration in this codebase of the benefit of
  event-driven architecture: you can delete this entire service and
  nothing else breaks or even notices, because nothing calls it directly.
- **Two-layer double-booking prevention** (Redis lock + Postgres
  constraint-backed query) rather than relying on either alone — see
  [§7](#7-preventing-double-booking) for the full reasoning.

---

## 14. What's intentionally simplified

This is a demo/reference implementation, not a production deployment. Known simplifications:

- **No API gateway / BFF** — the frontend calls each service's public port
  directly. A real deployment would put a gateway in front to avoid
  exposing internal service ports and centralize auth/rate-limiting.
- **Shared JWT secret via plain env var**, not a secrets manager (Vault,
  AWS Secrets Manager, etc.).
- **Payment is fully mocked** — random ~90% success rate, no real gateway,
  no idempotency keys, no retry logic.
- **No service discovery** — service URLs are hardcoded via env vars in
  `docker-compose.yml`. Fine for Compose; would need Consul/K8s DNS/similar
  at real scale.
- **Single Postgres container hosting 6 logical databases**, for
  simplicity of local setup. A stricter database-per-service deployment
  would give each its own Postgres instance (or at minimum, separate
  credentials/network policies per database).
- **No distributed tracing** (e.g. OpenTelemetry) across the async event
  chain — in production you'd want a trace ID propagated through every
  event payload to debug a booking's full lifecycle across 4+ services.
- **No outbox pattern** — services publish events directly after a DB
  write (two separate operations), not atomically. A dropped connection
  between the DB commit and the publish call could in theory lose an
  event. A production system would use the transactional outbox pattern
  (write the event to an `outbox` table in the same transaction, then a
  separate relay process publishes it) to guarantee at-least-once delivery.
