//! "Add › Image…" (prompt 008, design E8): one image file as data URL for an `<image>` element.
//! Foreign files are hostile: at most 20 MiB, the kind comes from the magic bytes (never the file
//! extension), the size from the header. Only PNG, JPEG, WebP and SVG (UTF-8 text with `<svg`) are
//! accepted. The SVG's size is read by the frontend (DOMParser – the browser is the parser).

use super::bundle::read_limited;
use super::strip_bom;
use crate::error::{FsError, FsErrorCode};
use base64::Engine;
use serde::Serialize;
use std::fs;
use std::path::Path;

pub const MAX_IMAGE: u64 = 20 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageFile {
    /// File name with extension, e.g. `photo.png`.
    pub name: String,
    /// `image/png`, `image/jpeg`, `image/webp` or `image/svg+xml`.
    pub mime: String,
    /// `data:<mime>;base64,…`
    pub data_url: String,
    /// Natural size in pixels from the header; `None` for SVG (the frontend reads it).
    pub width: Option<u32>,
    pub height: Option<u32>,
}

/// What the bytes are (and their natural size, if the header says so).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageKind {
    Png,
    Jpeg,
    Webp,
    Svg,
}

impl ImageKind {
    pub fn mime(self) -> &'static str {
        match self {
            ImageKind::Png => "image/png",
            ImageKind::Jpeg => "image/jpeg",
            ImageKind::Webp => "image/webp",
            ImageKind::Svg => "image/svg+xml",
        }
    }
}

fn be16(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from(u16::from_be_bytes(
        b.get(at..at + 2)?.try_into().ok()?,
    )))
}

fn be32(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_be_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

fn le16(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from(u16::from_le_bytes(
        b.get(at..at + 2)?.try_into().ok()?,
    )))
}

fn le24(b: &[u8], at: usize) -> Option<u32> {
    let s = b.get(at..at + 3)?;
    Some(u32::from(s[0]) | u32::from(s[1]) << 8 | u32::from(s[2]) << 16)
}

/// PNG: signature, then the IHDR chunk with width and height.
fn png_size(b: &[u8]) -> Option<(u32, u32)> {
    (b.get(12..16)? == b"IHDR").then_some(())?;
    Some((be32(b, 16)?, be32(b, 20)?))
}

/// JPEG: walk the segments up to a start-of-frame marker (SOF0…SOF15 without DHT/JPG/DAC).
fn jpeg_size(b: &[u8]) -> Option<(u32, u32)> {
    let mut i = 2;
    while i + 4 <= b.len() {
        if b[i] != 0xFF {
            return None;
        }
        let marker = b[i + 1];
        if marker == 0xFF {
            i += 1; // fill byte
            continue;
        }
        if marker == 0xD8 || (0xD0..=0xD7).contains(&marker) || marker == 0x01 {
            i += 2;
            continue;
        }
        let len = be16(b, i + 2)? as usize;
        if (0xC0..=0xCF).contains(&marker) && ![0xC4, 0xC8, 0xCC].contains(&marker) {
            return Some((be16(b, i + 7)?, be16(b, i + 5)?));
        }
        if len < 2 {
            return None;
        }
        i += 2 + len;
    }
    None
}

/// WebP: RIFF container with a VP8 (lossy), VP8L (lossless) or VP8X (extended) chunk.
fn webp_size(b: &[u8]) -> Option<(u32, u32)> {
    match b.get(12..16)? {
        b"VP8 " => {
            (b.get(23..26)? == [0x9D, 0x01, 0x2A]).then_some(())?;
            Some((le16(b, 26)? & 0x3FFF, le16(b, 28)? & 0x3FFF))
        }
        b"VP8L" => {
            (*b.get(20)? == 0x2F).then_some(())?;
            let bits = u32::from_le_bytes(b.get(21..25)?.try_into().ok()?);
            Some(((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1))
        }
        b"VP8X" => Some((le24(b, 24)? + 1, le24(b, 27)? + 1)),
        _ => None,
    }
}

/// UTF-8 text whose first element is `<svg` (after declaration, comments, doctype).
fn is_svg(b: &[u8]) -> bool {
    let Ok(text) = std::str::from_utf8(strip_bom(b)) else {
        return false;
    };
    let mut t = text.trim_start();
    loop {
        if let Some(rest) = t.strip_prefix("<?") {
            match rest.find("?>") {
                Some(end) => t = rest[end + 2..].trim_start(),
                None => return false,
            }
        } else if let Some(rest) = t.strip_prefix("<!--") {
            match rest.find("-->") {
                Some(end) => t = rest[end + 3..].trim_start(),
                None => return false,
            }
        } else if let Some(rest) = t.strip_prefix("<!") {
            match rest.find('>') {
                Some(end) => t = rest[end + 1..].trim_start(),
                None => return false,
            }
        } else {
            break;
        }
    }
    t.strip_prefix("<svg")
        .and_then(|r| r.chars().next())
        .is_some_and(|c| c.is_whitespace() || c == '>' || c == '/')
}

/// The kind of `bytes` and the natural size from the header; `None` = not an accepted image.
pub fn detect(bytes: &[u8]) -> Option<(ImageKind, Option<(u32, u32)>)> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return png_size(bytes).map(|s| (ImageKind::Png, Some(s)));
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return jpeg_size(bytes).map(|s| (ImageKind::Jpeg, Some(s)));
    }
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        return webp_size(bytes).map(|s| (ImageKind::Webp, Some(s)));
    }
    is_svg(bytes).then_some((ImageKind::Svg, None))
}

pub fn read_image_file(path: &Path) -> Result<ImageFile, FsError> {
    read_image_file_limited(path, MAX_IMAGE)
}

pub(crate) fn read_image_file_limited(path: &Path, limit: u64) -> Result<ImageFile, FsError> {
    // a folder first: Windows refuses to open one (PermissionDenied) before we could ask
    let meta = fs::metadata(path).map_err(|e| FsError::from_io(&e, path))?;
    if meta.is_dir() {
        return Err(FsError::new(
            FsErrorCode::IsADirectory,
            "folder",
            Some(path),
        ));
    }
    let f = fs::File::open(path).map_err(|e| FsError::from_io(&e, path))?;
    let bytes = read_limited(f, limit)
        .map_err(|e| FsError::from_io(&e, path))?
        .ok_or_else(|| FsError::new(FsErrorCode::TooLarge, "image too large", Some(path)))?;
    let (kind, size) = detect(&bytes).ok_or_else(|| {
        FsError::new(
            FsErrorCode::InvalidImage,
            "not a PNG, JPEG, WebP or SVG image",
            Some(path),
        )
    })?;
    let data = if kind == ImageKind::Svg {
        strip_bom(&bytes)
    } else {
        &bytes[..]
    };
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    Ok(ImageFile {
        name,
        mime: kind.mime().to_owned(),
        data_url: format!(
            "data:{};base64,{}",
            kind.mime(),
            base64::engine::general_purpose::STANDARD.encode(data)
        ),
        width: size.map(|s| s.0),
        height: size.map(|s| s.1),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    /// A minimal PNG header (signature + IHDR) of `w` × `h`.
    pub(crate) fn png(w: u32, h: u32) -> Vec<u8> {
        let mut b = b"\x89PNG\r\n\x1a\n\0\0\0\x0dIHDR".to_vec();
        b.extend_from_slice(&w.to_be_bytes());
        b.extend_from_slice(&h.to_be_bytes());
        b.extend_from_slice(&[8, 6, 0, 0, 0, 0, 0, 0, 0]);
        b
    }

    fn jpeg(w: u16, h: u16) -> Vec<u8> {
        let mut b = vec![0xFF, 0xD8];
        // APP0 segment (skipped), then SOF2 (progressive)
        b.extend_from_slice(&[0xFF, 0xE0, 0x00, 0x04, 0x4A, 0x46]);
        b.extend_from_slice(&[0xFF, 0xC2, 0x00, 0x11, 0x08]);
        b.extend_from_slice(&h.to_be_bytes());
        b.extend_from_slice(&w.to_be_bytes());
        b.extend_from_slice(&[0x03, 0, 0, 0]);
        b
    }

    fn riff(chunk: &[u8; 4], body: &[u8]) -> Vec<u8> {
        let mut b = b"RIFF\0\0\0\0WEBP".to_vec();
        b.extend_from_slice(chunk);
        b.extend_from_slice(&(body.len() as u32).to_le_bytes());
        b.extend_from_slice(body);
        b
    }

    #[test]
    fn detects_png_jpeg_and_webp_with_their_size() {
        assert_eq!(
            detect(&png(640, 480)),
            Some((ImageKind::Png, Some((640, 480))))
        );
        assert_eq!(
            detect(&jpeg(800, 600)),
            Some((ImageKind::Jpeg, Some((800, 600))))
        );
        // VP8: frame tag (3 bytes), start code, 14-bit sizes
        let vp8 = riff(
            b"VP8 ",
            &[0, 0, 0, 0x9D, 0x01, 0x2A, 0x20, 0x03, 0x58, 0x02],
        );
        assert_eq!(detect(&vp8), Some((ImageKind::Webp, Some((800, 600)))));
        // VP8L: signature 0x2F, then (w-1) and (h-1) in 14 bits each
        let bits: u32 = 99 | (49 << 14);
        let mut body = vec![0x2F];
        body.extend_from_slice(&bits.to_le_bytes());
        assert_eq!(
            detect(&riff(b"VP8L", &body)),
            Some((ImageKind::Webp, Some((100, 50))))
        );
        // VP8X: flags + reserved, then (w-1) and (h-1) in 24 bits each
        let vp8x = riff(b"VP8X", &[0, 0, 0, 0, 0xFF, 0x03, 0, 0xFF, 0x01, 0]);
        assert_eq!(detect(&vp8x), Some((ImageKind::Webp, Some((1024, 512)))));
    }

    #[test]
    fn detects_svg_text_only() {
        for svg in [
            "<svg xmlns=\"http://www.w3.org/2000/svg\"/>",
            "\u{feff}<?xml version=\"1.0\"?>\n<!-- c -->\n<!DOCTYPE svg>\n<svg>",
            "  <svg\nwidth=\"1\">",
        ] {
            assert_eq!(
                detect(svg.as_bytes()),
                Some((ImageKind::Svg, None)),
                "{svg}"
            );
        }
        for not in ["<svgx>", "<html><svg>", "hello", "<!-- open", "GIF89a"] {
            assert_eq!(detect(not.as_bytes()), None, "{not}");
        }
        // a PNG signature with a broken header is no image
        assert_eq!(detect(b"\x89PNG\r\n\x1a\n\0\0\0\x0dXXXX"), None);
        assert_eq!(detect(&[0xFF, 0xD8, 0xFF, 0x00]), None);
    }

    #[test]
    fn reads_an_image_as_data_url() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("ü.png");
        fs::write(&p, png(3, 2)).unwrap();
        let img = read_image_file(&p).unwrap();
        assert_eq!(img.name, "ü.png");
        assert_eq!(img.mime, "image/png");
        assert!(
            img.data_url
                .starts_with("data:image/png;base64,iVBORw0KGgo")
        );
        assert_eq!((img.width, img.height), (Some(3), Some(2)));
        let json = serde_json::to_value(&img).unwrap();
        assert!(json.get("dataUrl").is_some());

        // the extension does not matter, the BOM of an SVG is dropped
        let s = dir.path().join("logo.png");
        fs::write(&s, "\u{feff}<svg/>").unwrap();
        let svg = read_image_file(&s).unwrap();
        assert_eq!(svg.mime, "image/svg+xml");
        assert_eq!(svg.data_url, "data:image/svg+xml;base64,PHN2Zy8+");
        assert_eq!(svg.width, None);
    }

    #[test]
    fn rejects_foreign_big_and_missing_files() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("x.gif");
        fs::write(&p, b"GIF89a....").unwrap();
        assert_eq!(
            read_image_file(&p).unwrap_err().code,
            FsErrorCode::InvalidImage
        );
        fs::write(&p, png(1, 1)).unwrap();
        assert_eq!(
            read_image_file_limited(&p, 10).unwrap_err().code,
            FsErrorCode::TooLarge
        );
        assert_eq!(
            read_image_file(dir.path()).unwrap_err().code,
            FsErrorCode::IsADirectory
        );
        assert_eq!(
            read_image_file(&dir.path().join("none.png"))
                .unwrap_err()
                .code,
            FsErrorCode::NotFound
        );
    }
}
