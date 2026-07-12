use chrono::{DateTime, Utc};
use diesel::prelude::*;
use serde_json::Value as JsonValue;
use uuid::Uuid;

#[derive(Debug, Clone, Queryable, Selectable, Identifiable)]
#[diesel(table_name = crate::db::schema::rooms)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Room {
    pub id: Uuid,
    pub name: String,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Insertable)]
#[diesel(table_name = crate::db::schema::rooms)]
pub struct NewRoom<'a> {
    pub name: &'a str,
    pub sort_order: i32,
}

#[derive(Debug, AsChangeset, Default)]
#[diesel(table_name = crate::db::schema::rooms)]
pub struct UpdateRoom {
    pub name: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Clone, Queryable, Selectable, Identifiable)]
#[diesel(table_name = crate::db::schema::devices)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct Device {
    pub id: Uuid,
    pub ieee_address: String,
    pub friendly_name: String,
    pub device_type: String,
    pub model: Option<String>,
    pub room_id: Option<Uuid>,
    pub enabled: bool,
    pub last_seen: Option<DateTime<Utc>>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Insertable)]
#[diesel(table_name = crate::db::schema::devices)]
pub struct NewDevice<'a> {
    pub ieee_address: &'a str,
    pub friendly_name: &'a str,
    pub device_type: &'a str,
    pub model: Option<&'a str>,
    pub enabled: bool,
}

#[derive(Debug, AsChangeset, Default)]
#[diesel(table_name = crate::db::schema::devices)]
pub struct UpdateDevice {
    pub friendly_name: Option<String>,
    pub device_type: Option<String>,
    pub model: Option<Option<String>>,
    pub room_id: Option<Option<Uuid>>,
    pub enabled: Option<bool>,
    pub last_seen: Option<Option<DateTime<Utc>>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Insertable)]
#[diesel(table_name = crate::db::schema::device_events)]
pub struct NewDeviceEvent {
    pub device_id: Option<Uuid>,
    pub kind: String,
    pub payload: JsonValue,
}
