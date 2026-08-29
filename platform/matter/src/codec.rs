use matter_codec::Tag;
use matter_controller::Value;
use serde_json::{Map, Value as JsonValue, json};

pub fn value_to_json(value: &Value) -> JsonValue {
    match value {
        Value::Null => JsonValue::Null,
        Value::Bool(flag) => JsonValue::Bool(*flag),
        Value::Uint(n) => json!(*n),
        Value::Int(n) => json!(*n),
        Value::Float(n) => json!(*n),
        Value::Double(n) => json!(*n),
        Value::Utf8(text) => JsonValue::String(text.clone()),
        Value::Bytes(bytes) => JsonValue::String(String::from_utf8_lossy(bytes).into_owned()),
        Value::Structure(fields) | Value::List(fields) => tagged_to_json(fields),
        Value::Array(values) => JsonValue::Array(values.iter().map(value_to_json).collect()),
        other => json!(format!("{other:?}")),
    }
}

fn tagged_to_json(fields: &[(Tag, Value)]) -> JsonValue {
    let mut object = Map::new();
    for (index, (tag, value)) in fields.iter().enumerate() {
        let key = match tag {
            Tag::Context(n) => n.to_string(),
            Tag::CommonProfile(n) | Tag::ImplicitProfile(n) => n.to_string(),
            Tag::FullyQualified { tag, .. } => tag.to_string(),
            Tag::Anonymous => index.to_string(),
            _ => index.to_string(),
        };
        object.insert(key, value_to_json(value));
    }
    JsonValue::Object(object)
}

pub fn empty_structure() -> Value {
    Value::Structure(Vec::new())
}

pub fn unsigned_fields(fields: &[(u8, u64)]) -> Value {
    Value::Structure(
        fields
            .iter()
            .map(|(tag, value)| (Tag::Context(*tag), Value::Uint(*value)))
            .collect(),
    )
}
