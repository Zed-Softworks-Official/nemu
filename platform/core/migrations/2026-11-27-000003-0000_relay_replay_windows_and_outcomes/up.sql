-- Sealed Relay requests (ADR-0001, NEM-129).
--
-- Each Access Client's replay window: the highest Relay counter the
-- Controller accepted, and a 64-bit bitmap of the counters ending at it
-- (bit i = counter highest - i). `seen` holds the u64 bit pattern.
CREATE TABLE relay_replay_windows (
    access_client_id UUID PRIMARY KEY REFERENCES access_clients(id) ON DELETE CASCADE,
    highest BIGINT NOT NULL CHECK (highest >= 0),
    seen BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The outcome of every Relay write, keyed by (Access Client, requestId) and
-- kept for 24 hours, so a retry returns the stored outcome instead of
-- running again (ADR-0015). `body_sha256` is the hash of the decrypted
-- request: the same requestId with a different body is refused.
-- `response` is the plaintext reply, or NULL for a Command, whose outcome
-- lives in the Command ledger, and for a write still running.
CREATE TABLE relay_outcomes (
    access_client_id UUID NOT NULL REFERENCES access_clients(id) ON DELETE CASCADE,
    request_id TEXT NOT NULL CHECK (octet_length(request_id) BETWEEN 1 AND 256),
    body_sha256 BYTEA NOT NULL CHECK (octet_length(body_sha256) = 32),
    response TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    retain_until TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (access_client_id, request_id)
);

CREATE INDEX relay_outcomes_retain_until_idx ON relay_outcomes (retain_until);
