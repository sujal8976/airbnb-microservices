# Airbnb Microservices

A lean microservices architecture for an Airbnb-style application. The repo is split into independently deployable services, each owning a single domain and communicating through a mix of synchronous REST calls and asynchronous events.

## Services

### User Service
Owns identity and profile data.

- Register and login with JWT issuance
- Store host and guest profiles
- Suggested schema: `users(id, name, email, password_hash, role, created_at)`

### Listing Service
Owns property catalog data.

- CRUD for listings, including title, description, price, location, amenities, and images
- Suggested schema: `listings(id, host_id, title, price, location, available_from, available_to, ...)`
- Redis cache for popular or frequently read listings
- `GET /listings/:id` should check cache before falling back to Postgres

### Booking Service
Owns transactional booking logic.

- Create and cancel bookings
- Validate date overlap and availability
- Suggested schema: `bookings(id, listing_id, guest_id, start_date, end_date, status, total_price)`
- Use Redis as a distributed lock to prevent double-booking
- Call Listing Service synchronously to verify listing existence and fetch price
- Call User Service synchronously to verify the guest

### Payment Service
Owns payment simulation and payment state.

- Accept payment requests from Booking Service
- Mark payments as success or fail for demo purposes
- Suggested schema: `payments(id, booking_id, amount, status, created_at)`
- Publish success/failure events for downstream consumers

### Search Service
Owns search and filtering for read-heavy traffic.

- Search by location, date range, and price range
- Redis cache for short-lived search results
- Maintain a denormalized read model of listings
- Update its read model from Listing Service events or a simple sync strategy for demos

### Notification Service
Owns side-effect notifications only.

- Consume events and send mocked email, SMS, or push notifications
- No synchronous inbound dependency from other services
- Optional schema for history: `notifications(id, user_id, type, message, status, created_at)`

## Communication Model

- Booking -> Listing: sync REST for availability and price checks
- Booking -> User: sync REST for guest validation
- Booking -> Payment: sync or async, depending on how simple the demo should be
- Payment -> Booking: async event for payment outcome updates
- Listing -> Search: async event for read-model updates
- Any service -> Notification: async event consumer only

## Recommended Demo Stack

- Postgres per service for data ownership
- Redis for caching and distributed locking
- RabbitMQ for events and background consumers
- TypeScript services with small HTTP APIs

## Current Repo State

The service folders are scaffolded, but most implementation files are still empty. This README captures the intended architecture so each service can be implemented incrementally.
