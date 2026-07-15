-- Runs once when the postgres container first initializes its data dir.
-- Creates one database per microservice (database-per-service pattern).

CREATE DATABASE user_db;
CREATE DATABASE listing_db;
CREATE DATABASE search_db;
CREATE DATABASE booking_db;
CREATE DATABASE payment_db;
CREATE DATABASE notification_db;

-- ============ user_db ============
\connect user_db

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'guest' CHECK (role IN ('guest', 'host', 'both')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ listing_db ============
\connect listing_db

CREATE TABLE IF NOT EXISTS listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    location VARCHAR(255) NOT NULL,
    amenities TEXT[] DEFAULT '{}',
    images TEXT[] DEFAULT '{}',
    available_from DATE NOT NULL,
    available_to DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listings_host ON listings(host_id);

-- ============ search_db ============
\connect search_db

-- Denormalized, read-optimized copy of listings, kept in sync via events.
CREATE TABLE IF NOT EXISTS listings_search (
    id UUID PRIMARY KEY,
    host_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    location VARCHAR(255) NOT NULL,
    amenities TEXT[] DEFAULT '{}',
    images TEXT[] DEFAULT '{}',
    available_from DATE NOT NULL,
    available_to DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_location ON listings_search (lower(location));
CREATE INDEX IF NOT EXISTS idx_search_price ON listings_search (price);
CREATE INDEX IF NOT EXISTS idx_search_dates ON listings_search (available_from, available_to);

-- ============ booking_db ============
\connect booking_db

CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL,
    guest_id UUID NOT NULL,
    host_id UUID NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_price NUMERIC(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'failed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_date > start_date)
);

CREATE INDEX IF NOT EXISTS idx_bookings_listing ON bookings(listing_id);
CREATE INDEX IF NOT EXISTS idx_bookings_guest ON bookings(guest_id);

-- Backstop against double-booking at the DB level (Redis lock is the fast
-- path; this unique-ish guard + application overlap check is the safety net).
CREATE INDEX IF NOT EXISTS idx_bookings_overlap
    ON bookings (listing_id, start_date, end_date)
    WHERE status IN ('pending', 'confirmed');

-- ============ payment_db ============
\connect payment_db

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL,
    guest_id UUID NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'success', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);

-- ============ notification_db ============
\connect notification_db

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'sent',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
