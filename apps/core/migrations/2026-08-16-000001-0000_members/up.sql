CREATE TABLE members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    role VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (email)
);

CREATE UNIQUE INDEX members_user_id_uidx ON members (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE client_tokens
    ADD COLUMN user_id VARCHAR(255);
