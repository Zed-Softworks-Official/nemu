/// Light validation before handing a pairing code to matter-controller.
pub fn normalize_pairing_code(code: &str) -> Option<String> {
    let trimmed = code.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.to_ascii_uppercase().starts_with("MT:") {
        return Some(trimmed.to_string());
    }
    let digits: String = trimmed.chars().filter(|ch| ch.is_ascii_digit()).collect();
    if digits.len() == 11 || digits.len() == 21 {
        return Some(digits);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_qr_and_manual() {
        assert!(normalize_pairing_code("MT:Y.K90AFN00KA0648G00").is_some());
        assert!(normalize_pairing_code("3497-010-1233").is_some());
        assert!(normalize_pairing_code("not-a-code").is_none());
    }
}
