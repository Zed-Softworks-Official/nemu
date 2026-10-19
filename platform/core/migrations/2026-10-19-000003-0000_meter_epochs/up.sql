-- Meter epochs and Measured energy-counter rollups. Both stay on the Controller.
-- Rollup rows upsert by capability and bucket start. Relational columns only.
CREATE TABLE meter_epochs (
    id BIGSERIAL PRIMARY KEY,
    capability_id UUID NOT NULL REFERENCES capability_identities (id),
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    reason VARCHAR(32) NOT NULL CHECK (
        reason IN ('initial', 'counter_decrease', 'adapter_reset', 'identity_change')
    ),
    CHECK (ended_at IS NULL OR ended_at > started_at)
);

CREATE UNIQUE INDEX meter_epochs_capability_started_idx
    ON meter_epochs (capability_id, started_at);

CREATE TABLE energy_counter_rollups (
    id BIGSERIAL PRIMARY KEY,
    capability_id UUID NOT NULL REFERENCES capability_identities (id),
    bucket_start TIMESTAMPTZ NOT NULL,
    bucket_end TIMESTAMPTZ NOT NULL,
    first_observed_at TIMESTAMPTZ NOT NULL,
    first_value BIGINT NOT NULL,
    last_observed_at TIMESTAMPTZ NOT NULL,
    last_value BIGINT NOT NULL,
    measured_energy BIGINT NOT NULL CHECK (measured_energy >= 0),
    coverage_numerator BIGINT NOT NULL CHECK (coverage_numerator >= 0),
    coverage_denominator BIGINT NOT NULL CHECK (coverage_denominator > 0),
    allocation VARCHAR(32) NOT NULL CHECK (allocation IN ('exact', 'interpolated')),
    provenance VARCHAR(32) NOT NULL CHECK (provenance IN ('measured_from_counter')),
    CHECK (bucket_end > bucket_start),
    CHECK (coverage_numerator <= coverage_denominator)
);

CREATE UNIQUE INDEX energy_counter_rollups_capability_bucket_idx
    ON energy_counter_rollups (capability_id, bucket_start);
