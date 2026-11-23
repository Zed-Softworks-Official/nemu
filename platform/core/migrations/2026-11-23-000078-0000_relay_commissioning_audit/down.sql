DELETE FROM audit_records WHERE kind = 'relay_commissioning';

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
