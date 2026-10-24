-- PostgreSQL requires the partition key in every unique constraint, so observation identity
-- lives in its own table. Replaying an observation keeps its original observed_at.
CREATE TABLE capability_observation_keys (
    observation_id VARCHAR(255) NOT NULL,
    capability_id UUID NOT NULL REFERENCES capability_identities (id),
    PRIMARY KEY (observation_id, capability_id)
);

CREATE TABLE capability_observations (
    observation_id VARCHAR(255) NOT NULL,
    capability_id UUID NOT NULL REFERENCES capability_identities (id),
    kind VARCHAR(32) NOT NULL CHECK (
        kind IN ('power', 'importedEnergy', 'exportedEnergy', 'voltage', 'current')
    ),
    unit VARCHAR(8) NOT NULL CHECK (unit IN ('W', 'Wh', 'V', 'A')),
    value BIGINT NOT NULL,
    scale SMALLINT NOT NULL CHECK (scale >= 0 AND scale <= 9),
    constraint_revision_id VARCHAR(255) NOT NULL,
    schema_version SMALLINT NOT NULL CHECK (schema_version = 1),
    time_trust VARCHAR(32) NOT NULL CHECK (time_trust = 'trustworthy'),
    observed_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    reset BOOLEAN,
    PRIMARY KEY (observation_id, capability_id, observed_at)
) PARTITION BY RANGE (observed_at);

DO $$
DECLARE
    year integer;
BEGIN
    FOR year IN 2024..2036 LOOP
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF capability_observations FOR VALUES FROM (%L) TO (%L)',
            'capability_observations_y' || year::text,
            year::text || '-01-01 00:00:00+00',
            (year + 1)::text || '-01-01 00:00:00+00'
        );
    END LOOP;
END $$;

CREATE TABLE capability_observations_default PARTITION OF capability_observations DEFAULT;

CREATE TABLE capability_recording_bounds (
    capability_id UUID PRIMARY KEY REFERENCES capability_identities (id),
    recording_since TIMESTAMPTZ NOT NULL
);
