-- Rejected late History intervals. Readable History stays on the Controller.
-- One row is one rejected interval. Unavailable, stale, and absent designation
-- gaps stay derived by the query.
CREATE TABLE history_missing_intervals (
    capability_id UUID NOT NULL REFERENCES capability_identities (id),
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (capability_id, started_at, ended_at),
    CHECK (ended_at > started_at)
);
