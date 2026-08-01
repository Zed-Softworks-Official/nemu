use diesel::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::{info, warn};

use crate::crypto::ControllerKeypair;
use crate::crypto::generate_controller_id;
use crate::db::models::{NewSetting, Setting};
use crate::db::schema::settings;
use crate::state::DbPool;

const KEY_CONTROLLER_ID: &str = "controller_id";
const KEY_CONTROLLER_NAME: &str = "controller_name";
const KEY_PRIVATE_KEY: &str = "private_key";
const KEY_PUBLIC_KEY: &str = "public_key";

#[derive(Debug, Clone)]
pub struct ControllerIdentity {
    pub controller_id: String,
    pub name: String,
    pub keypair: ControllerKeypair,
}

#[derive(Debug, Serialize, Deserialize)]
struct StringValue {
    value: String,
}

pub async fn load_or_create_identity(
    pool: &DbPool,
    default_name: &str,
) -> Result<ControllerIdentity, String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;

    let default_name = default_name.to_string();
    conn.interact(move |conn| load_or_create_identity_sync(conn, &default_name))
        .await
        .map_err(|e| format!("db interact error: {e}"))?
}

fn load_or_create_identity_sync(
    conn: &mut PgConnection,
    default_name: &str,
) -> Result<ControllerIdentity, String> {
    let controller_id = match get_string(conn, KEY_CONTROLLER_ID)? {
        Some(id) => id,
        None => {
            let id = generate_controller_id();
            set_string(conn, KEY_CONTROLLER_ID, &id)?;
            id
        }
    };

    let name = match get_string(conn, KEY_CONTROLLER_NAME)? {
        Some(name) => name,
        None => {
            set_string(conn, KEY_CONTROLLER_NAME, default_name)?;
            default_name.to_string()
        }
    };

    let keypair = match get_string(conn, KEY_PRIVATE_KEY)? {
        Some(private_key_b64) => ControllerKeypair::from_private_key_b64(&private_key_b64)?,
        None => {
            let keypair = ControllerKeypair::generate();
            set_string(conn, KEY_PRIVATE_KEY, &keypair.private_key_b64)?;
            set_string(conn, KEY_PUBLIC_KEY, &keypair.public_key_b64)?;
            info!(controller_id = %controller_id, "generated new controller keypair");
            keypair
        }
    };

    Ok(ControllerIdentity {
        controller_id,
        name,
        keypair,
    })
}

#[allow(dead_code)]
pub async fn update_controller_name(pool: &DbPool, name: &str) -> Result<(), String> {
    let conn = pool
        .get()
        .await
        .map_err(|e| format!("db pool error: {e}"))?;
    let name = name.to_string();
    conn.interact(move |conn| set_string(conn, KEY_CONTROLLER_NAME, &name))
        .await
        .map_err(|e| format!("db interact error: {e}"))?
}

fn get_string(conn: &mut PgConnection, key: &str) -> Result<Option<String>, String> {
    let row: Option<Setting> = settings::table
        .find(key)
        .first(conn)
        .optional()
        .map_err(|e| format!("settings read failed: {e}"))?;

    match row {
        Some(setting) => {
            if let Ok(parsed) = serde_json::from_value::<StringValue>(setting.value.clone()) {
                return Ok(Some(parsed.value));
            }
            if let Some(s) = setting.value.as_str() {
                return Ok(Some(s.to_string()));
            }
            warn!(key, "settings value is not a string");
            Ok(None)
        }
        None => Ok(None),
    }
}

fn set_string(conn: &mut PgConnection, key: &str, value: &str) -> Result<(), String> {
    let payload = json!({ "value": value });
    diesel::insert_into(settings::table)
        .values(NewSetting {
            key,
            value: payload.clone(),
        })
        .on_conflict(settings::key)
        .do_update()
        .set(settings::value.eq(payload))
        .execute(conn)
        .map_err(|e| format!("settings write failed: {e}"))?;
    Ok(())
}
