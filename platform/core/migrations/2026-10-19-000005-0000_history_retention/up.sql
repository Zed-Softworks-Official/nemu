-- Controller-local rollup and cleanup checkpoints. Readable History stays on the Controller.
-- Relational columns only. A verified checkpoint makes a restarted step a no-op.
CREATE TABLE history_retention_checkpoints (
    capability_id UUID NOT NULL REFERENCES capability_identities (id),
    kind VARCHAR(32) NOT NULL CHECK (
        kind IN ('power', 'importedEnergy', 'exportedEnergy', 'voltage', 'current')
    ),
    step VARCHAR(16) NOT NULL CHECK (step IN ('rollup', 'cleanup')),
    resolution VARCHAR(16) NOT NULL CHECK (
        resolution IN ('raw', 'one_minute', 'five_minute', 'fifteen_minute', 'hourly', 'daily')
    ),
    range_start TIMESTAMPTZ NOT NULL,
    range_end TIMESTAMPTZ NOT NULL,
    verified BOOLEAN NOT NULL,
    PRIMARY KEY (capability_id, step, resolution, range_start, range_end),
    CHECK (range_end > range_start)
);
