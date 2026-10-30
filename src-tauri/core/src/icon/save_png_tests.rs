//! Prompt 080 E6: new and replaced PNG assets come as data URLs and are written byte for byte –
//! in a bundle and in a ZIP, read back unchanged, saved again unchanged.

use super::*;
use crate::icon::testdata::{camscanner, copy_tree, tree};
use crate::icon::{Limits, read_icon, write_icon};
use base64::Engine;
use serde_json::json;
use tempfile::tempdir;

/// A small real PNG (3 × 2, RGBA) – what Icon Composer keeps under `Assets/`.
fn png_bytes() -> Vec<u8> {
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, 3, 2);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut w = enc.write_header().unwrap();
        let px: Vec<u8> = (0..24).map(|i| (i * 10) as u8).collect();
        w.write_image_data(&px).unwrap();
    }
    out
}

fn data_url(bytes: &[u8]) -> String {
    format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

fn unchanged(f: &IconFile) -> Vec<AssetInput> {
    f.assets
        .iter()
        .map(|a| AssetInput {
            name: a.name.clone(),
            text: None,
            data_url: None,
            unchanged: true,
            source: None,
        })
        .collect()
}

/// camscanner + a new PNG layer in front of the first group (what "Import Image as Layer" sends).
fn with_png_layer(base: &IconFile) -> (Value, Vec<AssetInput>) {
    let mut json = base.json.clone();
    let layers = json["groups"][0]["layers"].as_array_mut().unwrap();
    layers.insert(
        0,
        json!({ "image-name": "Ball 2.png", "name": "Ball 2", "position": { "scale": 0.5, "translation-in-points": [10, -20] } }),
    );
    let mut inputs = unchanged(base);
    inputs.push(AssetInput {
        name: "Ball 2.png".into(),
        text: None,
        data_url: Some(data_url(&png_bytes())),
        unchanged: false,
        source: None,
    });
    (json, inputs)
}

#[test]
fn a_new_png_asset_round_trips_in_a_bundle_and_a_zip() {
    for format in [IconFormat::Bundle, IconFormat::Zip] {
        let dir = tempdir().unwrap();
        let target = dir.path().join("cam.icon");
        copy_tree(&camscanner(), &target);
        let base = read_icon(&target, &Limits::default()).unwrap();
        let (json, inputs) = with_png_layer(&base);
        let out = dir.path().join("out.icon");
        let f = assemble(Some(&base), format, json.clone(), inputs, &out).unwrap();
        write_icon(&out, &f).unwrap();
        let back = read_icon(&out, &Limits::default()).unwrap();
        assert_eq!(back.format, format);
        assert!(back.warnings.is_empty(), "{:?}", back.warnings);
        assert_eq!(back.json, json);
        let png = back.asset("Ball 2.png").expect("png asset");
        assert_eq!(png.kind, AssetKind::Png);
        assert_eq!(png.bytes, png_bytes(), "{format:?}: byte for byte");
        // the SVG assets are untouched
        for a in &base.assets {
            assert_eq!(back.asset(&a.name).unwrap().bytes, a.bytes);
        }
        // the data URL the frontend gets is the one it sent
        assert_eq!(png.data_url().unwrap(), data_url(&png_bytes()));
        // saved again without changes (the PNG now from the session): identical files
        let again = assemble(
            Some(&back),
            format,
            back.json.clone(),
            unchanged(&back),
            &out,
        )
        .unwrap();
        let before = std::fs::read(if format == IconFormat::Zip {
            out.clone()
        } else {
            out.join("Assets/Ball 2.png")
        })
        .unwrap();
        write_icon(&out, &again).unwrap();
        let after = std::fs::read(if format == IconFormat::Zip {
            out.clone()
        } else {
            out.join("Assets/Ball 2.png")
        })
        .unwrap();
        if format == IconFormat::Bundle {
            assert_eq!(before, after);
            assert_eq!(tree(&out)["Assets/Ball 2.png"], png_bytes());
        } else {
            let reread = read_icon(&out, &Limits::default()).unwrap();
            assert_eq!(reread.asset("Ball 2.png").unwrap().bytes, png_bytes());
        }
    }
}

/// "Replace Image": same name, new bytes – everything else stays.
#[test]
fn a_replaced_png_changes_only_that_file() {
    let dir = tempdir().unwrap();
    let target = dir.path().join("cam.icon");
    copy_tree(&camscanner(), &target);
    let base = read_icon(&target, &Limits::default()).unwrap();
    let (json, inputs) = with_png_layer(&base);
    write_icon(
        &target,
        &assemble(Some(&base), base.format, json, inputs, &target).unwrap(),
    )
    .unwrap();
    let saved = read_icon(&target, &Limits::default()).unwrap();
    let before = tree(&target);
    let mut other = png_bytes();
    other.extend_from_slice(b"trailing bytes after IEND are kept as they are");
    let mut inputs = unchanged(&saved);
    let i = inputs.iter().position(|a| a.name == "Ball 2.png").unwrap();
    inputs[i] = AssetInput {
        name: "Ball 2.png".into(),
        text: None,
        data_url: Some(data_url(&other)),
        unchanged: false,
        source: None,
    };
    let f = assemble(
        Some(&saved),
        saved.format,
        saved.json.clone(),
        inputs,
        &target,
    )
    .unwrap();
    write_icon(&target, &f).unwrap();
    let after = tree(&target);
    let changed: Vec<_> = after.keys().filter(|k| after[*k] != before[*k]).collect();
    assert_eq!(changed, ["Assets/Ball 2.png"]);
    assert_eq!(after["Assets/Ball 2.png"], other);
}

#[test]
fn only_png_data_urls_for_png_assets() {
    let base = read_icon(&camscanner(), &Limits::default()).unwrap();
    let p = Path::new("/x.icon");
    let bad = |name: &str, url: String| {
        let mut inputs = unchanged(&base);
        inputs.push(AssetInput {
            name: name.into(),
            text: None,
            data_url: Some(url),
            unchanged: false,
            source: None,
        });
        assemble(Some(&base), base.format, base.json.clone(), inputs, p).unwrap_err()
    };
    let ok = data_url(&png_bytes());
    // a PNG data URL for an SVG asset, a JPEG, no PNG signature, broken Base64
    assert_eq!(bad("a.svg", ok.clone()).code, FsErrorCode::InvalidIcon);
    let jpeg = ok.replace("image/png", "image/jpeg");
    assert_eq!(bad("a.png", jpeg).code, FsErrorCode::InvalidIcon);
    assert_eq!(
        bad("a.png", data_url(b"GIF89a not a png")).code,
        FsErrorCode::InvalidIcon
    );
    assert_eq!(
        bad("a.png", "data:image/png;base64,***".into()).code,
        FsErrorCode::InvalidIcon
    );
    assert_eq!(decode_png_data_url(&ok), Some(png_bytes()));
    assert_eq!(decode_png_data_url("data:image/png,raw"), None);
}
