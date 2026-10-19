// @generated automatically by Diesel CLI.

diesel::table! {
    audit_records (id) {
        id -> Int8,
        #[max_length = 64]
        kind -> Varchar,
        #[max_length = 255]
        actor_user_id -> Nullable<Varchar>,
        #[max_length = 512]
        summary -> Varchar,
        detail -> Jsonb,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    capability_identities (id) {
        id -> Uuid,
        #[max_length = 16]
        protocol -> Varchar,
        #[max_length = 255]
        device_external_id -> Varchar,
        component_path -> Array<Nullable<Text>>,
        #[max_length = 32]
        kind -> Varchar,
        #[max_length = 16]
        physical_scope_kind -> Varchar,
        #[max_length = 255]
        physical_scope_component_id -> Varchar,
        tombstoned_at -> Nullable<Timestamptz>,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
    }
}

diesel::table! {
    capability_observation_keys (observation_id, capability_id) {
        #[max_length = 255]
        observation_id -> Varchar,
        capability_id -> Uuid,
    }
}

diesel::table! {
    capability_observations (observation_id, capability_id, observed_at) {
        #[max_length = 255]
        observation_id -> Varchar,
        capability_id -> Uuid,
        #[max_length = 32]
        kind -> Varchar,
        #[max_length = 8]
        unit -> Varchar,
        value -> Int8,
        scale -> Int2,
        #[max_length = 255]
        constraint_revision_id -> Varchar,
        schema_version -> Int2,
        #[max_length = 32]
        time_trust -> Varchar,
        observed_at -> Timestamptz,
        received_at -> Timestamptz,
        reset -> Nullable<Bool>,
    }
}

diesel::table! {
    capability_recording_bounds (capability_id) {
        capability_id -> Uuid,
        recording_since -> Timestamptz,
    }
}

diesel::table! {
    capability_constraint_revisions (capability_id, revision_id) {
        capability_id -> Uuid,
        #[max_length = 255]
        revision_id -> Varchar,
        declared_at -> Timestamptz,
        effective_at -> Timestamptz,
        scale -> Int2,
        bound_minimum -> Int8,
        bound_maximum -> Int8,
        resolution -> Int8,
        freshness_ms -> Int8,
        admission_maximum_observations -> Int8,
        admission_interval_ms -> Int8,
        accuracy_absolute_maximum_error -> Nullable<Int8>,
        accuracy_relative_maximum_error_ppm -> Nullable<Int4>,
    }
}

diesel::table! {
    client_tokens (id) {
        id -> Uuid,
        #[max_length = 128]
        token_hash -> Varchar,
        #[max_length = 255]
        label -> Varchar,
        created_at -> Timestamptz,
        last_seen_at -> Nullable<Timestamptz>,
        #[max_length = 255]
        user_id -> Nullable<Varchar>,
    }
}

diesel::table! {
    command_outcomes (command_id) {
        #[max_length = 255]
        command_id -> Varchar,
        device_id -> Nullable<Uuid>,
        payload -> Jsonb,
        #[max_length = 32]
        outcome -> Varchar,
        #[max_length = 64]
        error_code -> Nullable<Varchar>,
        dispatch_expires_at -> Timestamptz,
        retain_until -> Timestamptz,
        claimed_at -> Nullable<Timestamptz>,
        created_at -> Timestamptz,
        updated_at -> Timestamptz,
    }
}

diesel::table! {
    device_events (id) {
        id -> Int8,
        device_id -> Nullable<Uuid>,
        #[max_length = 50]
        kind -> Varchar,
        payload -> Jsonb,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    devices (id) {
        id -> Uuid,
        #[max_length = 64]
        external_id -> Varchar,
        #[max_length = 255]
        friendly_name -> Varchar,
        #[max_length = 50]
        device_type -> Varchar,
        #[max_length = 255]
        model -> Nullable<Varchar>,
        created_at -> Nullable<Timestamptz>,
        updated_at -> Nullable<Timestamptz>,
        room_id -> Nullable<Uuid>,
        enabled -> Bool,
        last_seen -> Nullable<Timestamptz>,
        #[max_length = 16]
        protocol -> Varchar,
    }
}

diesel::table! {
    gauge_rollups (capability_id, bucket_start) {
        capability_id -> Uuid,
        #[max_length = 16]
        gauge_kind -> Varchar,
        bucket_start -> Timestamptz,
        bucket_end -> Timestamptz,
        scale -> Int2,
        mean_value -> Nullable<Int8>,
        observed_min -> Nullable<Int8>,
        observed_max -> Nullable<Int8>,
        coverage_ns -> Int8,
    }
}

diesel::table! {
    history_budget (id) {
        id -> Int2,
        budget_bytes -> Int8,
        updated_at -> Timestamptz,
    }
}

diesel::table! {
    diagnostic_events (id, received_at) {
        id -> Uuid,
        received_at -> Timestamptz,
        #[max_length = 64]
        kind -> Varchar,
        device_id -> Nullable<Uuid>,
        payload -> Jsonb,
    }
}

diesel::table! {
    history_retention_checkpoints (capability_id, step, resolution, range_start, range_end) {
        capability_id -> Uuid,
        #[max_length = 32]
        kind -> Varchar,
        #[max_length = 16]
        step -> Varchar,
        #[max_length = 16]
        resolution -> Varchar,
        range_start -> Timestamptz,
        range_end -> Timestamptz,
        verified -> Bool,
    }
}

diesel::table! {
    history_missing_intervals (capability_id, started_at, ended_at) {
        capability_id -> Uuid,
        started_at -> Timestamptz,
        ended_at -> Timestamptz,
    }
}

diesel::table! {
    history_gaps (id) {
        id -> Int8,
        capability_id -> Nullable<Uuid>,
        #[max_length = 32]
        reason -> Varchar,
        onset -> Timestamptz,
        until -> Nullable<Timestamptz>,
    }
}

diesel::table! {
    home_meter_designation_periods (id) {
        id -> Uuid,
        effective_from -> Timestamptz,
        effective_until -> Nullable<Timestamptz>,
        power_capability_id -> Nullable<Uuid>,
        imported_energy_capability_id -> Nullable<Uuid>,
        exported_energy_capability_id -> Nullable<Uuid>,
        #[max_length = 16]
        protocol -> Varchar,
        #[max_length = 255]
        device_external_id -> Varchar,
        component_path -> Array<Text>,
        #[max_length = 16]
        physical_scope_kind -> Varchar,
        #[max_length = 255]
        physical_scope_component_id -> Varchar,
    }
}

diesel::table! {
    home_timezone_periods (effective_from) {
        #[max_length = 64]
        timezone -> Varchar,
        effective_from -> Timestamptz,
        effective_until -> Nullable<Timestamptz>,
    }
}

diesel::table! {
    meter_epochs (id) {
        id -> Int8,
        capability_id -> Uuid,
        started_at -> Timestamptz,
        ended_at -> Nullable<Timestamptz>,
        #[max_length = 32]
        reason -> Varchar,
    }
}

diesel::table! {
    energy_counter_rollups (id) {
        id -> Int8,
        capability_id -> Uuid,
        bucket_start -> Timestamptz,
        bucket_end -> Timestamptz,
        first_observed_at -> Timestamptz,
        first_value -> Int8,
        last_observed_at -> Timestamptz,
        last_value -> Int8,
        measured_energy -> Int8,
        coverage_numerator -> Int8,
        coverage_denominator -> Int8,
        #[max_length = 32]
        allocation -> Varchar,
        #[max_length = 32]
        provenance -> Varchar,
    }
}

diesel::table! {
    members (id) {
        id -> Uuid,
        #[max_length = 255]
        user_id -> Nullable<Varchar>,
        #[max_length = 255]
        email -> Varchar,
        #[max_length = 255]
        display_name -> Nullable<Varchar>,
        #[max_length = 32]
        role -> Varchar,
        #[max_length = 32]
        status -> Varchar,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    pairing_codes (id) {
        id -> Uuid,
        #[max_length = 128]
        code_hash -> Varchar,
        expires_at -> Timestamptz,
        consumed -> Bool,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    power_rollups (capability_id, bucket_start) {
        capability_id -> Uuid,
        bucket_start -> Timestamptz,
        bucket_end -> Timestamptz,
        scale -> Int2,
        mean_value -> Nullable<Int8>,
        observed_min -> Nullable<Int8>,
        observed_max -> Nullable<Int8>,
        estimated_import -> Int8,
        estimated_export -> Int8,
        coverage_ns -> Int8,
        gap_ns -> Int8,
    }
}

diesel::table! {
    rooms (id) {
        id -> Uuid,
        #[max_length = 255]
        name -> Varchar,
        sort_order -> Int4,
        created_at -> Timestamptz,
    }
}

diesel::table! {
    settings (key) {
        #[max_length = 255]
        key -> Varchar,
        value -> Jsonb,
    }
}

diesel::joinable!(capability_observation_keys -> capability_identities (capability_id));
diesel::joinable!(capability_observations -> capability_identities (capability_id));
diesel::joinable!(capability_constraint_revisions -> capability_identities (capability_id));
diesel::joinable!(capability_recording_bounds -> capability_identities (capability_id));
diesel::joinable!(command_outcomes -> devices (device_id));
diesel::joinable!(device_events -> devices (device_id));
diesel::joinable!(devices -> rooms (room_id));
diesel::joinable!(energy_counter_rollups -> capability_identities (capability_id));
diesel::joinable!(gauge_rollups -> capability_identities (capability_id));
diesel::joinable!(history_gaps -> capability_identities (capability_id));
diesel::joinable!(history_missing_intervals -> capability_identities (capability_id));
diesel::joinable!(history_retention_checkpoints -> capability_identities (capability_id));
diesel::joinable!(meter_epochs -> capability_identities (capability_id));
diesel::joinable!(power_rollups -> capability_identities (capability_id));

diesel::allow_tables_to_appear_in_same_query!(
    audit_records,
    capability_identities,
    capability_observation_keys,
    capability_observations,
    capability_constraint_revisions,
    capability_recording_bounds,
    client_tokens,
    command_outcomes,
    device_events,
    devices,
    diagnostic_events,
    gauge_rollups,
    history_budget,
    history_gaps,
    history_missing_intervals,
    history_retention_checkpoints,
    home_meter_designation_periods,
    home_timezone_periods,
    meter_epochs,
    energy_counter_rollups,
    members,
    pairing_codes,
    power_rollups,
    rooms,
    settings,
);
