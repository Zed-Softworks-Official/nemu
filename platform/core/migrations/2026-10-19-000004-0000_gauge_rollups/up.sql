-- Controller-local power and Gauge rollups. Readable History stays on the Controller.
CREATE TABLE power_rollups (
    capability_id UUID NOT NULL REFERENCES capability_identities (id),
    bucket_start TIMESTAMPTZ NOT NULL,
    bucket_end TIMESTAMPTZ NOT NULL,
    scale SMALLINT NOT NULL CHECK (scale >= 0 AND scale <= 9),
    mean_value BIGINT,
    observed_min BIGINT,
    observed_max BIGINT,
    estimated_import BIGINT NOT NULL CHECK (estimated_import >= 0),
    estimated_export BIGINT NOT NULL CHECK (estimated_export >= 0),
    coverage_ns BIGINT NOT NULL CHECK (coverage_ns >= 0),
    gap_ns BIGINT NOT NULL CHECK (gap_ns >= 0),
    PRIMARY KEY (capability_id, bucket_start),
    CONSTRAINT power_rollups_bucket_order CHECK (bucket_end > bucket_start),
    CONSTRAINT power_rollups_extrema CHECK (
        (observed_min IS NULL AND observed_max IS NULL)
        OR (
            observed_min IS NOT NULL
            AND observed_max IS NOT NULL
            AND observed_min <= observed_max
        )
    ),
    CONSTRAINT power_rollups_mean_when_covered CHECK (
        coverage_ns = 0 OR mean_value IS NOT NULL
    )
);

CREATE TABLE gauge_rollups (
    capability_id UUID NOT NULL REFERENCES capability_identities (id),
    gauge_kind VARCHAR(16) NOT NULL CHECK (gauge_kind IN ('voltage', 'current')),
    bucket_start TIMESTAMPTZ NOT NULL,
    bucket_end TIMESTAMPTZ NOT NULL,
    scale SMALLINT NOT NULL CHECK (scale >= 0 AND scale <= 9),
    mean_value BIGINT,
    observed_min BIGINT,
    observed_max BIGINT,
    coverage_ns BIGINT NOT NULL CHECK (coverage_ns >= 0),
    PRIMARY KEY (capability_id, bucket_start),
    CONSTRAINT gauge_rollups_bucket_order CHECK (bucket_end > bucket_start),
    CONSTRAINT gauge_rollups_extrema CHECK (
        (observed_min IS NULL AND observed_max IS NULL)
        OR (
            observed_min IS NOT NULL
            AND observed_max IS NOT NULL
            AND observed_min <= observed_max
        )
    ),
    CONSTRAINT gauge_rollups_mean_when_covered CHECK (
        coverage_ns = 0 OR mean_value IS NOT NULL
    )
);
