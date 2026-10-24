-- Owner History budget. One row. Partition deletion is a later change;
-- this table only records the byte budget the Owner chose.
CREATE TABLE history_budget (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    budget_bytes BIGINT NOT NULL CHECK (budget_bytes >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
        'history_budget_change'
    )
);
