//! Preview images of the recently used icons (prompt 082, design E4): a small PNG per entry of
//! `recent.json` in `<app config>/thumbnails/`, named after a stable hash of the path – never inside
//! the `.icon`. Written atomically, limited in size, removed together with their `recent.json`
//! entry ([`prune`]). The WebView never sees a path of this folder, only data URLs ([`data_url`]).

use crate::error::{FsError, FsErrorCode};
use crate::export::png;
use crate::fs_atomic::write_atomic;
use base64::Engine;
use resvg::usvg::fontdb::Database;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::Arc;

/// Folder in the app config directory.
pub const DIR_NAME: &str = "thumbnails";
/// Side in pixels (128 CSS pixels on a Retina screen; mockup neighbours up to 3×).
pub const SIZE: u32 = 256;
/// Largest preview image kept (a 256 px PNG is far below; a bigger file is not ours).
pub const MAX_BYTES: u64 = 512 * 1024;

const PNG_MAGIC: &[u8] = b"\x89PNG\r\n\x1a\n";
/// Length of the hash part of a name (FNV-1a, 64 bit, hex).
const HASH_LEN: usize = 16;

/// The file name of `path`'s preview: FNV-1a 64 of the UTF-8 path, 16 hex digits, `.png`.
/// Stable across versions and platforms (unlike `DefaultHasher`).
pub fn file_name(path: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in path.as_bytes() {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}.png")
}

/// One of our files: `<16 hex>.png`, or a temp file `write_atomic` left behind (`….png.tmp-…`).
fn ours(name: &str) -> bool {
    let hash = name.get(..HASH_LEN).unwrap_or("");
    let rest = name.get(HASH_LEN..).unwrap_or("");
    hash.len() == HASH_LEN
        && hash.bytes().all(|b| b.is_ascii_hexdigit())
        && (rest == ".png" || rest.starts_with(".png.tmp-"))
}

fn too_large(len: u64) -> FsError {
    FsError::new(
        FsErrorCode::TooLarge,
        format!("preview has {len} bytes, limit {MAX_BYTES}"),
        None,
    )
}

/// `svg` (the icon as the canvas shows it) rendered square in [`SIZE`] px as PNG bytes.
pub fn render(svg: &str, fonts: Arc<Database>) -> Result<Vec<u8>, FsError> {
    let pixmap = png::render_png(svg, SIZE, fonts)?;
    let bytes = png::encode(&pixmap)?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(too_large(bytes.len() as u64));
    }
    Ok(bytes)
}

/// Writes the preview of `path` atomically into `dir` (created if needed).
pub fn store(dir: &Path, path: &str, png: &[u8]) -> Result<(), FsError> {
    if png.len() as u64 > MAX_BYTES {
        return Err(too_large(png.len() as u64));
    }
    if !png.starts_with(PNG_MAGIC) {
        return Err(FsError::new(FsErrorCode::InvalidImage, "not a PNG", None));
    }
    let file = dir.join(file_name(path));
    write_atomic(&file, png).map_err(|e| FsError::from_io(&e, &file))
}

/// The preview of `path` as `data:image/png;base64,…`; `None` if there is none (or it is not a
/// PNG of at most [`MAX_BYTES`]).
pub fn data_url(dir: &Path, path: &str) -> Option<String> {
    let f = fs::File::open(dir.join(file_name(path))).ok()?;
    let mut bytes = Vec::new();
    f.take(MAX_BYTES + 1).read_to_end(&mut bytes).ok()?;
    if bytes.len() as u64 > MAX_BYTES || !bytes.starts_with(PNG_MAGIC) {
        return None;
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:image/png;base64,{b64}"))
}

/// Removes every preview (and temp leftover) whose path is not in `keep`; other files stay.
/// Returns how many files were removed.
pub fn prune(dir: &Path, keep: &[String]) -> usize {
    let wanted: Vec<String> = keep.iter().map(|p| file_name(p)).collect();
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };
    let mut removed = 0;
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if !ours(&name) || wanted.contains(&name) {
            continue;
        }
        if e.file_type().is_ok_and(|t| t.is_file()) && fs::remove_file(e.path()).is_ok() {
            removed += 1;
        }
    }
    removed
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fonts::system::system_fonts;
    use tempfile::tempdir;

    const SVG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#0a84ff"/></svg>"##;

    fn tiny_png() -> Vec<u8> {
        render(SVG, system_fonts()).unwrap()
    }

    #[test]
    fn names_are_stable_hex_and_differ_per_path() {
        assert_eq!(file_name(""), "cbf29ce484222325.png");
        assert_eq!(file_name("/a/b.icon"), file_name("/a/b.icon"));
        assert_ne!(file_name("/a/b.icon"), file_name("/a/c.icon"));
        let n = file_name("/Users/ü/Icon.icon");
        assert!(ours(&n), "{n}");
        assert!(ours(&format!("{n}.tmp-12-3")));
        assert!(!ours("notes.txt") && !ours("0123456789abcdeg.png") && !ours("abc.png"));
    }

    #[test]
    fn renders_a_square_png_of_the_preview_size() {
        let png = tiny_png();
        assert!(png.starts_with(PNG_MAGIC));
        let pixmap = resvg::tiny_skia::Pixmap::decode_png(&png).unwrap();
        assert_eq!((pixmap.width(), pixmap.height()), (SIZE, SIZE));
        assert!(render("<svg", system_fonts()).is_err());
    }

    #[test]
    fn store_and_read_back_as_data_url() {
        let dir = tempdir().unwrap();
        let sub = dir.path().join(DIR_NAME);
        assert_eq!(data_url(&sub, "/a.icon"), None);
        let png = tiny_png();
        store(&sub, "/a.icon", &png).unwrap();
        let url = data_url(&sub, "/a.icon").unwrap();
        assert!(
            url.starts_with("data:image/png;base64,iVBORw0KGgo"),
            "{url}"
        );
        assert_eq!(data_url(&sub, "/b.icon"), None);
        // no temp file left behind
        let names: Vec<_> = fs::read_dir(&sub).unwrap().flatten().collect();
        assert_eq!(names.len(), 1);
    }

    #[test]
    fn limits_size_and_kind() {
        let dir = tempdir().unwrap();
        let mut big = PNG_MAGIC.to_vec();
        big.resize(MAX_BYTES as usize + 1, 0);
        assert_eq!(
            store(dir.path(), "/a.icon", &big).unwrap_err().code,
            FsErrorCode::TooLarge
        );
        assert_eq!(
            store(dir.path(), "/a.icon", b"GIF89a").unwrap_err().code,
            FsErrorCode::InvalidImage
        );
        // a file that is not a PNG (or too big) is never handed out
        fs::write(dir.path().join(file_name("/x.icon")), b"<svg/>").unwrap();
        assert_eq!(data_url(dir.path(), "/x.icon"), None);
        fs::write(dir.path().join(file_name("/y.icon")), &big).unwrap();
        assert_eq!(data_url(dir.path(), "/y.icon"), None);
    }

    #[test]
    fn prune_keeps_listed_and_foreign_files() {
        let dir = tempdir().unwrap();
        let png = tiny_png();
        for p in ["/a.icon", "/b.icon", "/c.icon"] {
            store(dir.path(), p, &png).unwrap();
        }
        let leftover = format!("{}.tmp-1-1", file_name("/a.icon"));
        fs::write(dir.path().join(&leftover), b"x").unwrap();
        fs::write(dir.path().join("README.txt"), b"keep").unwrap();
        let removed = prune(dir.path(), &["/a.icon".into(), "/c.icon".into()]);
        assert_eq!(removed, 2, "b.icon and the temp leftover");
        assert!(data_url(dir.path(), "/a.icon").is_some());
        assert!(data_url(dir.path(), "/b.icon").is_none());
        assert!(data_url(dir.path(), "/c.icon").is_some());
        assert!(dir.path().join("README.txt").exists());
        assert_eq!(prune(dir.path(), &[]), 2);
        assert_eq!(prune(&dir.path().join("missing"), &[]), 0);
    }
}
