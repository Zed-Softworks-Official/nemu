//! The lowest and highest values a Device accepts, read from the `exposes` its
//! bridge publishes in `bridge/devices`. Zigbee2MQTT fills them from the
//! Device's definition; the Matter adapter from the Device's own attributes.
//!
//! Limits live in memory: `bridge/devices` is retained, so they come back when
//! the Controller reconnects to MQTT. A control whose limits a Device does not
//! report, or reports as something unusable, is left out here. Clients then
//! fall back to the ranges in `@nemu/protocol` `device-limits.ts`.

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::mqtt::z2m::Z2mDeviceDescriptor;

/// 1000 K, warmer than any lamp. Matter's "no limit" default is above this.
const MAX_PLAUSIBLE_MIREDS: i64 = 1000;
const ACCESS_SET: u64 = 0b010;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValueRange {
    pub min: i64,
    pub max: i64,
}

/// Matches `@nemu/protocol` `deviceLimitsSchema`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceLimits {
    /// In the Device's native steps, 0-254 for most.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub brightness: Option<ValueRange>,
    /// In mireds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color_temp: Option<ValueRange>,
}

impl DeviceLimits {
    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }
}

pub fn limits_from_descriptor(descriptor: &Z2mDeviceDescriptor) -> DeviceLimits {
    let Some(exposes) = descriptor
        .definition
        .as_ref()
        .and_then(|definition| definition.exposes.as_deref())
    else {
        return DeviceLimits::default();
    };
    DeviceLimits {
        brightness: exposed_range(exposes, "brightness").filter(|range| range.min >= 0),
        color_temp: exposed_range(exposes, "color_temp")
            .filter(|range| range.min > 0 && range.max <= MAX_PLAUSIBLE_MIREDS),
    }
}

/// The range of a settable numeric property, at the top level or among the
/// features of a light or switch.
fn exposed_range(exposes: &[JsonValue], property: &str) -> Option<ValueRange> {
    exposes.iter().find_map(|expose| {
        value_range(expose, property).or_else(|| {
            let features = expose.get("features")?.as_array()?;
            features
                .iter()
                .find_map(|feature| value_range(feature, property))
        })
    })
}

fn value_range(expose: &JsonValue, property: &str) -> Option<ValueRange> {
    if expose.get("property")?.as_str()? != property {
        return None;
    }
    let settable = expose
        .get("access")
        .and_then(JsonValue::as_u64)
        .is_none_or(|access| access & ACCESS_SET != 0);
    if !settable {
        return None;
    }
    let min = expose.get("value_min")?.as_f64()?.ceil() as i64;
    let max = expose.get("value_max")?.as_f64()?.floor() as i64;
    (min < max).then_some(ValueRange { min, max })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn limits(exposes: JsonValue) -> DeviceLimits {
        limits_from_descriptor(
            &serde_json::from_value(json!({
                "ieee_address": "0x1",
                "friendly_name": "Lamp",
                "type": "Router",
                "definition": { "model": "M", "exposes": exposes }
            }))
            .unwrap(),
        )
    }

    fn numeric(property: &str, min: JsonValue, max: JsonValue) -> JsonValue {
        json!({
            "type": "numeric", "name": property, "property": property,
            "access": 7, "value_min": min, "value_max": max
        })
    }

    #[test]
    fn reads_light_feature_limits() {
        let found = limits(json!([
            { "type": "light", "features": [
                { "type": "binary", "property": "state", "access": 7 },
                numeric("brightness", json!(0), json!(254)),
                numeric("color_temp", json!(250), json!(454)),
            ]},
            { "type": "numeric", "property": "linkquality", "access": 1 }
        ]));
        assert_eq!(
            serde_json::to_value(found).unwrap(),
            json!({
                "brightness": { "min": 0, "max": 254 },
                "colorTemp": { "min": 250, "max": 454 }
            })
        );
    }

    #[test]
    fn a_device_that_reports_no_limits_has_none() {
        assert!(limits(json!([])).is_empty());
        assert!(
            limits(json!([{ "type": "light", "features": [
                { "type": "numeric", "property": "brightness", "access": 7 }
            ]}]))
            .is_empty()
        );
    }

    #[test]
    fn unusable_limits_are_dropped() {
        assert!(limits(json!([numeric("color_temp", json!(0), json!(65279))])).is_empty());
        assert!(limits(json!([numeric("color_temp", json!(153), json!(65279))])).is_empty());
        assert!(limits(json!([numeric("brightness", json!(254), json!(0))])).is_empty());
        assert!(limits(json!([numeric("brightness", json!("0"), json!(254))])).is_empty());
    }

    #[test]
    fn a_read_only_reading_is_not_a_limit() {
        assert!(
            limits(json!([{
                "type": "numeric", "property": "brightness", "access": 1,
                "value_min": 0, "value_max": 100
            }]))
            .is_empty()
        );
    }
}
