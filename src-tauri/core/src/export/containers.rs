//! Icon container files (prompt 078 E6): macOS `.icns` and Windows `.ico`, both holding PNG
//! images. Own small writers instead of crates – each format is a header and a table of entries,
//! the PNG bytes come from resvg/tiny-skia anyway. The readers here only serve the tests (and
//! check what we write); they never read files from outside.
//!
//! - `.icns`: `'icns'` + big-endian total length, then per image an OSType + big-endian length
//!   (incl. the 8-byte element header) + PNG data. OSTypes after the `iconutil` iconset names
//!   (Apple, "Optimizing for High Resolution": `icon_16x16.png` … `icon_512x512@2x.png`).
//! - `.ico`: `ICONDIR` (reserved 0, type 1, count) + one 16-byte `ICONDIRENTRY` per image
//!   (little endian; width/height 0 = 256) + PNG data (Microsoft, "Icons in Win32").

use crate::error::{FsError, FsErrorCode};

/// The PNG elements of an `.icns` in file order: OSType and pixel size (the iconset name in the
/// comment). `icp4`/`icp5` (16, 32 px) as PNG since Mac OS X 10.7, `ic11`–`ic14` (@2x) since 10.8.
pub const ICNS_TYPES: [(&[u8; 4], u32); 10] = [
    (b"icp4", 16),   // icon_16x16
    (b"ic11", 32),   // icon_16x16@2x
    (b"icp5", 32),   // icon_32x32
    (b"ic12", 64),   // icon_32x32@2x
    (b"ic07", 128),  // icon_128x128
    (b"ic13", 256),  // icon_128x128@2x
    (b"ic08", 256),  // icon_256x256
    (b"ic14", 512),  // icon_256x256@2x
    (b"ic09", 512),  // icon_512x512
    (b"ic10", 1024), // icon_512x512@2x
];

/// The sizes of the `.ico` (prompt 078; Microsoft: "at the bare minimum 16, 24, 32, 48 and 256",
/// plus 64 for 150 % at 48).
pub const ICO_SIZES: [u32; 6] = [16, 24, 32, 48, 64, 256];

fn invalid(message: &str) -> FsError {
    FsError::new(FsErrorCode::InvalidRequest, message, None)
}

/// An `.icns` from `(OSType, PNG)` elements.
pub fn write_icns(elements: &[(&[u8; 4], &[u8])]) -> Result<Vec<u8>, FsError> {
    let total: usize = 8 + elements.iter().map(|(_, d)| 8 + d.len()).sum::<usize>();
    let total = u32::try_from(total).map_err(|_| invalid("icns too large"))?;
    let mut out = Vec::with_capacity(total as usize);
    out.extend_from_slice(b"icns");
    out.extend_from_slice(&total.to_be_bytes());
    for (ty, data) in elements {
        out.extend_from_slice(*ty);
        out.extend_from_slice(&((data.len() + 8) as u32).to_be_bytes());
        out.extend_from_slice(data);
    }
    Ok(out)
}

/// An `.ico` from `(pixel size, PNG)` images (square, 1…256 px).
pub fn write_ico(images: &[(u32, &[u8])]) -> Result<Vec<u8>, FsError> {
    let count = u16::try_from(images.len()).map_err(|_| invalid("too many images"))?;
    let mut out = Vec::new();
    out.extend_from_slice(&0u16.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&count.to_le_bytes());
    let mut offset = 6 + 16 * images.len();
    for (size, data) in images {
        if !(1..=256).contains(size) {
            return Err(invalid("ico image size must be 1…256"));
        }
        let side = if *size == 256 { 0 } else { *size as u8 };
        out.extend_from_slice(&[side, side, 0, 0]);
        out.extend_from_slice(&1u16.to_le_bytes()); // colour planes
        out.extend_from_slice(&32u16.to_le_bytes()); // bits per pixel
        out.extend_from_slice(&(data.len() as u32).to_le_bytes());
        out.extend_from_slice(&(offset as u32).to_le_bytes());
        offset += data.len();
    }
    for (_, data) in images {
        out.extend_from_slice(data);
    }
    Ok(out)
}

/// The elements of an `.icns` (OSType, data) – `None` if the structure is broken.
pub fn read_icns(bytes: &[u8]) -> Option<Vec<([u8; 4], Vec<u8>)>> {
    if bytes.len() < 8 || &bytes[..4] != b"icns" {
        return None;
    }
    let total = u32::from_be_bytes(bytes[4..8].try_into().ok()?) as usize;
    if total != bytes.len() {
        return None;
    }
    let mut out = Vec::new();
    let mut at = 8;
    while at < total {
        let head = bytes.get(at..at + 8)?;
        let len = u32::from_be_bytes(head[4..8].try_into().ok()?) as usize;
        if len < 8 {
            return None;
        }
        let data = bytes.get(at + 8..at + len)?;
        out.push((head[..4].try_into().ok()?, data.to_vec()));
        at += len;
    }
    Some(out)
}

/// The images of an `.ico` (directory width with 0 = 256, data) – `None` if broken.
pub fn read_ico(bytes: &[u8]) -> Option<Vec<(u32, Vec<u8>)>> {
    let u16_at = |i: usize| Some(u16::from_le_bytes(bytes.get(i..i + 2)?.try_into().ok()?));
    let u32_at = |i: usize| Some(u32::from_le_bytes(bytes.get(i..i + 4)?.try_into().ok()?));
    if u16_at(0)? != 0 || u16_at(2)? != 1 {
        return None;
    }
    let count = u16_at(4)? as usize;
    let mut out = Vec::new();
    for i in 0..count {
        let e = 6 + 16 * i;
        let w = *bytes.get(e)?;
        let len = u32_at(e + 8)? as usize;
        let off = u32_at(e + 12)? as usize;
        out.push((
            if w == 0 { 256 } else { u32::from(w) },
            bytes.get(off..off + len)?.to_vec(),
        ));
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::icon::image_file::{ImageKind, detect};
    use resvg::tiny_skia::Pixmap;

    fn png(size: u32) -> Vec<u8> {
        let mut p = Pixmap::new(size, size).unwrap();
        p.fill(resvg::tiny_skia::Color::from_rgba8(10, 20, 30, 255));
        p.encode_png().unwrap()
    }

    #[test]
    fn icns_round_trip_with_lengths_and_types() {
        let a = png(16);
        let b = png(32);
        let bytes = write_icns(&[(b"icp4", &a), (b"ic11", &b)]).unwrap();
        assert_eq!(&bytes[..4], b"icns");
        assert_eq!(
            u32::from_be_bytes(bytes[4..8].try_into().unwrap()) as usize,
            bytes.len()
        );
        let back = read_icns(&bytes).unwrap();
        assert_eq!(back.len(), 2);
        assert_eq!(&back[0].0, b"icp4");
        assert_eq!(back[1].1, b);
        assert_eq!(detect(&back[1].1), Some((ImageKind::Png, Some((32, 32)))));
        // a broken length is noticed
        let mut broken = bytes.clone();
        broken[15] = 0xff;
        assert!(read_icns(&broken).is_none());
    }

    #[test]
    fn ico_round_trip_with_256_as_zero() {
        let imgs: Vec<(u32, Vec<u8>)> = [16, 256].iter().map(|&s| (s, png(s))).collect();
        let refs: Vec<(u32, &[u8])> = imgs.iter().map(|(s, d)| (*s, d.as_slice())).collect();
        let bytes = write_ico(&refs).unwrap();
        assert_eq!(&bytes[..6], &[0, 0, 1, 0, 2, 0]);
        assert_eq!(bytes[6 + 16], 0, "256 is written as 0");
        assert_eq!(u16::from_le_bytes([bytes[6 + 6], bytes[6 + 7]]), 32);
        let back = read_ico(&bytes).unwrap();
        assert_eq!(back[0].0, 16);
        assert_eq!(back[1].0, 256);
        assert_eq!(back[1].1, imgs[1].1);
        assert_eq!(
            write_ico(&[(300, &imgs[0].1[..])]).unwrap_err().code,
            FsErrorCode::InvalidRequest
        );
    }
}
