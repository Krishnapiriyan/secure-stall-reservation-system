-- Database Creation Script for Book Fair Stall Reservation System
-- Information Security Module Assessment 2

CREATE DATABASE IF NOT EXISTS stall_reservation;
USE stall_reservation;

-- 1. Users Table (Handles Vendor and Organizer profiles)
CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    business_name VARCHAR(255),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Events Table (Managed by Exhibition Organizer)
CREATE TABLE IF NOT EXISTS events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    event_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. Stalls Table (Stall layout and pricing details)
CREATE TABLE IF NOT EXISTS stalls (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id BIGINT NOT NULL,
    stall_code VARCHAR(50) NOT NULL,
    price DECIMAL(12,2) NOT NULL,
    size VARCHAR(50) NOT NULL,
    position_x INT,
    position_y INT,
    blocked BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

-- 4. Reservations Table (Booking requests submitted by Vendors, managed by Organizers)
CREATE TABLE IF NOT EXISTS reservations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    booking_id VARCHAR(50) NOT NULL UNIQUE,
    event_id BIGINT NOT NULL,
    vendor_id BIGINT NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL,
    advance_amount DECIMAL(12,2) NOT NULL,
    status VARCHAR(50) NOT NULL,
    stall_description VARCHAR(2000),
    qr_code_value VARCHAR(255),
    booking_datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    cancellation_deadline DATE,
    payment_method VARCHAR(50),
    account_number VARCHAR(255),
    bank_name VARCHAR(255),
    address VARCHAR(255),
    admin_ack BOOLEAN DEFAULT FALSE,
    
    -- OIDC / Security Assessment 2 Fields
    reservation_date DATE,
    stall_type VARCHAR(255),
    preferred_stall_size VARCHAR(255),
    stalls_required INT,
    business_category VARCHAR(255),
    special_requirements VARCHAR(2000),
    
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (vendor_id) REFERENCES users(id)
);

-- 5. Reservation Stalls (Composite mapping between reservations and stalls)
CREATE TABLE IF NOT EXISTS reservation_stall (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    reservation_id BIGINT NOT NULL,
    stall_id BIGINT NOT NULL,
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
    FOREIGN KEY (stall_id) REFERENCES stalls(id) ON DELETE CASCADE
);

-- 6. Genres Table
CREATE TABLE IF NOT EXISTS genres (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

-- 7. Reservation Genres (Composite mapping for recommendations)
CREATE TABLE IF NOT EXISTS reservation_genre (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    reservation_id BIGINT NOT NULL,
    genre_id BIGINT NOT NULL,
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
    FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);

-- 8. Payments Table (Saves payment confirmations for reservations)
CREATE TABLE IF NOT EXISTS payments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    reservation_id BIGINT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status VARCHAR(50) NOT NULL,
    paid_at TIMESTAMP NULL,
    refunded_at TIMESTAMP NULL,
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
);

-- 9. Reservation Logs Table (Tracks reservation audit events for security logging and monitoring)
CREATE TABLE IF NOT EXISTS reservation_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    reservation_id BIGINT NOT NULL,
    action VARCHAR(255) NOT NULL,
    details VARCHAR(2000),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
);

-- 10. Content Table (Manages customizable portal content parameters)
CREATE TABLE IF NOT EXISTS content (
    `key` VARCHAR(255) PRIMARY KEY,
    `value` TEXT NOT NULL
);
