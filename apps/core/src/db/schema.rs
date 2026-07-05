// @generated automatically by Diesel CLI.

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
    }
}
