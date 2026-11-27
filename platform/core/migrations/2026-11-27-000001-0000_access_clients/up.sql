-- Access Clients paired with CPace (ADR-0037, NEM-126). Each binds an
-- Ed25519 signing key and an X25519 encryption key to one Membership.
-- Deleting the Membership deletes its Access Clients.
CREATE TABLE access_clients (
    id UUID PRIMARY KEY,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL,
    signing_key BYTEA NOT NULL UNIQUE CHECK (octet_length(signing_key) = 32),
    encryption_key BYTEA NOT NULL UNIQUE CHECK (octet_length(encryption_key) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ
);

CREATE INDEX access_clients_member_id_idx ON access_clients (member_id);

-- CPace needs the Pairing code itself, not a hash of it. A six-digit hash
-- protected nothing anyway, and codes live for five minutes on the
-- Controller. Older rows have no code and can only be used by POST /api/pair.
ALTER TABLE pairing_codes
    ADD COLUMN code VARCHAR(16),
    ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
