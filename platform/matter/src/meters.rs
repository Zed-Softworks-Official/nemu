//! Matter electrical clusters become canonical Capability manifests and
//! observation envelopes. Resolution is one milli-unit, the encoding of the
//! Electrical Power and Energy Measurement clusters.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::store::{load_persisted, persist_atomically};

use crate::mapping::{
    Attributes, CLUSTER_ELECTRICAL_ENERGY, CLUSTER_ELECTRICAL_POWER, EndpointDevice, attr,
    verified_power_milliwatts,
};

pub const PROFILE_REVISION: &str = "matter-electrical-v1";
pub const PROFILE_EFFECTIVE_AT: &str = "2026-01-01T00:00:00Z";
pub const PROFILE_FRESHNESS_MS: u64 = 90_000;
const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;
const MILLI_SCALE: u8 = 3;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MeterPublication {
    pub manifest: Value,
    pub report: Value,
    pub fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedMeter {
    pub fingerprint: String,
    pub observed_at: String,
    pub observation_id: String,
}

pub struct ObservationStamp {
    pub observed_at: String,
    pub observation_id: String,
}

/// Reuse a retained envelope when the reading has not freshly changed.
/// A missing clock never becomes Unix epoch with trustworthy time.
pub fn observation_stamp(
    device_id: &str,
    sequence: u64,
    now: Option<(u64, u128)>,
    previous: Option<&PublishedMeter>,
    fingerprint: &str,
    fresh: bool,
) -> Option<ObservationStamp> {
    if let Some(previous) = previous
        && previous.fingerprint == fingerprint
        && !fresh
    {
        return Some(ObservationStamp {
            observed_at: previous.observed_at.clone(),
            observation_id: previous.observation_id.clone(),
        });
    }
    let (seconds, millis) = now?;
    Some(ObservationStamp {
        observed_at: rfc3339_utc(seconds),
        observation_id: format!("{device_id}:{millis}:{sequence}"),
    })
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct MeterIdentityFile {
    sequence: u64,
    publications: HashMap<String, PublishedMeter>,
}

pub struct MeterIdentityStore {
    path: PathBuf,
    sequence: u64,
    publications: HashMap<String, PublishedMeter>,
    persist_enabled: bool,
}

impl MeterIdentityStore {
    pub fn load(path: impl AsRef<Path>) -> Self {
        let path = path.as_ref().to_path_buf();
        let (file, persist_enabled) =
            load_persisted::<MeterIdentityFile>(&path, "meter identities");
        Self {
            path,
            sequence: file.sequence.max(1),
            publications: file.publications,
            persist_enabled,
        }
    }

    pub fn get(&self, device_id: &str) -> Option<&PublishedMeter> {
        self.publications.get(device_id)
    }

    pub fn next_sequence(&mut self) -> u64 {
        let sequence = self.sequence;
        self.sequence = self.sequence.saturating_add(1);
        sequence
    }

    pub fn insert(&mut self, device_id: &str, published: PublishedMeter) {
        self.publications.insert(device_id.to_string(), published);
        self.persist();
    }

    pub fn remove(&mut self, device_id: &str) {
        if self.publications.remove(device_id).is_some() {
            self.persist();
        }
    }

    fn persist(&self) {
        if !self.persist_enabled {
            return;
        }
        if let Some(parent) = self.path.parent()
            && let Err(error) = std::fs::create_dir_all(parent)
        {
            tracing::warn!(error = %error, "failed to create meter identity directory");
            return;
        }
        let body = MeterIdentityFile {
            sequence: self.sequence,
            publications: self.publications.clone(),
        };
        match serde_json::to_string_pretty(&body) {
            Ok(raw) => {
                if let Err(error) = persist_atomically(&self.path, &raw) {
                    tracing::warn!(error = %error, "failed to write meter identities");
                }
            }
            Err(error) => tracing::warn!(error = %error, "failed to serialize meter identities"),
        }
    }
}

pub fn rfc3339_utc(seconds: u64) -> String {
    let days = (seconds / 86_400) as i64;
    let tod = seconds % 86_400;
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let mut year = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    if month <= 2 {
        year += 1;
    }
    let hour = tod / 3_600;
    let minute = (tod % 3_600) / 60;
    let second = tod % 60;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

pub fn identity_key(kind: &str, scope_kind: &str, component_id: Option<&str>) -> String {
    format!("{kind}|{scope_kind}|{}", component_id.unwrap_or(""))
}

pub fn assigned_capability_ids(payload: &Value) -> HashMap<String, String> {
    let mut assigned = HashMap::new();
    let Some(capabilities) = payload.get("capabilities").and_then(Value::as_array) else {
        return assigned;
    };
    for capability in capabilities {
        let Some(identity) = capability.get("identity") else {
            continue;
        };
        let Some(capability_id) = capability.get("capabilityId").and_then(Value::as_str) else {
            continue;
        };
        let kind = identity.get("kind").and_then(Value::as_str).unwrap_or("");
        let scope = identity
            .pointer("/physicalScope/kind")
            .and_then(Value::as_str)
            .unwrap_or("");
        let component_id = identity
            .pointer("/physicalScope/componentId")
            .and_then(Value::as_str);
        assigned.insert(
            identity_key(kind, scope, component_id),
            capability_id.to_string(),
        );
    }
    assigned
}

pub fn meter_publication(
    device: &EndpointDevice,
    attributes: &Attributes,
    observed_at: &str,
    observation_id: &str,
    capability_ids: &HashMap<String, String>,
) -> Option<MeterPublication> {
    let readings = readings_for(device, attributes);
    if readings.is_empty() {
        return None;
    }

    let fingerprint = readings
        .iter()
        .map(|reading| format!("{}={}", reading.key, reading.value))
        .collect::<Vec<_>>()
        .join(";");
    let capabilities = readings
        .iter()
        .map(|reading| capability_json(device, reading))
        .collect::<Vec<_>>();
    let observations = readings
        .iter()
        .map(|reading| observation_json(device, reading, capability_ids))
        .collect::<Vec<_>>();

    Some(MeterPublication {
        manifest: json!({
            "schemaVersion": 1,
            "supportedObservationEnvelopeVersions": [1],
            "device": {
                "protocol": "matter",
                "externalId": device.id,
            },
            "capabilities": capabilities,
        }),
        report: json!({
            "schemaVersion": 1,
            "observationId": observation_id,
            "observedAt": observed_at,
            "timeTrust": "trustworthy",
            "observations": observations,
        }),
        fingerprint,
    })
}

struct Reading {
    key: String,
    kind: &'static str,
    unit: &'static str,
    directionality: &'static str,
    scope_kind: &'static str,
    component_id: Option<String>,
    component_path: Vec<String>,
    value: i64,
}

fn readings_for(device: &EndpointDevice, attributes: &Attributes) -> Vec<Reading> {
    let mut readings = Vec::new();
    let mut seen = HashSet::new();
    for (endpoint, scope_kind, component_id) in endpoint_subjects(device) {
        for reading in endpoint_readings(endpoint, scope_kind, component_id, attributes) {
            if seen.insert(reading.key.clone()) {
                readings.push(reading);
            }
        }
    }
    readings
}

fn endpoint_subjects(device: &EndpointDevice) -> Vec<(u16, &'static str, Option<String>)> {
    let mut subjects = Vec::new();
    if let Some(outlets) = &device.outlets {
        for outlet in outlets {
            subjects.push((
                outlet.endpoint_id,
                "component",
                Some(outlet.endpoint_id.to_string()),
            ));
        }
        if let Some(energy) = device.energy_endpoint_id
            && outlets.iter().all(|outlet| outlet.endpoint_id != energy)
        {
            subjects.push((energy, "device", None));
        }
        return subjects;
    }

    if let Some(energy) = device.energy_endpoint_id {
        subjects.push((energy, "device", None));
        if energy != device.endpoint_id {
            subjects.push((device.endpoint_id, "device", None));
        }
    } else {
        subjects.push((device.endpoint_id, "device", None));
    }
    subjects
}

fn endpoint_readings(
    endpoint: u16,
    scope_kind: &'static str,
    component_id: Option<String>,
    attributes: &Attributes,
) -> Vec<Reading> {
    let mut readings = Vec::new();
    let path = component_id.clone().into_iter().collect::<Vec<_>>();
    if let Some(value) = verified_power_milliwatts(attributes, endpoint) {
        readings.push(Reading {
            key: identity_key("power", scope_kind, component_id.as_deref()),
            kind: "power",
            unit: "W",
            directionality: "bidirectional",
            scope_kind,
            component_id: component_id.clone(),
            component_path: path.clone(),
            value,
        });
    }
    if let Some(value) = integer_attr(attributes, endpoint, CLUSTER_ELECTRICAL_POWER, 4)
        .or_else(|| integer_attr(attributes, endpoint, CLUSTER_ELECTRICAL_POWER, 11))
    {
        readings.push(gauge(
            "voltage",
            "V",
            scope_kind,
            component_id.clone(),
            path.clone(),
            value,
        ));
    }
    if let Some(value) = integer_attr(attributes, endpoint, CLUSTER_ELECTRICAL_POWER, 5)
        .or_else(|| integer_attr(attributes, endpoint, CLUSTER_ELECTRICAL_POWER, 12))
    {
        readings.push(gauge(
            "current",
            "A",
            scope_kind,
            component_id.clone(),
            path.clone(),
            value,
        ));
    }
    if let Some(value) = energy_milliwatt_hours(attributes, endpoint, 1) {
        readings.push(gauge(
            "importedEnergy",
            "Wh",
            scope_kind,
            component_id.clone(),
            path.clone(),
            value,
        ));
    }
    if let Some(value) = energy_milliwatt_hours(attributes, endpoint, 2) {
        readings.push(gauge(
            "exportedEnergy",
            "Wh",
            scope_kind,
            component_id,
            path,
            value,
        ));
    }
    readings
}

fn gauge(
    kind: &'static str,
    unit: &'static str,
    scope_kind: &'static str,
    component_id: Option<String>,
    component_path: Vec<String>,
    value: i64,
) -> Reading {
    Reading {
        key: identity_key(kind, scope_kind, component_id.as_deref()),
        kind,
        unit,
        directionality: "nonnegative",
        scope_kind,
        component_id,
        component_path,
        value,
    }
}

fn integer_attr(
    attributes: &Attributes,
    endpoint: u16,
    cluster: u16,
    attribute: u32,
) -> Option<i64> {
    match attr(attributes, endpoint, cluster, attribute)? {
        Value::Number(number) => number.as_i64(),
        _ => None,
    }
}

fn energy_milliwatt_hours(attributes: &Attributes, endpoint: u16, attribute: u32) -> Option<i64> {
    let measurement = attr(attributes, endpoint, CLUSTER_ELECTRICAL_ENERGY, attribute)?;
    let record = measurement.as_object()?;
    record
        .get("0")
        .or_else(|| record.get("energy"))
        .and_then(Value::as_i64)
        .filter(|value| *value >= 0)
}

fn capability_json(device: &EndpointDevice, reading: &Reading) -> Value {
    json!({
        "identity": identity_json(device, reading),
        "unit": reading.unit,
        "directionality": reading.directionality,
        "constraintRevisions": [{
            "revisionId": PROFILE_REVISION,
            "declaredAt": PROFILE_EFFECTIVE_AT,
            "effectiveAt": PROFILE_EFFECTIVE_AT,
            "scale": MILLI_SCALE,
            "bounds": bounds(reading.directionality),
            "resolution": 1,
            "freshnessMs": PROFILE_FRESHNESS_MS,
            "historyAdmission": {
                "maximumObservations": 60,
                "intervalMs": 60000
            }
        }]
    })
}

fn observation_json(
    device: &EndpointDevice,
    reading: &Reading,
    capability_ids: &HashMap<String, String>,
) -> Value {
    let mut observation = json!({
        "identity": identity_json(device, reading),
        "reading": {
            "status": "value",
            "value": {
                "value": reading.value,
                "scale": MILLI_SCALE,
                "constraintRevisionId": PROFILE_REVISION
            }
        }
    });
    if let Some(capability_id) = capability_ids.get(&reading.key)
        && let Some(object) = observation.as_object_mut()
    {
        object.insert("capabilityId".into(), json!(capability_id));
    }
    observation
}

fn identity_json(device: &EndpointDevice, reading: &Reading) -> Value {
    let mut scope = json!({ "kind": reading.scope_kind });
    if let Some(component_id) = &reading.component_id
        && let Some(object) = scope.as_object_mut()
    {
        object.insert("componentId".into(), json!(component_id));
    }
    json!({
        "device": {
            "protocol": "matter",
            "externalId": device.id
        },
        "componentPath": reading.component_path,
        "kind": reading.kind,
        "physicalScope": scope
    })
}

fn bounds(directionality: &str) -> Value {
    if directionality == "bidirectional" {
        json!({ "minimum": -MAX_SAFE_INTEGER, "maximum": MAX_SAFE_INTEGER })
    } else {
        json!({ "minimum": 0, "maximum": MAX_SAFE_INTEGER })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mapping::{Attributes, map_node};
    use serde_json::json;

    fn attributes(pairs: &[(&str, Value)]) -> Attributes {
        pairs
            .iter()
            .map(|(key, value)| ((*key).to_string(), value.clone()))
            .collect()
    }

    fn device_types(types: &[u32]) -> Value {
        Value::Array(
            types
                .iter()
                .map(|device_type| json!({ "0": device_type, "1": 1 }))
                .collect(),
        )
    }

    fn plug_under_load() -> (crate::mapping::EndpointDevice, Attributes) {
        let attrs = attributes(&[
            ("0/29/0", device_types(&[22])),
            ("0/40/3", json!("Smart Plug")),
            ("1/29/0", device_types(&[14])),
            ("1/144/8", json!(0)),
            ("1/144/13", json!(60_000)),
            ("1/144/11", json!(120_100)),
            ("1/144/12", json!(500)),
            ("1/145/1", json!({ "0": 1_500_000 })),
            ("2/29/0", device_types(&[266])),
            ("2/6/0", json!(true)),
        ]);
        let device = map_node("plug-1", &attrs).remove(0);
        (device, attrs)
    }

    #[test]
    fn load_on_rms_power_is_not_a_trustworthy_zero() {
        let (device, attrs) = plug_under_load();
        let publication = meter_publication(
            &device,
            &attrs,
            "2026-10-09T12:00:00Z",
            "obs-1",
            &HashMap::new(),
        )
        .expect("meter publication");
        let observations = publication.report["observations"].as_array().unwrap();
        let power = observations
            .iter()
            .find(|observation| observation["identity"]["kind"] == "power")
            .unwrap();
        assert_eq!(power["reading"]["value"]["value"], 60_000);
        assert_eq!(power["reading"]["value"]["scale"], 3);
        assert_ne!(power["reading"]["value"]["value"], 0);
        let ids = observations
            .iter()
            .map(|observation| observation["identity"]["kind"].as_str().unwrap())
            .collect::<Vec<_>>();
        assert!(ids.contains(&"power"));
        assert!(ids.contains(&"voltage"));
        assert!(ids.contains(&"current"));
        assert!(ids.contains(&"importedEnergy"));
        assert_eq!(observations.len(), 4);
        assert_eq!(publication.report["observationId"], "obs-1");
        assert_eq!(
            publication.manifest["supportedObservationEnvelopeVersions"][0],
            1
        );
    }

    #[test]
    fn returned_capability_id_is_stamped_on_the_next_envelope() {
        let (device, attrs) = plug_under_load();
        let assigned = assigned_capability_ids(&json!({
            "device": { "protocol": "matter", "externalId": "plug-1" },
            "capabilities": [{
                "identity": {
                    "kind": "power",
                    "physicalScope": { "kind": "device" }
                },
                "capabilityId": "11111111-1111-1111-1111-111111111111"
            }]
        }));
        let publication =
            meter_publication(&device, &attrs, "2026-10-09T12:00:00Z", "obs-1", &assigned).unwrap();
        let power = publication.report["observations"]
            .as_array()
            .unwrap()
            .iter()
            .find(|observation| observation["identity"]["kind"] == "power")
            .unwrap();
        assert_eq!(
            power["capabilityId"],
            "11111111-1111-1111-1111-111111111111"
        );
    }

    #[test]
    fn formats_unix_time_as_utc() {
        assert_eq!(rfc3339_utc(0), "1970-01-01T00:00:00Z");
        assert_eq!(rfc3339_utc(1_700_000_000), "2023-11-14T22:13:20Z");
    }

    #[test]
    fn retained_envelope_is_reused_and_a_missing_clock_is_not_epoch() {
        let previous = PublishedMeter {
            fingerprint: "power|device|=60000".into(),
            observed_at: "2026-10-09T12:00:00Z".into(),
            observation_id: "plug-1:1:1".into(),
        };
        let reused = observation_stamp(
            "plug-1",
            9,
            None,
            Some(&previous),
            &previous.fingerprint,
            false,
        )
        .unwrap();
        assert_eq!(reused.observation_id, previous.observation_id);
        assert_eq!(reused.observed_at, previous.observed_at);
        assert!(observation_stamp("plug-1", 9, None, Some(&previous), "changed", true).is_none());
        let fresh = observation_stamp(
            "plug-1",
            2,
            Some((1_700_000_000, 1_700_000_000_000)),
            Some(&previous),
            &previous.fingerprint,
            true,
        )
        .unwrap();
        assert_eq!(fresh.observation_id, "plug-1:1700000000000:2");
        assert_eq!(fresh.observed_at, "2023-11-14T22:13:20Z");
    }

    #[test]
    fn meter_identity_survives_a_restart() {
        let path = std::env::temp_dir().join(format!(
            "nemu-meter-identity-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_nanos())
                .unwrap_or(0)
        ));
        let mut store = MeterIdentityStore::load(&path);
        let sequence = store.next_sequence();
        store.insert(
            "plug-1",
            PublishedMeter {
                fingerprint: "power|device|=60000".into(),
                observed_at: "2026-10-09T12:00:00Z".into(),
                observation_id: format!("plug-1:1:{sequence}"),
            },
        );
        let mut loaded = MeterIdentityStore::load(&path);
        let published = loaded.get("plug-1").unwrap();
        assert_eq!(published.observation_id, "plug-1:1:1");
        assert_eq!(loaded.next_sequence(), 2);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn bulb_without_a_meter_has_no_envelope() {
        let attrs = attributes(&[
            ("0/29/0", device_types(&[22])),
            ("1/29/0", device_types(&[256])),
            ("1/6/0", json!(true)),
        ]);
        let device = map_node("bulb", &attrs).remove(0);
        assert!(
            meter_publication(
                &device,
                &attrs,
                "2026-10-09T12:00:00Z",
                "obs",
                &HashMap::new()
            )
            .is_none()
        );
    }
}
