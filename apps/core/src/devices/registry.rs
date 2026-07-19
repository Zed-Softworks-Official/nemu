use chrono::Utc;
use diesel::prelude::*;
use diesel::upsert::excluded;
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;
use uuid::Uuid;

use crate::db::models::{Device, NewDevice, NewDeviceEvent, UpdateDevice};
use crate::db::schema::{device_events, devices};
use crate::events::{DeviceEvent, DeviceResource};
use crate::mqtt::z2m::Z2mDeviceDescriptor;
use crate::state::{AppState, DbPool};

/// In-memory index over Postgres devices, keyed by ieee address and friendly name.
#[derive(Debug, Default)]
pub struct DeviceRegistry {
    by_ieee: RwLock<HashMap<String, Uuid>>,
    by_name: RwLock<HashMap<String, Uuid>>,
    by_id: RwLock<HashMap<Uuid, Device>>,
}

impl DeviceRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn load_from_db(&self, pool: &DbPool) -> Result<(), String> {
        let conn = pool.get().await.map_err(|e| e.to_string())?;
        let rows = conn
            .interact(|conn| {
                devices::table
                    .select(Device::as_select())
                    .load::<Device>(conn)
            })
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;

        let mut by_ieee = HashMap::new();
        let mut by_name = HashMap::new();
        let mut by_id = HashMap::new();
        for device in rows {
            by_ieee.insert(device.ieee_address.clone(), device.id);
            by_name.insert(device.friendly_name.clone(), device.id);
            by_id.insert(device.id, device);
        }

        *self.by_ieee.write().await = by_ieee;
        *self.by_name.write().await = by_name;
        *self.by_id.write().await = by_id;
        Ok(())
    }

    pub async fn get(&self, id: Uuid) -> Option<Device> {
        self.by_id.read().await.get(&id).cloned()
    }

    pub async fn get_by_ieee(&self, ieee: &str) -> Option<Device> {
        let id = self.by_ieee.read().await.get(ieee).copied()?;
        self.get(id).await
    }

    pub async fn get_by_name(&self, name: &str) -> Option<Device> {
        let id = self.by_name.read().await.get(name).copied()?;
        self.get(id).await
    }

    pub async fn list(&self) -> Vec<Device> {
        self.by_id.read().await.values().cloned().collect()
    }

    pub async fn list_by_room(&self, room_id: Uuid) -> Vec<Device> {
        self.by_id
            .read()
            .await
            .values()
            .filter(|d| d.room_id == Some(room_id))
            .cloned()
            .collect()
    }

    async fn put(&self, device: Device) {
        let mut by_ieee = self.by_ieee.write().await;
        let mut by_name = self.by_name.write().await;
        let mut by_id = self.by_id.write().await;

        if let Some(old) = by_id.get(&device.id) {
            by_ieee.remove(&old.ieee_address);
            by_name.remove(&old.friendly_name);
        }

        by_ieee.insert(device.ieee_address.clone(), device.id);
        by_name.insert(device.friendly_name.clone(), device.id);
        by_id.insert(device.id, device);
    }

    async fn remove_id(&self, id: Uuid) -> Option<Device> {
        let mut by_ieee = self.by_ieee.write().await;
        let mut by_name = self.by_name.write().await;
        let mut by_id = self.by_id.write().await;
        let device = by_id.remove(&id)?;
        by_ieee.remove(&device.ieee_address);
        by_name.remove(&device.friendly_name);
        Some(device)
    }

    /// Sync registry from a full `bridge/devices` payload.
    pub async fn sync_from_bridge(
        self: &Arc<Self>,
        state: &AppState,
        descriptors: &[Z2mDeviceDescriptor],
    ) -> Result<(), String> {
        let pool = &state.db;
        let now = Utc::now();

        let mut seen_ieee = HashSet::new();
        let mut upserted = Vec::new();

        for desc in descriptors {
            // Skip the coordinator — not a controllable end device.
            if desc.device_type.eq_ignore_ascii_case("Coordinator") {
                continue;
            }

            seen_ieee.insert(desc.ieee_address.clone());
            let model = desc
                .definition
                .as_ref()
                .and_then(|d| d.model.clone())
                .or_else(|| desc.model_id.clone());
            let device_type = infer_device_type(desc);

            let conn = pool.get().await.map_err(|e| e.to_string())?;
            let ieee = desc.ieee_address.clone();
            let friendly = desc.friendly_name.clone();
            let dtype = device_type.clone();
            let model_owned = model.clone();

            let device = conn
                .interact(move |conn| {
                    diesel::insert_into(devices::table)
                        .values(NewDevice {
                            ieee_address: &ieee,
                            friendly_name: &friendly,
                            device_type: &dtype,
                            model: model_owned.as_deref(),
                            enabled: true,
                        })
                        .on_conflict(devices::ieee_address)
                        .do_update()
                        .set((
                            devices::friendly_name.eq(excluded(devices::friendly_name)),
                            devices::device_type.eq(excluded(devices::device_type)),
                            devices::model.eq(excluded(devices::model)),
                            devices::updated_at.eq(now),
                        ))
                        .returning(Device::as_returning())
                        .get_result::<Device>(conn)
                })
                .await
                .map_err(|e| e.to_string())?
                .map_err(|e| e.to_string())?;

            upserted.push(device);
        }

        for device in upserted {
            self.put(device).await;
        }

        // Remove devices no longer present in z2m.
        let existing: Vec<Device> = self.list().await;
        for device in existing {
            if !seen_ieee.contains(&device.ieee_address) {
                let id = device.id;
                let conn = pool.get().await.map_err(|e| e.to_string())?;
                conn.interact(move |conn| {
                    diesel::delete(devices::table.filter(devices::id.eq(id))).execute(conn)
                })
                .await
                .map_err(|e| e.to_string())?
                .map_err(|e| e.to_string())?;

                self.remove_id(id).await;
                state.state_cache.remove(id);
                state.emit(DeviceEvent::DeviceLeft {
                    device_id: id.to_string(),
                });
                info!(ieee = %device.ieee_address, "removed device missing from bridge/devices");
            }
        }

        Ok(())
    }

    pub async fn upsert_from_join(
        self: &Arc<Self>,
        state: &AppState,
        ieee: &str,
        friendly_name: &str,
        device_type: &str,
        model: Option<&str>,
    ) -> Result<Device, String> {
        let pool = &state.db;
        let now = Utc::now();
        let ieee_owned = ieee.to_string();
        let name_owned = friendly_name.to_string();
        let type_owned = device_type.to_string();
        let model_owned = model.map(str::to_string);

        let conn = pool.get().await.map_err(|e| e.to_string())?;
        let device = conn
            .interact(move |conn| {
                diesel::insert_into(devices::table)
                    .values(NewDevice {
                        ieee_address: &ieee_owned,
                        friendly_name: &name_owned,
                        device_type: &type_owned,
                        model: model_owned.as_deref(),
                        enabled: true,
                    })
                    .on_conflict(devices::ieee_address)
                    .do_update()
                    .set((
                        devices::friendly_name.eq(excluded(devices::friendly_name)),
                        devices::device_type.eq(excluded(devices::device_type)),
                        devices::model.eq(excluded(devices::model)),
                        devices::updated_at.eq(now),
                    ))
                    .returning(Device::as_returning())
                    .get_result::<Device>(conn)
            })
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;

        self.put(device.clone()).await;

        let _ = log_event(pool, Some(device.id), "joined", json!({ "ieee": ieee })).await;

        Ok(device)
    }

    pub async fn mark_left(self: &Arc<Self>, state: &AppState, ieee: &str) -> Option<Device> {
        let device = self.get_by_ieee(ieee).await?;
        let id = device.id;
        let pool = &state.db;

        if let Ok(conn) = pool.get().await {
            let _ = conn
                .interact(move |conn| {
                    diesel::delete(devices::table.filter(devices::id.eq(id))).execute(conn)
                })
                .await;
        }

        let removed = self.remove_id(id).await;
        state.state_cache.remove(id);
        state.emit(DeviceEvent::DeviceLeft {
            device_id: id.to_string(),
        });
        let _ = log_event(pool, Some(id), "left", json!({ "ieee": ieee })).await;
        removed
    }

    pub async fn update_device(
        &self,
        pool: &DbPool,
        id: Uuid,
        update: UpdateDevice,
    ) -> Result<Device, String> {
        let conn = pool.get().await.map_err(|e| e.to_string())?;
        let mut update = update;
        update.updated_at = Some(Utc::now());

        let device = conn
            .interact(move |conn| {
                diesel::update(devices::table.filter(devices::id.eq(id)))
                    .set(update)
                    .returning(Device::as_returning())
                    .get_result::<Device>(conn)
            })
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;

        self.put(device.clone()).await;
        Ok(device)
    }

    pub async fn touch_last_seen(&self, pool: &DbPool, id: Uuid) {
        let now = Utc::now();
        if let Ok(conn) = pool.get().await {
            let result = conn
                .interact(move |conn| {
                    diesel::update(devices::table.filter(devices::id.eq(id)))
                        .set(devices::last_seen.eq(Some(now)))
                        .returning(Device::as_returning())
                        .get_result::<Device>(conn)
                })
                .await;
            if let Ok(Ok(device)) = result {
                self.put(device).await;
            }
        }
    }

    pub async fn to_resource(&self, state: &AppState, device: &Device) -> DeviceResource {
        let online = state.state_cache.is_online(device.id);
        let cached = state.state_cache.get_state(device.id);
        DeviceResource::from_device(device, online, cached)
    }
}

fn infer_device_type(desc: &Z2mDeviceDescriptor) -> String {
    if let Some(def) = &desc.definition {
        if let Some(exposes) = &def.exposes {
            for expose in exposes {
                if let Some(e_type) = expose.get("type").and_then(|v| v.as_str()) {
                    if e_type == "light" {
                        return "light".to_string();
                    }
                    if e_type == "switch" {
                        return "switch".to_string();
                    }
                    if e_type == "lock" {
                        return "lock".to_string();
                    }
                    if e_type == "cover" {
                        return "cover".to_string();
                    }
                    if e_type == "fan" {
                        return "fan".to_string();
                    }
                    if e_type == "climate" {
                        return "climate".to_string();
                    }
                }
                if expose.get("property").and_then(|v| v.as_str()) == Some("contact") {
                    return "contact".to_string();
                }
                if expose.get("property").and_then(|v| v.as_str()) == Some("occupancy") {
                    return "occupancy".to_string();
                }
                if expose.get("property").and_then(|v| v.as_str()) == Some("temperature") {
                    return "sensor".to_string();
                }
            }
        }
    }
    desc.device_type.to_lowercase()
}

pub async fn log_event(
    pool: &DbPool,
    device_id: Option<Uuid>,
    kind: &str,
    payload: serde_json::Value,
) -> Result<(), String> {
    let kind = kind.to_string();
    let conn = pool.get().await.map_err(|e| e.to_string())?;
    conn.interact(move |conn| {
        diesel::insert_into(device_events::table)
            .values(NewDeviceEvent {
                device_id,
                kind,
                payload,
            })
            .execute(conn)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Diff helpers used by unit tests.
#[cfg(test)]
pub fn ieee_set_from_descriptors(descriptors: &[Z2mDeviceDescriptor]) -> HashSet<String> {
    descriptors
        .iter()
        .filter(|d| !d.device_type.eq_ignore_ascii_case("Coordinator"))
        .map(|d| d.ieee_address.clone())
        .collect()
}

#[cfg(test)]
pub fn devices_to_remove(existing_ieee: &HashSet<String>, seen: &HashSet<String>) -> Vec<String> {
    existing_ieee
        .iter()
        .filter(|ieee| !seen.contains(*ieee))
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mqtt::z2m::Z2mDeviceDescriptor;

    #[test]
    fn removes_devices_missing_from_bridge() {
        let existing: HashSet<_> = ["0xaaa".into(), "0xbbb".into(), "0xccc".into()].into();
        let descriptors = vec![
            Z2mDeviceDescriptor {
                ieee_address: "0xaaa".into(),
                friendly_name: "A".into(),
                device_type: "Router".into(),
                model_id: None,
                definition: None,
            },
            Z2mDeviceDescriptor {
                ieee_address: "0x0000000000000000".into(),
                friendly_name: "Coordinator".into(),
                device_type: "Coordinator".into(),
                model_id: None,
                definition: None,
            },
        ];
        let seen = ieee_set_from_descriptors(&descriptors);
        let mut removed = devices_to_remove(&existing, &seen);
        removed.sort();
        assert_eq!(removed, vec!["0xbbb".to_string(), "0xccc".to_string()]);
    }

    #[test]
    fn infer_light_from_exposes() {
        let desc = Z2mDeviceDescriptor {
            ieee_address: "0x1".into(),
            friendly_name: "Lamp".into(),
            device_type: "Router".into(),
            model_id: Some("ABC".into()),
            definition: Some(crate::mqtt::z2m::Z2mDefinition {
                model: Some("ABC".into()),
                description: None,
                exposes: Some(vec![json!({ "type": "light", "features": [] })]),
            }),
        };
        assert_eq!(infer_device_type(&desc), "light");
    }
}
