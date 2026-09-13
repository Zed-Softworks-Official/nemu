CREATE TABLE capability_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protocol VARCHAR(16) NOT NULL,
    device_external_id VARCHAR(255) NOT NULL,
    component_path TEXT[] NOT NULL DEFAULT '{}',
    kind VARCHAR(32) NOT NULL CHECK (
        kind IN ('power', 'importedEnergy', 'exportedEnergy', 'voltage', 'current')
    ),
    physical_scope_kind VARCHAR(16) NOT NULL CHECK (
        physical_scope_kind IN ('home', 'device', 'component')
    ),
    physical_scope_component_id VARCHAR(255) NOT NULL DEFAULT '',
    tombstoned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT capability_identities_physical_scope_check CHECK (
        (physical_scope_kind = 'component' AND physical_scope_component_id <> '')
        OR (physical_scope_kind <> 'component' AND physical_scope_component_id = '')
    ),
    CONSTRAINT capability_identities_trustworthy_identity_key UNIQUE (
        protocol,
        device_external_id,
        component_path,
        kind,
        physical_scope_kind,
        physical_scope_component_id
    )
);

CREATE INDEX capability_identities_device_idx
    ON capability_identities (protocol, device_external_id);

SELECT diesel_manage_updated_at('capability_identities');
