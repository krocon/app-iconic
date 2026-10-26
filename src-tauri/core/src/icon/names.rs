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

fn sanitize_asset_base(base: &str) -> String {
    let replaced: String = base
        .trim()
        .chars()
        .map(|c| {
            if matches!(c, '/' | '\\' | ':') || c.is_control() {
                '-'
            } else {
                c
            }
        })
        .collect();
    let trimmed = replaced.trim_start_matches('.').trim();
    if trimmed.is_empty() {
        "layer.svg".to_owned()
    } else {
        trimmed.to_owned()
    }
}

/// A file name for a new asset that no name in `existing` already has.
pub fn unique_asset_name(base: &str, existing: &[String]) -> String {
    let base = sanitize_asset_base(base);
    let taken: std::collections::HashSet<String> = existing.iter().map(|n| name_key(n)).collect();
    if !taken.contains(&name_key(&base)) {
        return base;
    }
    let (stem, ext) = match base.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() && !ext.is_empty() => (stem, ext),
        _ => (base.as_str(), "svg"),
    };
    (2..)
        .map(|i| format!("{stem} {i}.{ext}"))
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
