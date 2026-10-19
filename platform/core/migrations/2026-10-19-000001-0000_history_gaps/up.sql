CREATE TABLE history_gaps (
    id BIGSERIAL PRIMARY KEY,
    capability_id UUID REFERENCES capability_identities (id),
    reason VARCHAR(32) NOT NULL CHECK (
        reason IN ('untrusted_time', 'storage_failure', 'queue_loss', 'disk_floor')
    ),
    onset TIMESTAMPTZ NOT NULL,
    until TIMESTAMPTZ
);

CREATE UNIQUE INDEX history_gaps_capability_idx
    ON history_gaps (reason, capability_id, onset)
    WHERE capability_id IS NOT NULL;

CREATE UNIQUE INDEX history_gaps_home_idx
    ON history_gaps (reason, onset)
    WHERE capability_id IS NULL;
