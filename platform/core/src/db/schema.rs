// @generated automatically by Diesel CLI.

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

diesel::joinable!(device_events -> devices (device_id));
diesel::joinable!(devices -> rooms (room_id));

diesel::allow_tables_to_appear_in_same_query!(
    capability_identities,
    client_tokens,
    device_events,
    devices,
    members,
    pairing_codes,
    rooms,
    settings,
);
