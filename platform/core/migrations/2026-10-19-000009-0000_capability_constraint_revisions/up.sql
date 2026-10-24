-- Capability constraint revisions. Readable History stays on the Controller.
-- Relational columns only. Accuracy is two optional numbers, not a JSON document.
CREATE TABLE capability_constraint_revisions (
    capability_id UUID NOT NULL REFERENCES capability_identities (id),
    revision_id VARCHAR(255) NOT NULL,
    declared_at TIMESTAMPTZ NOT NULL,
    effective_at TIMESTAMPTZ NOT NULL,
    scale SMALLINT NOT NULL,
    bound_minimum BIGINT NOT NULL,
    bound_maximum BIGINT NOT NULL,
    resolution BIGINT NOT NULL,
    freshness_ms BIGINT NOT NULL,
    admission_maximum_observations BIGINT NOT NULL,
    admission_interval_ms BIGINT NOT NULL,
    accuracy_absolute_maximum_error BIGINT,
    accuracy_relative_maximum_error_ppm INTEGER,
    PRIMARY KEY (capability_id, revision_id),
    CHECK (effective_at >= declared_at),
    CHECK (bound_minimum < bound_maximum),
    CHECK (
        accuracy_relative_maximum_error_ppm IS NULL
        OR accuracy_relative_maximum_error_ppm >= 0
    )
);
