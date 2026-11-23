//! PostgreSQL storage for Device and Room setup: Device tombstones
//! (ADR-0017), Component Room assignments, and Room deletion that moves the
//! Room's contents to a destination.

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use diesel::pg::PgConnection;
use diesel::prelude::*;
use uuid::Uuid;

use crate::audit::{self, AuditWrite};
use crate::db::models::Device;
use crate::db::schema::{component_rooms, device_tombstones, devices, rooms};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RoomDeletion {
    Deleted(RoomMove),
    NotFound,
    /// The destination is the Room being deleted.
    DestinationIsRoom,
    /// The destination Room does not exist.
    DestinationNotFound,
}

/// What a Room deletion moved, and where.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RoomMove {
    pub room_id: Uuid,
    pub room_name: String,
    /// `None` is No Room.
    pub destination: Option<Uuid>,
    pub devices_moved: usize,
    pub components_moved: usize,
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

/// In one transaction: moves every Device in the Room, and every Component
/// explicitly assigned to it, to `destination` (`None` is No Room), writes the
/// Audit log entry that `audit` builds, and deletes the Room. Nothing changes
/// unless every step succeeds.
///
/// `component_rooms.room_id` is not nullable, so a Component moving to No Room
/// loses its explicit assignment and follows its Device's Room again.
pub fn delete_room_moving_contents(
    conn: &mut PgConnection,
    room_id: Uuid,
    destination: Option<Uuid>,
    audit: impl FnOnce(&RoomMove) -> AuditWrite,
) -> QueryResult<RoomDeletion> {
    if destination == Some(room_id) {
        return Ok(RoomDeletion::DestinationIsRoom);
    }
    conn.transaction(|conn| {
        let Some(room_name) = rooms::table
            .filter(rooms::id.eq(room_id))
            .select(rooms::name)
            .for_update()
            .first::<String>(conn)
            .optional()?
        else {
            return Ok(RoomDeletion::NotFound);
        };
        if let Some(destination) = destination {
            // Keep the destination from being deleted while contents move in.
            let present = rooms::table
                .filter(rooms::id.eq(destination))
                .select(rooms::id)
                .for_share()
                .first::<Uuid>(conn)
                .optional()?;
            if present.is_none() {
                return Ok(RoomDeletion::DestinationNotFound);
            }
        }
        let devices_moved = diesel::update(devices::table.filter(devices::room_id.eq(room_id)))
            .set((
                devices::room_id.eq(destination),
                devices::updated_at.eq(Utc::now()),
            ))
            .execute(conn)?;
        let assigned = component_rooms::table.filter(component_rooms::room_id.eq(room_id));
        let components_moved = match destination {
            Some(destination) => diesel::update(assigned)
                .set(component_rooms::room_id.eq(destination))
                .execute(conn)?,
            None => diesel::delete(assigned).execute(conn)?,
        };
        let moved = RoomMove {
            room_id,
            room_name,
            destination,
            devices_moved,
            components_moved,
        };
        audit::insert_on(conn, &audit(&moved))?;
        diesel::delete(rooms::table.filter(rooms::id.eq(room_id))).execute(conn)?;
        Ok(RoomDeletion::Deleted(moved))
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
            !load_component_rooms(&mut conn)
                .unwrap()
                .contains_key(&device.id),
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
            !load_component_rooms(&mut conn)
                .unwrap()
                .contains_key(&device.id)
        );
        assert!(room_exists(&mut conn, room).unwrap());
        assert!(!room_exists(&mut conn, Uuid::new_v4()).unwrap());
    }

    fn room_deletion_audits(conn: &mut PgConnection, room_id: Uuid) -> Vec<serde_json::Value> {
        use crate::db::schema::audit_records;
        audit_records::table
            .filter(audit_records::kind.eq(crate::audit::AuditKind::RoomDeletion.as_str()))
            .select(audit_records::detail)
            .load::<serde_json::Value>(conn)
            .unwrap()
            .into_iter()
            .filter(|detail| detail["roomId"] == serde_json::json!(room_id))
            .collect()
    }

    fn device_room(conn: &mut PgConnection, device_id: Uuid) -> Option<Uuid> {
        devices::table
            .filter(devices::id.eq(device_id))
            .select(devices::room_id)
            .get_result(conn)
            .unwrap()
    }

    fn audit_for(moved: &RoomMove) -> AuditWrite {
        crate::setup::room_deletion_audit(Some("user-1".into()), moved)
    }

    #[test]
    #[ignore = "requires the isolated PostgreSQL database created by the verification script"]
    fn deleting_a_room_moves_its_devices_and_components_to_another_room() {
        let mut conn = connection();
        let room = insert_room(&mut conn, "Garage");
        let destination = insert_room(&mut conn, "Hall");
        let elsewhere = insert_room(&mut conn, "Study");
        let lamp = insert_device(&mut conn, Some(room));
        let fan = insert_device(&mut conn, Some(room));
        let strip = insert_device(&mut conn, Some(elsewhere));
        set_component_room(&mut conn, strip.id, "l1", Some(room)).unwrap();
        set_component_room(&mut conn, strip.id, "l2", Some(elsewhere)).unwrap();

        let deletion =
            delete_room_moving_contents(&mut conn, room, Some(destination), audit_for).unwrap();

        assert_eq!(
            deletion,
            RoomDeletion::Deleted(RoomMove {
                room_id: room,
                room_name: "Garage".into(),
                destination: Some(destination),
                devices_moved: 2,
                components_moved: 1,
            })
        );
        assert!(!room_exists(&mut conn, room).unwrap(), "the Room is gone");
        assert_eq!(device_room(&mut conn, lamp.id), Some(destination));
        assert_eq!(device_room(&mut conn, fan.id), Some(destination));
        assert_eq!(device_room(&mut conn, strip.id), Some(elsewhere));
        assert_eq!(
            load_component_rooms(&mut conn).unwrap().get(&strip.id),
            Some(&BTreeMap::from([
                ("l1".to_string(), destination),
                ("l2".to_string(), elsewhere),
            ]))
        );
        let audits = room_deletion_audits(&mut conn, room);
        assert_eq!(audits.len(), 1, "exactly one Audit log entry");
        assert_eq!(
            audits[0]["destinationRoomId"],
            serde_json::json!(destination)
        );
        assert_eq!(audits[0]["devicesMoved"], 2);
        assert_eq!(audits[0]["componentsMoved"], 1);
    }

    #[test]
    #[ignore = "requires the isolated PostgreSQL database created by the verification script"]
    fn deleting_a_room_to_no_room_unassigns_its_devices_and_components() {
        let mut conn = connection();
        let room = insert_room(&mut conn, "Attic");
        let elsewhere = insert_room(&mut conn, "Porch");
        let lamp = insert_device(&mut conn, Some(room));
        let strip = insert_device(&mut conn, Some(elsewhere));
        set_component_room(&mut conn, strip.id, "l1", Some(room)).unwrap();

        let deletion = delete_room_moving_contents(&mut conn, room, None, audit_for).unwrap();

        assert!(matches!(
            deletion,
            RoomDeletion::Deleted(RoomMove {
                destination: None,
                devices_moved: 1,
                components_moved: 1,
                ..
            })
        ));
        assert!(!room_exists(&mut conn, room).unwrap());
        assert_eq!(device_room(&mut conn, lamp.id), None);
        assert!(
            !load_component_rooms(&mut conn)
                .unwrap()
                .contains_key(&strip.id),
            "the Component follows its Device's Room again"
        );
        let audits = room_deletion_audits(&mut conn, room);
        assert_eq!(audits.len(), 1);
        assert_eq!(audits[0]["destinationRoomId"], serde_json::Value::Null);
    }

    #[test]
    #[ignore = "requires the isolated PostgreSQL database created by the verification script"]
    fn deleting_a_room_to_an_invalid_destination_changes_nothing() {
        let mut conn = connection();
        let room = insert_room(&mut conn, "Cellar");
        let elsewhere = insert_room(&mut conn, "Loft");
        let lamp = insert_device(&mut conn, Some(room));
        let strip = insert_device(&mut conn, Some(elsewhere));
        set_component_room(&mut conn, strip.id, "l1", Some(room)).unwrap();

        assert_eq!(
            delete_room_moving_contents(&mut conn, room, Some(room), audit_for).unwrap(),
            RoomDeletion::DestinationIsRoom
        );
        assert_eq!(
            delete_room_moving_contents(&mut conn, room, Some(Uuid::new_v4()), audit_for).unwrap(),
            RoomDeletion::DestinationNotFound
        );

        assert!(room_exists(&mut conn, room).unwrap(), "the Room remains");
        assert_eq!(device_room(&mut conn, lamp.id), Some(room));
        assert_eq!(
            load_component_rooms(&mut conn).unwrap().get(&strip.id),
            Some(&BTreeMap::from([("l1".to_string(), room)]))
        );
        assert!(room_deletion_audits(&mut conn, room).is_empty());
        assert_eq!(
            delete_room_moving_contents(&mut conn, Uuid::new_v4(), None, audit_for).unwrap(),
            RoomDeletion::NotFound
        );
    }
}
