//! Asset and layer names (design 002 E8, E11, E12). Unique names as in the legacy app
//! (`AppModel.makeUniqueAssetName` / `makeUniqueLayerName`, legacy §3, Marc Kronberg): `name.svg` →
//! `name 2.svg` …, layers `name 2` …, empty → `layer`. Compared NFC-normalised and without case,
//! because macOS (and Windows) file systems do not tell `A.svg` from `a.svg`, and HFS+ stores NFD.

use unicode_normalization::UnicodeNormalization;

/// The key two names are compared by: NFC + lower case.
pub fn name_key(name: &str) -> String {
    name.nfc().collect::<String>().to_lowercase()
}

/// Same name after NFC normalisation (case matters – used to find the asset of an `image-name`).
pub fn same_name(a: &str, b: &str) -> bool {
    a == b || a.nfc().eq(b.nfc())
}

/// Is `name` usable as the file name of an asset (one path component, no dot file)?
pub fn is_valid_asset_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('.')
        && !name
            .chars()
            .any(|c| matches!(c, '/' | '\\' | ':') || c.is_control())
}

/// Longest new asset name in UTF-8 bytes (file systems allow 255; room for ` 99` and temp names).
pub const MAX_NAME_BYTES: usize = 200;

/// Characters no new asset name gets: path separators and what Windows refuses (prompt 031).
fn is_bad_char(c: char) -> bool {
    matches!(c, '/' | '\\' | ':' | '<' | '>' | '"' | '|' | '?' | '*') || c.is_control()
}

/// `CON`, `nul.svg`, `com1.tar.svg` … – names Windows reserves, whatever the extension.
fn is_reserved_on_windows(name: &str) -> bool {
    let stem = name
        .split('.')
        .next()
        .unwrap_or("")
        .trim_end()
        .to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.len() == 4
            && matches!(stem.as_bytes()[3], b'1'..=b'9'))
}

/// `stem` cut (at a character) so that `stem + tail` fits [`MAX_NAME_BYTES`].
fn fit(stem: &str, tail: &str) -> String {
    let room = MAX_NAME_BYTES.saturating_sub(tail.len());
    let mut end = 0;
    for (i, c) in stem.char_indices() {
        if i + c.len_utf8() > room {
            break;
        }
        end = i + c.len_utf8();
    }
    format!("{}{tail}", stem[..end].trim_end())
}

/// Splits `name.ext` (no extension: `ext` is empty).
fn split_ext(name: &str) -> (&str, &str) {
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() && !ext.is_empty() && ext.len() <= 16 => (stem, ext),
        _ => (name, ""),
    }
}

fn sanitize_asset_base(base: &str) -> String {
    let replaced: String = base
        .trim()
        .chars()
        .map(|c| if is_bad_char(c) { '-' } else { c })
        .collect();
    // Windows drops trailing dots and spaces – two names would become one
    let trimmed = replaced
        .trim_start_matches('.')
        .trim()
        .trim_end_matches(['.', ' ']);
    if trimmed.is_empty() {
        return "layer.svg".to_owned();
    }
    let name = if is_reserved_on_windows(trimmed) {
        format!("_{trimmed}")
    } else {
        trimmed.to_owned()
    };
    if name.len() <= MAX_NAME_BYTES {
        return name;
    }
    let (stem, ext) = split_ext(&name);
    let tail = if ext.is_empty() {
        String::new()
    } else {
        format!(".{ext}")
    };
    fit(stem, &tail)
}

/// A file name for a new asset that no name in `existing` already has.
pub fn unique_asset_name(base: &str, existing: &[String]) -> String {
    let base = sanitize_asset_base(base);
    let taken: std::collections::HashSet<String> = existing.iter().map(|n| name_key(n)).collect();
    if !taken.contains(&name_key(&base)) {
        return base;
    }
    let (stem, ext) = match split_ext(&base) {
        (stem, "") => (stem, "svg"),
        other => other,
    };
    (2..)
        .map(|i| fit(stem, &format!(" {i}.{ext}")))
        .find(|c| !taken.contains(&name_key(c)))
        .expect("an unused number exists")
}

/// A name for a new layer that no name in `existing` already has.
pub fn unique_layer_name(base: &str, existing: &[String]) -> String {
    let trimmed = base.trim();
    let base = if trimmed.is_empty() { "layer" } else { trimmed };
    let taken: std::collections::HashSet<String> = existing.iter().map(|n| name_key(n)).collect();
    if !taken.contains(&name_key(base)) {
        return base.to_owned();
    }
    (2..)
        .map(|i| format!("{base} {i}"))
        .find(|c| !taken.contains(&name_key(c)))
        .expect("an unused number exists")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Case {
        base: String,
        existing: Vec<String>,
        expected: String,
    }

    #[derive(Deserialize)]
    struct Table {
        asset: Vec<Case>,
        layer: Vec<Case>,
    }

    fn table() -> Table {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../testdata/unique-names.json"
        );
        serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
    }

    #[test]
    fn unique_asset_names_follow_the_table() {
        for c in table().asset {
            let got = unique_asset_name(&c.base, &c.existing);
            assert_eq!(
                got, c.expected,
                "base {:?} existing {:?}",
                c.base, c.existing
            );
            assert!(is_valid_asset_name(&got), "{got:?}");
        }
    }

    #[test]
    fn unique_layer_names_follow_the_table() {
        for c in table().layer {
            let got = unique_layer_name(&c.base, &c.existing);
            assert_eq!(
                got, c.expected,
                "base {:?} existing {:?}",
                c.base, c.existing
            );
        }
    }

    #[test]
    fn compares_nfc_and_nfd() {
        assert!(same_name("Größe.svg", "Gro\u{308}ße.svg"));
        assert!(!same_name("a.svg", "A.svg"));
        assert_eq!(
            name_key("Gro\u{308}SSE"),
            name_key("größe".replace('ß', "ss").as_str())
        );
    }

    #[test]
    fn validates_asset_names() {
        for ok in [
            "a.svg",
            "logo-scanner 3.svg",
            "Ä 😀.svg",
            "Gro\u{308}ße.svg",
        ] {
            assert!(is_valid_asset_name(ok), "{ok}");
        }
        for bad in [
            "",
            ".",
            "..",
            ".DS_Store",
            "a/b.svg",
            "a\\b.svg",
            "c:d",
            "x\0y",
        ] {
            assert!(!is_valid_asset_name(bad), "{bad:?}");
        }
    }
}
