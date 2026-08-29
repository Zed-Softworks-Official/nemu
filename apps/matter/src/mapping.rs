//! Pure translation between Matter node attributes and Nemu's zigbee2mqtt-shaped
//! MQTT dialect. No I/O so everything is unit-testable.

use serde_json::{Map, Value, json};

pub const CLUSTER_ON_OFF: u16 = 6;
pub const CLUSTER_LEVEL_CONTROL: u16 = 8;
pub const CLUSTER_DESCRIPTOR: u16 = 29;
pub const CLUSTER_BASIC_INFORMATION: u16 = 40;
pub const CLUSTER_COLOR_CONTROL: u16 = 768;
pub const CLUSTER_ELECTRICAL_POWER: u16 = 144;
pub const CLUSTER_ELECTRICAL_ENERGY: u16 = 145;

pub const DEVICE_TYPE_ROOT_NODE: u32 = 22;
pub const DEVICE_TYPE_AGGREGATOR: u32 = 14;
pub const DEVICE_TYPE_ON_OFF_LIGHT: u32 = 256;
pub const DEVICE_TYPE_DIMMABLE_LIGHT: u32 = 257;
pub const DEVICE_TYPE_COLOR_TEMPERATURE_LIGHT: u32 = 268;
pub const DEVICE_TYPE_EXTENDED_COLOR_LIGHT: u32 = 269;
pub const DEVICE_TYPE_ON_OFF_PLUG: u32 = 266;
pub const DEVICE_TYPE_DIMMABLE_PLUG: u32 = 267;

const LIGHT_DEVICE_TYPES: &[u32] = &[
    DEVICE_TYPE_ON_OFF_LIGHT,
    DEVICE_TYPE_DIMMABLE_LIGHT,
    DEVICE_TYPE_COLOR_TEMPERATURE_LIGHT,
    DEVICE_TYPE_EXTENDED_COLOR_LIGHT,
];

const PLUG_DEVICE_TYPES: &[u32] = &[DEVICE_TYPE_ON_OFF_PLUG, DEVICE_TYPE_DIMMABLE_PLUG];

pub type Attributes = Map<String, Value>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EndpointKind {
    Light,
    Switch,
    Strip,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StripOutlet {
    pub endpoint_id: u16,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EndpointDevice {
    pub id: String,
    pub node_id: String,
    pub endpoint_id: u16,
    pub outlets: Option<Vec<StripOutlet>>,
    pub energy_endpoint_id: Option<u16>,
    pub default_name: String,
    pub kind: EndpointKind,
    pub model: String,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DeviceCommandAction {
    pub cluster_id: u16,
    pub command: CommandName,
}

#[derive(Debug, Clone, PartialEq)]
pub enum CommandName {
    On,
    Off,
    Toggle,
    MoveToLevelWithOnOff { level: u8 },
    MoveToColorTemperature { mireds: u16 },
    MoveToColor { color_x: u16, color_y: u16 },
}

impl CommandName {
    pub fn command_id(&self) -> u32 {
        match self {
            Self::Off => 0x00,
            Self::On => 0x01,
            Self::Toggle => 0x02,
            Self::MoveToLevelWithOnOff { .. } => 0x04,
            Self::MoveToColor { .. } => 0x07,
            Self::MoveToColorTemperature { .. } => 0x0A,
        }
    }
}

pub fn attr_key(endpoint: u16, cluster: u16, attribute: u32) -> String {
    format!("{endpoint}/{cluster}/{attribute}")
}

pub fn attr<'a>(attributes: &'a Attributes, endpoint: u16, cluster: u16, attribute: u32) -> Option<&'a Value> {
    attributes.get(&attr_key(endpoint, cluster, attribute))
}

fn struct_field<'a>(value: &'a Value, field_id: u32, names: &[&str]) -> Option<&'a Value> {
    let record = value.as_object()?;
    if let Some(found) = record.get(&field_id.to_string()) {
        return Some(found);
    }
    for name in names {
        if let Some(found) = record.get(*name) {
            return Some(found);
        }
    }
    None
}

fn as_number(value: &Value) -> Option<f64> {
    match value {
        Value::Number(n) => n.as_f64(),
        _ => None,
    }
}

pub fn list_endpoints(attributes: &Attributes) -> Vec<u16> {
    let mut endpoints = std::collections::BTreeSet::new();
    for key in attributes.keys() {
        let endpoint = key
            .split('/')
            .next()
            .and_then(|part| part.parse::<u16>().ok());
        if let Some(endpoint) = endpoint.filter(|endpoint| *endpoint > 0) {
            endpoints.insert(endpoint);
        }
    }
    endpoints.into_iter().collect()
}

pub fn device_types_of(attributes: &Attributes, endpoint: u16) -> Vec<u32> {
    let Some(list) = attr(attributes, endpoint, CLUSTER_DESCRIPTOR, 0) else {
        return Vec::new();
    };
    let Some(entries) = list.as_array() else {
        return Vec::new();
    };
    let mut types = Vec::new();
    for entry in entries {
        if let Some(id) = struct_field(entry, 0, &["deviceType", "type"]).and_then(as_number) {
            types.push(id as u32);
        }
    }
    types
}

fn has_on_off(attributes: &Attributes, endpoint: u16) -> bool {
    attr(attributes, endpoint, CLUSTER_ON_OFF, 0).is_some()
}

fn has_energy_measurement(attributes: &Attributes, endpoint: u16) -> bool {
    let power_prefix = format!("{endpoint}/{CLUSTER_ELECTRICAL_POWER}/");
    let energy_prefix = format!("{endpoint}/{CLUSTER_ELECTRICAL_ENERGY}/");
    attributes
        .keys()
        .any(|key| key.starts_with(&power_prefix) || key.starts_with(&energy_prefix))
}

fn endpoint_kind(attributes: &Attributes, endpoint: u16) -> Option<EndpointKind> {
    let types = device_types_of(attributes, endpoint);
    if types
        .iter()
        .any(|item| *item == DEVICE_TYPE_AGGREGATOR || *item == DEVICE_TYPE_ROOT_NODE)
    {
        return if has_on_off(attributes, endpoint) {
            Some(EndpointKind::Switch)
        } else {
            None
        };
    }
    if types.iter().any(|item| LIGHT_DEVICE_TYPES.contains(item)) {
        return Some(EndpointKind::Light);
    }
    if types.iter().any(|item| PLUG_DEVICE_TYPES.contains(item)) {
        return Some(EndpointKind::Switch);
    }
    if has_on_off(attributes, endpoint) {
        return Some(EndpointKind::Switch);
    }
    None
}

pub fn node_base_name(attributes: &Attributes, node_id: &str) -> String {
    if let Some(label) = attr(attributes, 0, CLUSTER_BASIC_INFORMATION, 5)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|label| !label.is_empty() && !label.contains('\u{0000}'))
    {
        return label.to_string();
    }
    if let Some(product) = attr(attributes, 0, CLUSTER_BASIC_INFORMATION, 3)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|product| !product.is_empty())
    {
        return product.to_string();
    }
    format!("Matter {node_id}")
}

fn node_model(attributes: &Attributes) -> String {
    attr(attributes, 0, CLUSTER_BASIC_INFORMATION, 3)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|product| !product.is_empty())
        .unwrap_or("Matter device")
        .to_string()
}

fn node_vendor(attributes: &Attributes) -> String {
    attr(attributes, 0, CLUSTER_BASIC_INFORMATION, 1)
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("")
        .to_string()
}

fn describe_kind(kind: EndpointKind, vendor: &str) -> String {
    let what = match kind {
        EndpointKind::Light => "Matter light",
        EndpointKind::Strip => "Matter smart strip",
        EndpointKind::Switch => "Matter on/off plug-in unit",
    };
    if vendor.is_empty() {
        what.to_string()
    } else {
        format!("{what} ({vendor})")
    }
}

struct Classified {
    functional: Vec<(u16, EndpointKind)>,
    energy_only: Vec<u16>,
}

fn classify_endpoints(attributes: &Attributes) -> Classified {
    let mut functional = Vec::new();
    let mut energy_only = Vec::new();
    for endpoint in list_endpoints(attributes) {
        match endpoint_kind(attributes, endpoint) {
            Some(kind) => functional.push((endpoint, kind)),
            None if has_energy_measurement(attributes, endpoint) => energy_only.push(endpoint),
            None => {}
        }
    }
    Classified {
        functional,
        energy_only,
    }
}

pub fn map_node(node_id: &str, attributes: &Attributes) -> Vec<EndpointDevice> {
    let base = node_base_name(attributes, node_id);
    let model = node_model(attributes);
    let vendor = node_vendor(attributes);
    let Classified {
        functional,
        energy_only,
    } = classify_endpoints(attributes);
    let first_energy = energy_only.first().copied();
    let lights: Vec<_> = functional
        .iter()
        .filter(|(_, kind)| *kind == EndpointKind::Light)
        .collect();
    let switches: Vec<_> = functional
        .iter()
        .filter(|(_, kind)| *kind == EndpointKind::Switch)
        .collect();

    if switches.len() >= 2 && lights.is_empty() {
        let outlets: Vec<StripOutlet> = switches
            .iter()
            .enumerate()
            .map(|(index, (endpoint_id, _))| StripOutlet {
                endpoint_id: *endpoint_id,
                name: format!("Outlet {}", index + 1),
            })
            .collect();
        let Some(first) = outlets.first() else {
            return Vec::new();
        };
        return vec![EndpointDevice {
            id: node_id.to_string(),
            node_id: node_id.to_string(),
            endpoint_id: first.endpoint_id,
            outlets: Some(outlets),
            energy_endpoint_id: first_energy,
            default_name: base,
            kind: EndpointKind::Strip,
            model,
            description: describe_kind(EndpointKind::Strip, &vendor),
        }];
    }

    if lights.is_empty() && energy_only.len() >= 2 {
        let outlets: Vec<StripOutlet> = energy_only
            .iter()
            .enumerate()
            .map(|(index, endpoint_id)| StripOutlet {
                endpoint_id: *endpoint_id,
                name: format!("Outlet {}", index + 1),
            })
            .collect();
        let Some(first) = outlets.first() else {
            return Vec::new();
        };
        return vec![EndpointDevice {
            id: node_id.to_string(),
            node_id: node_id.to_string(),
            endpoint_id: first.endpoint_id,
            outlets: Some(outlets),
            energy_endpoint_id: None,
            default_name: base,
            kind: EndpointKind::Strip,
            model,
            description: describe_kind(EndpointKind::Strip, &vendor),
        }];
    }

    let single = functional.len() == 1;
    let mut devices = Vec::new();
    let mut index = 0usize;
    for (endpoint_id, kind) in functional {
        index += 1;
        let suffix = if kind == EndpointKind::Switch {
            format!("Outlet {index}")
        } else {
            index.to_string()
        };
        devices.push(EndpointDevice {
            id: if single {
                node_id.to_string()
            } else {
                format!("{node_id}:{endpoint_id}")
            },
            node_id: node_id.to_string(),
            endpoint_id,
            outlets: None,
            energy_endpoint_id: if single { first_energy } else { None },
            default_name: if single {
                base.clone()
            } else {
                format!("{base} · {suffix}")
            },
            kind,
            model: model.clone(),
            description: describe_kind(kind, &vendor),
        });
    }
    devices
}

pub fn map_node_with_fallback(node_id: &str, attributes: &Attributes) -> Vec<EndpointDevice> {
    let mapped = map_node(node_id, attributes);
    if !mapped.is_empty() {
        return mapped;
    }
    let endpoints = list_endpoints(attributes);
    let Some(first) = endpoints.first().copied() else {
        return Vec::new();
    };
    let base = node_base_name(attributes, node_id);
    let model = node_model(attributes);
    let vendor = node_vendor(attributes);
    if endpoints.len() == 1 {
        return vec![EndpointDevice {
            id: node_id.to_string(),
            node_id: node_id.to_string(),
            endpoint_id: first,
            outlets: None,
            energy_endpoint_id: None,
            default_name: base,
            kind: EndpointKind::Switch,
            model,
            description: describe_kind(EndpointKind::Switch, &vendor),
        }];
    }
    vec![EndpointDevice {
        id: node_id.to_string(),
        node_id: node_id.to_string(),
        endpoint_id: first,
        outlets: Some(
            endpoints
                .into_iter()
                .enumerate()
                .map(|(index, endpoint_id)| StripOutlet {
                    endpoint_id,
                    name: format!("Outlet {}", index + 1),
                })
                .collect(),
        ),
        energy_endpoint_id: None,
        default_name: base,
        kind: EndpointKind::Strip,
        model,
        description: describe_kind(EndpointKind::Strip, &vendor),
    }]
}

pub fn placeholder_device(node_id: &str) -> EndpointDevice {
    EndpointDevice {
        id: node_id.to_string(),
        node_id: node_id.to_string(),
        endpoint_id: 1,
        outlets: None,
        energy_endpoint_id: None,
        default_name: format!("Matter {node_id}"),
        kind: EndpointKind::Switch,
        model: "Matter device".to_string(),
        description: "Matter device".to_string(),
    }
}

pub fn collapsed_legacy_ids(node_id: &str, attributes: &Attributes) -> Vec<String> {
    let mapped = map_node(node_id, attributes);
    if mapped.len() != 1 || mapped[0].id != node_id {
        return Vec::new();
    }
    let Classified {
        functional,
        energy_only,
    } = classify_endpoints(attributes);
    let controls_have_energy = functional
        .iter()
        .any(|(endpoint, _)| has_energy_measurement(attributes, *endpoint));
    let energy_endpoint = if !controls_have_energy {
        energy_only.first().copied()
    } else {
        None
    };
    let old_total = functional.len() + usize::from(energy_endpoint.is_some());
    if old_total <= 1 {
        return Vec::new();
    }
    let mut ids: Vec<String> = functional
        .into_iter()
        .map(|(endpoint, _)| format!("{node_id}:{endpoint}"))
        .collect();
    if let Some(endpoint) = energy_endpoint {
        ids.push(format!("{node_id}:{endpoint}"));
    }
    ids
}

pub fn device_covers_endpoint(device: &EndpointDevice, endpoint: u16) -> bool {
    if device
        .outlets
        .as_ref()
        .is_some_and(|outlets| outlets.iter().any(|outlet| outlet.endpoint_id == endpoint))
    {
        return true;
    }
    if device.energy_endpoint_id == Some(endpoint) {
        return true;
    }
    device.endpoint_id == endpoint
}

pub fn descriptor_type(kind: EndpointKind) -> &'static str {
    match kind {
        EndpointKind::Light => "light",
        EndpointKind::Strip => "strip",
        EndpointKind::Switch => "switch",
    }
}

fn synthesize_exposes(kind: EndpointKind) -> Value {
    let binary = json!({
        "type": "binary",
        "name": "state",
        "property": "state",
        "access": 7,
        "value_on": "ON",
        "value_off": "OFF"
    });
    match kind {
        EndpointKind::Light => json!([{
            "type": "light",
            "features": [
                binary,
                {
                    "type": "numeric",
                    "name": "brightness",
                    "property": "brightness",
                    "access": 7,
                    "value_min": 0,
                    "value_max": 254
                }
            ]
        }]),
        EndpointKind::Strip => json!([{ "type": "strip", "features": [binary] }]),
        EndpointKind::Switch => json!([{ "type": "switch", "features": [binary] }]),
    }
}

pub fn device_descriptor(device: &EndpointDevice, friendly_name: &str) -> Value {
    json!({
        "external_id": device.id,
        "ieee_address": device.id,
        "friendly_name": friendly_name,
        "type": descriptor_type(device.kind),
        "supported": true,
        "definition": {
            "model": device.model,
            "description": device.description,
            "exposes": synthesize_exposes(device.kind)
        }
    })
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn round3(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}

fn round4(value: f64) -> f64 {
    (value * 10_000.0).round() / 10_000.0
}

fn clamp01(value: f64) -> f64 {
    value.clamp(0.0, 1.0)
}

pub fn state_for_endpoint(attributes: &Attributes, endpoint: u16) -> Map<String, Value> {
    let mut state = Map::new();

    if let Some(on) = attr(attributes, endpoint, CLUSTER_ON_OFF, 0).and_then(Value::as_bool) {
        state.insert("state".into(), json!(if on { "ON" } else { "OFF" }));
    }

    if let Some(level) = attr(attributes, endpoint, CLUSTER_LEVEL_CONTROL, 0).and_then(as_number) {
        state.insert(
            "brightness".into(),
            json!(level.round().clamp(0.0, 254.0) as i64),
        );
    }

    if let Some(color_temp) = attr(attributes, endpoint, CLUSTER_COLOR_CONTROL, 7)
        .and_then(as_number)
        .filter(|value| *value > 0.0)
    {
        state.insert("color_temp".into(), json!(color_temp.round() as i64));
    }

    let current_x = attr(attributes, endpoint, CLUSTER_COLOR_CONTROL, 3).and_then(as_number);
    let current_y = attr(attributes, endpoint, CLUSTER_COLOR_CONTROL, 4).and_then(as_number);
    if let (Some(x), Some(y)) = (current_x, current_y) {
        state.insert(
            "color".into(),
            json!({ "x": round4(x / 65536.0), "y": round4(y / 65536.0) }),
        );
    }

    if let Some(active_power) =
        attr(attributes, endpoint, CLUSTER_ELECTRICAL_POWER, 8).and_then(as_number)
    {
        state.insert("power".into(), json!(round2(active_power / 1000.0)));
    }
    if let Some(voltage) = attr(attributes, endpoint, CLUSTER_ELECTRICAL_POWER, 4)
        .or_else(|| attr(attributes, endpoint, CLUSTER_ELECTRICAL_POWER, 11))
        .and_then(as_number)
    {
        state.insert("voltage".into(), json!(round2(voltage / 1000.0)));
    }
    if let Some(current) = attr(attributes, endpoint, CLUSTER_ELECTRICAL_POWER, 5)
        .or_else(|| attr(attributes, endpoint, CLUSTER_ELECTRICAL_POWER, 12))
        .and_then(as_number)
    {
        state.insert("current".into(), json!(round3(current / 1000.0)));
    }

    if let Some(energy_mwh) = attr(attributes, endpoint, CLUSTER_ELECTRICAL_ENERGY, 1)
        .and_then(|imported| struct_field(imported, 0, &["energy"]))
        .and_then(as_number)
    {
        state.insert("energy".into(), json!(round3(energy_mwh / 1_000_000.0)));
    }

    state
}

pub fn state_for_device(device: &EndpointDevice, attributes: &Attributes) -> Value {
    if device.kind == EndpointKind::Strip {
        if let Some(outlets) = &device.outlets {
            let mut state = Map::new();
            let outlet_values: Vec<Value> = outlets
                .iter()
                .map(|outlet| {
                    let mut item = state_for_endpoint(attributes, outlet.endpoint_id);
                    item.insert("id".into(), json!(outlet.endpoint_id.to_string()));
                    item.insert("name".into(), json!(outlet.name));
                    Value::Object(item)
                })
                .collect();
            state.insert("outlets".into(), Value::Array(outlet_values));
            if let Some(energy_endpoint) = device.energy_endpoint_id {
                for (key, value) in state_for_endpoint(attributes, energy_endpoint) {
                    state.insert(key, value);
                }
            }
            return Value::Object(state);
        }
    }

    let mut state = state_for_endpoint(attributes, device.endpoint_id);
    if let Some(energy_endpoint) = device.energy_endpoint_id {
        for (key, value) in state_for_endpoint(attributes, energy_endpoint) {
            state.insert(key, value);
        }
    }
    Value::Object(state)
}

pub fn is_state_attribute_path(path: &str) -> bool {
    let mut parts = path.split('/');
    let Some(_) = parts.next() else {
        return false;
    };
    let Some(cluster) = parts.next().and_then(|part| part.parse::<u16>().ok()) else {
        return false;
    };
    if parts.next().is_none() || parts.next().is_some() {
        return false;
    }
    matches!(
        cluster,
        CLUSTER_ON_OFF
            | CLUSTER_LEVEL_CONTROL
            | CLUSTER_COLOR_CONTROL
            | CLUSTER_ELECTRICAL_POWER
            | CLUSTER_ELECTRICAL_ENERGY
    )
}

pub fn endpoint_of_path(path: &str) -> Option<u16> {
    path.split('/').next()?.parse().ok()
}

pub fn outlet_id_from_set(payload: &Map<String, Value>) -> Option<u16> {
    match payload.get("outlet") {
        Some(Value::Number(n)) => n.as_u64().map(|value| value as u16),
        Some(Value::String(raw)) => raw.trim().parse().ok(),
        _ => None,
    }
}

/// Apply a set payload to cached attributes so MQTT state can update without a
/// blocking wildcard read. Subscriptions confirm the device afterwards.
pub fn apply_set_to_attributes(
    attributes: &mut Attributes,
    endpoints: &[u16],
    actions: &[DeviceCommandAction],
) {
    for endpoint in endpoints {
        for action in actions {
            match &action.command {
                CommandName::On => {
                    attributes.insert(format!("{endpoint}/{CLUSTER_ON_OFF}/0"), json!(true));
                }
                CommandName::Off => {
                    attributes.insert(format!("{endpoint}/{CLUSTER_ON_OFF}/0"), json!(false));
                }
                CommandName::Toggle => {
                    let key = format!("{endpoint}/{CLUSTER_ON_OFF}/0");
                    let on = attributes.get(&key).and_then(Value::as_bool).unwrap_or(false);
                    attributes.insert(key, json!(!on));
                }
                CommandName::MoveToLevelWithOnOff { level } => {
                    attributes.insert(
                        format!("{endpoint}/{CLUSTER_LEVEL_CONTROL}/0"),
                        json!(u64::from(*level)),
                    );
                    attributes.insert(
                        format!("{endpoint}/{CLUSTER_ON_OFF}/0"),
                        json!(*level > 0),
                    );
                }
                CommandName::MoveToColorTemperature { mireds } => {
                    attributes.insert(
                        format!("{endpoint}/{CLUSTER_COLOR_CONTROL}/7"),
                        json!(u64::from(*mireds)),
                    );
                }
                CommandName::MoveToColor { color_x, color_y } => {
                    attributes.insert(
                        format!("{endpoint}/{CLUSTER_COLOR_CONTROL}/3"),
                        json!(u64::from(*color_x)),
                    );
                    attributes.insert(
                        format!("{endpoint}/{CLUSTER_COLOR_CONTROL}/4"),
                        json!(u64::from(*color_y)),
                    );
                }
            }
        }
    }
}

pub fn commands_for_set(payload: &Map<String, Value>) -> (Vec<DeviceCommandAction>, Vec<String>) {
    let mut actions = Vec::new();
    let mut ignored = Vec::new();
    let mut state_handled = false;

    if let Some(brightness) = payload.get("brightness") {
        if let Some(level) = as_number(brightness) {
            actions.push(DeviceCommandAction {
                cluster_id: CLUSTER_LEVEL_CONTROL,
                command: CommandName::MoveToLevelWithOnOff {
                    level: level.round().clamp(0.0, 254.0) as u8,
                },
            });
            state_handled = true;
        } else {
            ignored.push("brightness".into());
        }
    }

    if let Some(raw) = payload.get("state")
        && !state_handled
    {
        let normalized = match raw {
            Value::String(text) => text.trim().to_ascii_uppercase(),
            Value::Bool(true) => "ON".into(),
            Value::Bool(false) => "OFF".into(),
            _ => String::new(),
        };
        match normalized.as_str() {
            "ON" => actions.push(DeviceCommandAction {
                cluster_id: CLUSTER_ON_OFF,
                command: CommandName::On,
            }),
            "OFF" => actions.push(DeviceCommandAction {
                cluster_id: CLUSTER_ON_OFF,
                command: CommandName::Off,
            }),
            "TOGGLE" => actions.push(DeviceCommandAction {
                cluster_id: CLUSTER_ON_OFF,
                command: CommandName::Toggle,
            }),
            _ => ignored.push("state".into()),
        }
    }

    if let Some(raw) = payload.get("color_temp") {
        if let Some(mireds) = as_number(raw) {
            actions.push(DeviceCommandAction {
                cluster_id: CLUSTER_COLOR_CONTROL,
                command: CommandName::MoveToColorTemperature {
                    mireds: mireds.round() as u16,
                },
            });
        } else {
            ignored.push("color_temp".into());
        }
    }

    if let Some(color) = payload.get("color") {
        if let Some(xy) = color_to_xy(color) {
            actions.push(DeviceCommandAction {
                cluster_id: CLUSTER_COLOR_CONTROL,
                command: CommandName::MoveToColor {
                    color_x: (xy.0 * 65536.0).round() as u16,
                    color_y: (xy.1 * 65536.0).round() as u16,
                },
            });
        } else {
            ignored.push("color".into());
        }
    }

    for key in payload.keys() {
        if !matches!(
            key.as_str(),
            "state" | "brightness" | "color_temp" | "color" | "transition" | "outlet"
        ) {
            ignored.push(key.clone());
        }
    }

    (actions, ignored)
}

fn color_to_xy(value: &Value) -> Option<(f64, f64)> {
    let record = value.as_object()?;
    if let (Some(x), Some(y)) = (
        record.get("x").and_then(as_number),
        record.get("y").and_then(as_number),
    ) {
        return Some((clamp01(x), clamp01(y)));
    }
    record.get("hex").and_then(Value::as_str).and_then(hex_to_xy)
}

pub fn hex_to_xy(hex: &str) -> Option<(f64, f64)> {
    let digits = hex.trim().strip_prefix('#')?;
    if digits.len() != 6 || !digits.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return None;
    }
    let rgb: [f64; 3] = std::array::from_fn(|i| {
        let channel = u8::from_str_radix(&digits[i * 2..i * 2 + 2], 16).unwrap_or(0) as f64 / 255.0;
        if channel > 0.04045 {
            ((channel + 0.055) / 1.055).powf(2.4)
        } else {
            channel / 12.92
        }
    });
    let [r, g, b] = rgb;
    let x = r * 0.4124 + g * 0.3576 + b * 0.1805;
    let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    let z = r * 0.0193 + g * 0.1192 + b * 0.9505;
    let sum = x + y + z;
    if sum == 0.0 {
        return Some((0.3127, 0.329));
    }
    Some((round4(x / sum), round4(y / sum)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn device_types(types: &[u32]) -> Value {
        Value::Array(
            types
                .iter()
                .map(|device_type| json!({ "0": device_type, "1": 1 }))
                .collect(),
        )
    }

    fn attrs(pairs: &[(&str, Value)]) -> Attributes {
        pairs
            .iter()
            .map(|(key, value)| ((*key).to_string(), value.clone()))
            .collect()
    }

    fn strip_attrs() -> Attributes {
        attrs(&[
            (
                "0/29/0",
                device_types(&[DEVICE_TYPE_ROOT_NODE]),
            ),
            ("0/40/1", json!("Acme")),
            ("0/40/3", json!("Power Strip S3")),
            ("0/40/5", json!("Kitchen strip")),
            ("1/29/0", device_types(&[DEVICE_TYPE_AGGREGATOR])),
            ("1/144/8", json!(12_500)),
            ("1/144/4", json!(230_100)),
            ("1/144/5", json!(54)),
            ("1/145/1", json!({ "0": 1_234_000 })),
            ("2/29/0", device_types(&[DEVICE_TYPE_ON_OFF_PLUG])),
            ("2/6/0", json!(true)),
            ("3/29/0", device_types(&[DEVICE_TYPE_ON_OFF_PLUG])),
            ("3/6/0", json!(false)),
            ("4/29/0", device_types(&[DEVICE_TYPE_ON_OFF_PLUG])),
            ("4/6/0", json!(false)),
        ])
    }

    fn bulb_attrs() -> Attributes {
        attrs(&[
            ("0/29/0", device_types(&[DEVICE_TYPE_ROOT_NODE])),
            ("0/40/3", json!("Bulb A19")),
            ("1/29/0", device_types(&[DEVICE_TYPE_DIMMABLE_LIGHT])),
            ("1/6/0", json!(true)),
            ("1/8/0", json!(180)),
        ])
    }

    #[test]
    fn lists_non_root_endpoints() {
        assert_eq!(list_endpoints(&strip_attrs()), vec![1, 2, 3, 4]);
    }

    #[test]
    fn collapses_power_strip() {
        let devices = map_node("17", &strip_attrs());
        assert_eq!(devices.len(), 1);
        let device = &devices[0];
        assert_eq!(device.id, "17");
        assert_eq!(device.kind, EndpointKind::Strip);
        assert_eq!(device.default_name, "Kitchen strip");
        assert_eq!(device.model, "Power Strip S3");
        let outlets = device.outlets.as_ref().unwrap();
        assert_eq!(
            outlets
                .iter()
                .map(|outlet| (outlet.endpoint_id, outlet.name.as_str()))
                .collect::<Vec<_>>(),
            vec![(2, "Outlet 1"), (3, "Outlet 2"), (4, "Outlet 3")]
        );
        assert_eq!(device.energy_endpoint_id, Some(1));
    }

    #[test]
    fn keeps_bare_node_id_for_single_endpoint() {
        let devices = map_node("9", &bulb_attrs());
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].id, "9");
        assert_eq!(devices[0].kind, EndpointKind::Light);
        assert_eq!(devices[0].default_name, "Bulb A19");
    }

    #[test]
    fn folds_energy_onto_single_plug() {
        let attributes = attrs(&[
            ("0/29/0", device_types(&[DEVICE_TYPE_ROOT_NODE])),
            ("0/40/3", json!("Smart Plug")),
            ("1/29/0", device_types(&[DEVICE_TYPE_AGGREGATOR])),
            ("1/144/8", json!(8_000)),
            ("2/29/0", device_types(&[DEVICE_TYPE_ON_OFF_PLUG])),
            ("2/6/0", json!(true)),
        ]);
        let devices = map_node("4", &attributes);
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].kind, EndpointKind::Switch);
        assert_eq!(devices[0].energy_endpoint_id, Some(1));
        assert_eq!(
            state_for_device(&devices[0], &attributes),
            json!({ "state": "ON", "power": 8.0 })
        );
    }

    #[test]
    fn collapses_energy_only_multi_outlet() {
        let attributes = attrs(&[
            ("0/29/0", device_types(&[DEVICE_TYPE_ROOT_NODE])),
            ("0/40/3", json!("P316M")),
            ("1/144/8", json!(1_000)),
            ("2/144/8", json!(2_000)),
            ("3/145/1", json!({ "0": 3_000 })),
            ("4/144/8", json!(4_000)),
            ("5/144/8", json!(5_000)),
            ("6/145/1", json!({ "0": 6_000 })),
        ]);
        let devices = map_node("52", &attributes);
        assert_eq!(devices[0].kind, EndpointKind::Strip);
        assert_eq!(devices[0].outlets.as_ref().unwrap().len(), 6);
    }

    #[test]
    fn collapses_voltage_only_outlets() {
        let mut pairs = vec![
            ("0/29/0".to_string(), device_types(&[DEVICE_TYPE_ROOT_NODE])),
            ("0/40/3".to_string(), json!("P316M")),
        ];
        for endpoint in 1..=6 {
            pairs.push((format!("{endpoint}/144/11"), json!(120_000)));
        }
        let attributes: Attributes = pairs.into_iter().collect();
        let devices = map_node("56", &attributes);
        assert_eq!(devices[0].kind, EndpointKind::Strip);
        assert_eq!(devices[0].outlets.as_ref().unwrap().len(), 6);
    }

    #[test]
    fn fallback_maps_unclassified_as_strip() {
        let attributes = attrs(&[
            ("0/29/0", device_types(&[DEVICE_TYPE_ROOT_NODE])),
            ("1/29/0", device_types(&[DEVICE_TYPE_AGGREGATOR])),
            ("2/29/0", device_types(&[DEVICE_TYPE_AGGREGATOR])),
        ]);
        let devices = map_node_with_fallback("56", &attributes);
        assert_eq!(devices[0].kind, EndpointKind::Strip);
        assert_eq!(devices[0].outlets.as_ref().unwrap().len(), 2);
    }

    #[test]
    fn collapsed_legacy_ids_for_strip() {
        let mut ids = collapsed_legacy_ids("17", &strip_attrs());
        ids.sort();
        assert_eq!(ids, vec!["17:1", "17:2", "17:3", "17:4"]);
        assert!(collapsed_legacy_ids("9", &bulb_attrs()).is_empty());
    }

    #[test]
    fn strip_state_nests_outlets_and_energy() {
        let device = &map_node("17", &strip_attrs())[0];
        assert_eq!(
            state_for_device(device, &strip_attrs()),
            json!({
                "outlets": [
                    { "id": "2", "name": "Outlet 1", "state": "ON" },
                    { "id": "3", "name": "Outlet 2", "state": "OFF" },
                    { "id": "4", "name": "Outlet 3", "state": "OFF" }
                ],
                "power": 12.5,
                "voltage": 230.1,
                "current": 0.054,
                "energy": 1.234
            })
        );
    }

    #[test]
    fn device_descriptor_is_z2m_shaped() {
        let device = &map_node("17", &strip_attrs())[0];
        let descriptor = device_descriptor(device, "Kitchen strip");
        assert_eq!(descriptor["type"], "strip");
        assert_eq!(descriptor["external_id"], "17");
        assert_eq!(descriptor["definition"]["exposes"][0]["type"], "strip");
    }

    #[test]
    fn commands_map_state_and_brightness() {
        let payload = json!({ "state": "ON" }).as_object().unwrap().clone();
        let (actions, _) = commands_for_set(&payload);
        assert!(matches!(actions[0].command, CommandName::On));

        let payload = json!({ "state": "ON", "brightness": 300 })
            .as_object()
            .unwrap()
            .clone();
        let (actions, ignored) = commands_for_set(&payload);
        assert_eq!(actions.len(), 1);
        assert!(matches!(
            actions[0].command,
            CommandName::MoveToLevelWithOnOff { level: 254 }
        ));
        assert!(ignored.is_empty());
    }

    #[test]
    fn outlet_is_not_ignored() {
        let payload = json!({ "outlet": "2", "state": "OFF" })
            .as_object()
            .unwrap()
            .clone();
        let (actions, ignored) = commands_for_set(&payload);
        assert!(matches!(actions[0].command, CommandName::Off));
        assert!(ignored.is_empty());
        assert_eq!(outlet_id_from_set(&payload), Some(2));
    }

    #[test]
    fn apply_set_updates_on_off() {
        let mut attributes = Attributes::new();
        attributes.insert("1/6/0".into(), json!(true));
        let payload = json!({ "state": "OFF" }).as_object().unwrap().clone();
        let (actions, _) = commands_for_set(&payload);
        apply_set_to_attributes(&mut attributes, &[1], &actions);
        assert_eq!(attributes.get("1/6/0"), Some(&json!(false)));
    }

    #[test]
    fn drops_readonly_keys() {
        let payload = json!({ "power": 12, "energy": 1, "frobnicate": true })
            .as_object()
            .unwrap()
            .clone();
        let (actions, mut ignored) = commands_for_set(&payload);
        ignored.sort();
        assert!(actions.is_empty());
        assert_eq!(ignored, vec!["energy", "frobnicate", "power"]);
    }

    #[test]
    fn state_paths() {
        assert!(is_state_attribute_path("2/6/0"));
        assert!(is_state_attribute_path("1/144/8"));
        assert!(!is_state_attribute_path("0/40/5"));
        assert!(!is_state_attribute_path("0/51/0"));
    }

    #[test]
    fn hex_primaries() {
        let red = hex_to_xy("#ff0000").unwrap();
        assert!(red.0 > 0.6 && red.1 < 0.36);
        let white = hex_to_xy("#ffffff").unwrap();
        assert!((white.0 - 0.3127).abs() < 0.01);
        assert!(hex_to_xy("nope").is_none());
    }
}
