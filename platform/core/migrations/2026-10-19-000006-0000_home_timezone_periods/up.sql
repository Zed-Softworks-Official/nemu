-- Prospective Home timezone periods. Observations stay UTC instants.
-- A change takes effect at the next midnight in the new timezone.
-- Readable History stays on the Controller. No JSONB.
CREATE TABLE home_timezone_periods (
    timezone VARCHAR(64) NOT NULL,
    effective_from TIMESTAMPTZ NOT NULL,
    effective_until TIMESTAMPTZ,
    CONSTRAINT home_timezone_periods_timezone_present CHECK (char_length(timezone) > 0),
    CONSTRAINT home_timezone_periods_bounds CHECK (
        effective_until IS NULL OR effective_until > effective_from
    ),
    PRIMARY KEY (effective_from)
);

CREATE UNIQUE INDEX home_timezone_periods_one_open_idx
    ON home_timezone_periods ((1))
    WHERE effective_until IS NULL;
