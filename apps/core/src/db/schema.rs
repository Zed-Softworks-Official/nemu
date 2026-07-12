// @generated automatically by Diesel CLI.

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
        #[max_length = 24]
        ieee_address -> Varchar,
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

diesel::joinable!(device_events -> devices (device_id));
diesel::joinable!(devices -> rooms (room_id));

diesel::allow_tables_to_appear_in_same_query!(device_events, devices, rooms,);
