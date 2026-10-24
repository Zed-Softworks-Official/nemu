-- Command outcomes and Audit records are product records. They are not
-- diagnostic events and are not derived from device_events.
CREATE TABLE command_outcomes (
    command_id VARCHAR(255) PRIMARY KEY,
    device_id UUID REFERENCES devices (id) ON DELETE SET NULL,
    payload JSONB NOT NULL,
    outcome VARCHAR(32) NOT NULL CHECK (
        outcome IN (
            'pending_dispatch',
            'accepted',
            'confirmed',
            'rejected',
            'failed',
            'unconfirmed'
        )
    ),
    error_code VARCHAR(64),
    dispatch_expires_at TIMESTAMPTZ NOT NULL,
    retain_until TIMESTAMPTZ NOT NULL,
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX command_outcomes_device_outcome_idx
    ON command_outcomes (device_id, outcome);
CREATE INDEX command_outcomes_retain_until_idx
    ON command_outcomes (retain_until);

CREATE TABLE audit_records (
    id BIGSERIAL PRIMARY KEY,
    kind VARCHAR(64) NOT NULL CHECK (
        kind IN (
            'membership_change',
            'access_client_paired',
            'access_client_revoked',
            'update',
            'restore',
            'device_removal',
            'automation_change'
        )
    ),
    actor_user_id VARCHAR(255),
    summary VARCHAR(512) NOT NULL,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_records_created_at_idx ON audit_records (created_at);

-- Hourly partitions keep the Diagnostic log droppable ahead of product History.
CREATE TABLE diagnostic_events (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    received_at TIMESTAMPTZ NOT NULL,
    kind VARCHAR(64) NOT NULL CHECK (
        kind IN (
            'adapter_event',
            'invalid_value',
            'incompatible_report',
            'rate_rejection',
            'late_history_rejection'
        )
    ),
    device_id UUID,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (id, received_at)
) PARTITION BY RANGE (received_at);
