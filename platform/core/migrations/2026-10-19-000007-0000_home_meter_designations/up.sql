-- Immutable Home-meter designation periods. Closing a period sets
-- effective_until and leaves the capability ids untouched.
CREATE TABLE home_meter_designation_periods (
    id UUID PRIMARY KEY,
    effective_from TIMESTAMPTZ NOT NULL,
    effective_until TIMESTAMPTZ,
    power_capability_id UUID REFERENCES capability_identities (id),
    imported_energy_capability_id UUID REFERENCES capability_identities (id),
    exported_energy_capability_id UUID REFERENCES capability_identities (id),
    protocol VARCHAR(16) NOT NULL,
    device_external_id VARCHAR(255) NOT NULL,
    component_path TEXT[] NOT NULL,
    physical_scope_kind VARCHAR(16) NOT NULL CHECK (
        physical_scope_kind IN ('home', 'device', 'component')
    ),
    physical_scope_component_id VARCHAR(255) NOT NULL DEFAULT '',
    CONSTRAINT home_meter_designation_one_capability CHECK (
        power_capability_id IS NOT NULL
        OR imported_energy_capability_id IS NOT NULL
        OR exported_energy_capability_id IS NOT NULL
    ),
    CONSTRAINT home_meter_designation_scope_check CHECK (
        (physical_scope_kind = 'component' AND physical_scope_component_id <> '')
        OR (physical_scope_kind <> 'component' AND physical_scope_component_id = '')
    ),
    CONSTRAINT home_meter_designation_until_after_from CHECK (
        effective_until IS NULL OR effective_until > effective_from
    )
);

CREATE UNIQUE INDEX home_meter_designation_one_open
    ON home_meter_designation_periods ((1))
    WHERE effective_until IS NULL;

CREATE INDEX home_meter_designation_effective_from_idx
    ON home_meter_designation_periods (effective_from);

ALTER TABLE audit_records DROP CONSTRAINT IF EXISTS audit_records_kind_check;
ALTER TABLE audit_records ADD CONSTRAINT audit_records_kind_check CHECK (
    kind IN (
        'membership_change',
        'access_client_paired',
        'access_client_revoked',
        'update',
        'restore',
        'device_removal',
        'automation_change',
        'history_budget_change',
        'home_meter_designation'
    )
);
