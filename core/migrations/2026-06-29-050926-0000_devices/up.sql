CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ieee_address VARCHAR(24) UNIQUE NOT NULL,
    friendly_name VARCHAR(255) NOT NULL,
    device_type VARCHAR(50) NOT NULL,
    model VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
