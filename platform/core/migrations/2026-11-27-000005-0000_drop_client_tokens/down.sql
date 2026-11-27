-- Recreates the table empty: dropped tokens cannot come back.
CREATE TABLE client_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    label VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ,
    user_id VARCHAR(255)
);

CREATE INDEX client_tokens_token_hash_idx ON client_tokens (token_hash);
