//! PostgreSQL storage for Device and Room setup: Device tombstones
//! (ADR-0017), Component Room assignments, and guarded Room deletion.

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use diesel::pg::PgConnection;
use diesel::prelude::*;
use uuid::Uuid;

use crate::db::models::Device;
use crate::db::schema::{component_rooms, device_tombstones, devices, rooms};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RoomDeletion {
    Deleted,
    NotFound,
    /// Devices or Components are still assigned to the Room.
    NotEmpty,
}

#[derive(Debug, Clone, PartialEq, Queryable, Selectable)]
#[diesel(table_name = device_tombstones)]
#[diesel(check_for_backend(diesel::pg::Pg))]
pub struct DeviceTombstone {
    pub device_id: Uuid,
    pub protocol: String,
    pub external_id: String,
    pub friendly_name: String,
    pub device_type: String,
    pub model: Option<String>,
    pub room_id: Option<Uuid>,
    pub component_rooms: serde_json::Value,
    pub removed_at: DateTime<Utc>,
}

pub fn room_exists(conn: &mut PgConnection, room_id: Uuid) -> QueryResult<bool> {
    diesel::select(diesel::dsl::exists(
        rooms::table.filter(rooms::id.eq(room_id)),
    ))
    .get_result(conn)
}

/// `None` clears the assignment so the Component inherits its Device's Room.
pub fn set_component_room(
    conn: &mut PgConnection,
    device_id: Uuid,
    component_id: &str,
    room_id: Option<Uuid>,
) -> QueryResult<()> {
    let assignment = component_rooms::table
        .filter(component_rooms::device_id.eq(device_id))
        .filter(component_rooms::component_id.eq(component_id));
    match room_id {
        None => {
            diesel::delete(assignment).execute(conn)?;
        }
        Some(room_id) => {
            diesel::insert_into(component_rooms::table)
                .values((
                    component_rooms::device_id.eq(device_id),
                    component_rooms::component_id.eq(component_id),
                    component_rooms::room_id.eq(room_id),
                ))
                .on_conflict((component_rooms::device_id, component_rooms::component_id))
                .do_update()
                .set(component_rooms::room_id.eq(room_id))
                .execute(conn)?;
        }
    }
    Ok(())
}

/// Component Room assignments for every Device, keyed by Device ID.
pub fn load_component_rooms(
    conn: &mut PgConnection,
) -> QueryResult<BTreeMap<Uuid, BTreeMap<String, Uuid>>> {
    let rows = component_rooms::table
        .select((
            component_rooms::device_id,
            component_rooms::component_id,
            component_rooms::room_id,
        ))
        .load::<(Uuid, String, Uuid)>(conn)?;
    let mut by_device: BTreeMap<Uuid, BTreeMap<String, Uuid>> = BTreeMap::new();
    for (device_id, component_id, room_id) in rows {
        by_device
            .entry(device_id)
            .or_default()
            .insert(component_id, room_id);
    }
    Ok(by_device)
}

/// Ends the Device's active identity and keeps its identity and metadata as
/// a Device tombstone. Returns the tombstone, or `None` when no such Device.
pub fn tombstone_and_delete_device(
    conn: &mut PgConnection,
    device_id: Uuid,
    removed_at: DateTime<Utc>,
) -> QueryResult<Option<DeviceTombstone>> {
    conn.transaction(|conn| {
        let Some(device) = devices::table
            .filter(devices::id.eq(device_id))
            .select(Device::as_select())
            .for_update()
            .first::<Device>(conn)
            .optional()?
        else {
            return Ok(None);
        };
        let components: serde_json::Map<String, serde_json::Value> = component_rooms::table
            .filter(component_rooms::device_id.eq(device_id))
            .select((component_rooms::component_id, component_rooms::room_id))
            .load::<(String, Uuid)>(conn)?
            .into_iter()
            .map(|(component_id, room_id)| (component_id, room_id.to_string().into()))
            .collect();
        let tombstone = DeviceTombstone {
            device_id,
            protocol: device.protocol,
            external_id: device.external_id,
            friendly_name: device.friendly_name,
            device_type: device.device_type,
            model: device.model,
            room_id: device.room_id,
            component_rooms: serde_json::Value::Object(components),
            removed_at,
        };
        diesel::insert_into(device_tombstones::table)
            .values((
                device_tombstones::device_id.eq(tombstone.device_id),
                device_tombstones::protocol.eq(&tombstone.protocol),
                device_tombstones::external_id.eq(&tombstone.external_id),
                device_tombstones::friendly_name.eq(&tombstone.friendly_name),
                device_tombstones::device_type.eq(&tombstone.device_type),
                device_tombstones::model.eq(&tombstone.model),
                device_tombstones::room_id.eq(tombstone.room_id),
                device_tombstones::component_rooms.eq(&tombstone.component_rooms),
                device_tombstones::removed_at.eq(tombstone.removed_at),
            ))
            .execute(conn)?;
        diesel::delete(devices::table.filter(devices::id.eq(device_id))).execute(conn)?;
        Ok(Some(tombstone))
    })
}

/// Deletes a Room only when no Device or Component is assigned to it.
pub fn delete_room_if_empty(conn: &mut PgConnection, room_id: Uuid) -> QueryResult<RoomDeletion> {
    conn.transaction(|conn| {
        let locked = rooms::table
            .filter(rooms::id.eq(room_id))
            .select(rooms::id)
            .for_update()
            .first::<Uuid>(conn)
            .optional()?;
        if locked.is_none() {
            return Ok(RoomDeletion::NotFound);
        }
        let occupied = diesel::select(diesel::dsl::exists(
            devices::table.filter(devices::room_id.eq(room_id)),
        ))
        .get_result::<bool>(conn)?
            || diesel::select(diesel::dsl::exists(
                component_rooms::table.filter(component_rooms::room_id.eq(room_id)),
            ))
            .get_result::<bool>(conn)?;
        if occupied {
            return Ok(RoomDeletion::NotEmpty);
        }
        diesel::delete(rooms::table.filter(rooms::id.eq(room_id))).execute(conn)?;
        Ok(RoomDeletion::Deleted)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::{NewDevice, NewRoom, Room};

    fn connection() -> PgConnection {
        let url = std::env::var("CAPABILITY_TEST_DATABASE_URL")
            .expect("CAPABILITY_TEST_DATABASE_URL must name the isolated test database");
        PgConnection::establish(&url).expect("connect to the isolated test database")
    }

    fn insert_room(conn: &mut PgConnection, name: &str) -> Uuid {
        diesel::insert_into(rooms::table)
            .values(NewRoom {
                name,
                sort_order: 0,
            })
            .returning(Room::as_returning())
            .get_result::<Room>(conn)
            .unwrap()
            .id
    }

    fn insert_device(conn: &mut PgConnection, room_id: Option<Uuid>) -> Device {
        let external_id = format!("0x{}", &Uuid::new_v4().simple().to_string()[..16]);
        let device = diesel::insert_into(devices::table)
            .values(NewDevice {
                external_id: &external_id,
                protocol: "zigbee",
                friendly_name: "Desk lamp",
                device_type: "light",
                model: Some("LED1623G12"),
                enabled: true,
            })
            .returning(Device::as_returning())
            .get_result::<Device>(conn)
            .unwrap();
        diesel::update(devices::table.filter(devices::id.eq(device.id)))
            .set(devices::room_id.eq(room_id))
            .returning(Device::as_returning())
            .get_result::<Device>(conn)
            .unwrap()
    }

    #[test]
    #[ignore = "requires the isolated PostgreSQL database created by the verification script"]
    fn removing_a_device_keeps_a_device_tombstone() {
        let mut conn = connection();
        let room = insert_room(&mut conn, "Study");
        let other_room = insert_room(&mut conn, "Hall");
        let device = insert_device(&mut conn, Some(room));
        set_component_room(&mut conn, device.id, "l2", Some(other_room)).unwrap();
        let removed_at = Utc::now();

        let tombstone = tombstone_and_delete_device(&mut conn, device.id, removed_at)
            .unwrap()
            .expect("tombstone");

        let remaining = devices::table
            .filter(devices::id.eq(device.id))
            .count()
            .get_result::<i64>(&mut conn)
            .unwrap();
        assert_eq!(remaining, 0, "the active Device is gone");
        let stored = device_tombstones::table
            .filter(device_tombstones::device_id.eq(device.id))
            .select(DeviceTombstone::as_select())
            .get_result::<DeviceTombstone>(&mut conn)
            .unwrap();
        assert_eq!(stored.external_id, device.external_id);
        assert_eq!(stored.protocol, "zigbee");
        assert_eq!(stored.friendly_name, "Desk lamp");
        assert_eq!(stored.model.as_deref(), Some("LED1623G12"));
        assert_eq!(stored.room_id, Some(room));
        assert_eq!(
            stored.component_rooms,
            serde_json::json!({ "l2": other_room.to_string() })
        );
        assert_eq!(tombstone.device_id, device.id);
        assert!(
            load_component_rooms(&mut conn)
                .unwrap()
                .get(&device.id)
                .is_none(),
            "Component assignments end with the active Device"
        );
        assert_eq!(
            tombstone_and_delete_device(&mut conn, device.id, removed_at).unwrap(),
            None
        );
    }

    #[test]
    #[ignore = "requires the isolated PostgreSQL database created by the verification script"]
    fn component_room_assignments_override_and_clear() {
        let mut conn = connection();
        let room = insert_room(&mut conn, "Lounge");
        let device = insert_device(&mut conn, None);

        set_component_room(&mut conn, device.id, "outlet-1", Some(room)).unwrap();
        assert_eq!(
            load_component_rooms(&mut conn).unwrap().get(&device.id),
            Some(&BTreeMap::from([("outlet-1".to_string(), room)]))
        );
        set_component_room(&mut conn, device.id, "outlet-1", None).unwrap();
        assert!(
            load_component_rooms(&mut conn)
                .unwrap()
                .get(&device.id)
                .is_none()
        );
        assert!(room_exists(&mut conn, room).unwrap());
        assert!(!room_exists(&mut conn, Uuid::new_v4()).unwrap());
    }

    #[test]
    #[ignore = "requires the isolated PostgreSQL database created by the verification script"]
    fn rooms_are_deleted_only_after_their_devices_and_components_move() {
        let mut conn = connection();
        let room = insert_room(&mut conn, "Garage");
        let device = insert_device(&mut conn, Some(room));
        assert_eq!(
            delete_room_if_empty(&mut conn, room).unwrap(),
            RoomDeletion::NotEmpty
        );

        diesel::update(devices::table.filter(devices::id.eq(device.id)))
            .set(devices::room_id.eq(None::<Uuid>))
            .execute(&mut conn)
            .unwrap();
        set_component_room(&mut conn, device.id, "outlet-2", Some(room)).unwrap();
        assert_eq!(
            delete_room_if_empty(&mut conn, room).unwrap(),
            RoomDeletion::NotEmpty
        );

        set_component_room(&mut conn, device.id, "outlet-2", None).unwrap();
        assert_eq!(
            delete_room_if_empty(&mut conn, room).unwrap(),
            RoomDeletion::Deleted
        );
        assert_eq!(
            delete_room_if_empty(&mut conn, room).unwrap(),
            RoomDeletion::NotFound
        );
    }
}
