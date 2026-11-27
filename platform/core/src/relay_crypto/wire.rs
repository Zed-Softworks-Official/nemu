//! Byte encodings shared by every Relay crypto module.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;

/// Largest integer both Rust and JavaScript represent exactly. Header
/// numbers above it are rejected so the two sides never disagree.
pub const MAX_SAFE_INTEGER: u64 = (1 << 53) - 1;

/// Appends `data` prefixed with its LEB128-encoded length
/// (draft-irtf-cfrg-cpace `prepend_len`).
pub fn prepend_len(out: &mut Vec<u8>, data: &[u8]) {
    let mut len = data.len();
    loop {
        if len < 128 {
            out.push(len as u8);
        } else {
            out.push(((len & 0x7f) | 0x80) as u8);
        }
        len >>= 7;
        if len == 0 {
            break;
        }
    }
    out.extend_from_slice(data);
}

/// Length of `prepend_len(data)` without building it.
pub fn prepend_len_size(data: &[u8]) -> usize {
    let mut len = data.len();
    let mut size = 1;
    while len >= 128 {
        len >>= 7;
        size += 1;
    }
    size + data.len()
}

/// draft-irtf-cfrg-cpace `lv_cat`.
pub fn lv_cat(parts: &[&[u8]]) -> Vec<u8> {
    let mut out = Vec::new();
    for part in parts {
        prepend_len(&mut out, part);
    }
    out
}

/// Splits an `lv_cat` encoding back into its parts. Returns `None` for a
/// truncated or oversized length prefix.
pub fn lv_split(mut data: &[u8]) -> Option<Vec<&[u8]>> {
    let mut parts = Vec::new();
    while !data.is_empty() {
        let mut len: usize = 0;
        let mut shift = 0;
        let mut consumed = 0;
        loop {
            let byte = *data.get(consumed)?;
            consumed += 1;
            len |= usize::from(byte & 0x7f) << shift;
            if byte & 0x80 == 0 {
                break;
            }
            shift += 7;
            if shift > 21 {
                return None;
            }
        }
        let rest = &data[consumed..];
        if rest.len() < len {
            return None;
        }
        parts.push(&rest[..len]);
        data = &rest[len..];
    }
    Some(parts)
}

pub fn u64_be(value: u64) -> [u8; 8] {
    value.to_be_bytes()
}

pub fn b64url_encode(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Strict unpadded base64url: rejects padding and non-canonical trailing bits.
pub fn b64url_decode(text: &str) -> Option<Vec<u8>> {
    URL_SAFE_NO_PAD.decode(text).ok()
}

pub fn b64url_decode_32(text: &str) -> Option<[u8; 32]> {
    b64url_decode(text)?.try_into().ok()
}

pub fn b64url_decode_64(text: &str) -> Option<[u8; 64]> {
    b64url_decode(text)?.try_into().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prepend_len_matches_draft_vectors() {
        let mut out = Vec::new();
        prepend_len(&mut out, b"");
        assert_eq!(out, [0x00]);

        let mut out = Vec::new();
        prepend_len(&mut out, b"1234");
        assert_eq!(hex::encode(out), "0431323334");

        let long: Vec<u8> = (0..=127u8).collect();
        let mut out = Vec::new();
        prepend_len(&mut out, &long);
        assert_eq!(&out[..2], &[0x80, 0x01]);
        assert_eq!(prepend_len_size(&long), out.len());
    }

    #[test]
    fn lv_cat_matches_draft_vector_and_splits_back() {
        let encoded = lv_cat(&[b"1234", b"5", b"", b"678"]);
        assert_eq!(hex::encode(&encoded), "043132333401350003363738");
        let parts = lv_split(&encoded).unwrap();
        assert_eq!(parts, vec![&b"1234"[..], b"5", b"", b"678"]);
        assert!(lv_split(&[0x05, 0x01]).is_none());
    }

    #[test]
    fn base64url_is_strict() {
        assert_eq!(b64url_encode(&[0xfb, 0xff]), "-_8");
        assert_eq!(b64url_decode("-_8").unwrap(), vec![0xfb, 0xff]);
        assert!(b64url_decode("-_8=").is_none());
        assert!(b64url_decode("-_9").is_none());
        assert!(b64url_decode("+/8").is_none());
    }
}
