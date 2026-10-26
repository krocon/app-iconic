//! "Import SVG…": a single SVG file as text (design 002 E15). Cleaning the markup (scripts,
//! event handlers, external references) is the frontend's job when it imports (prompt 003).

use super::bundle::read_limited;
use super::strip_bom;
use crate::error::{FsError, FsErrorCode};
use serde::Serialize;
use std::fs;
use std::path::Path;

pub const MAX_SVG: u64 = 16 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SvgFile {
    /// File name with extension, e.g. `logo.svg`.
    pub name: String,
    pub text: String,
}

pub fn read_svg_file(path: &Path) -> Result<SvgFile, FsError> {
    read_svg_file_limited(path, MAX_SVG)
}

pub(crate) fn read_svg_file_limited(path: &Path, limit: u64) -> Result<SvgFile, FsError> {
    let f = fs::File::open(path).map_err(|e| FsError::from_io(&e, path))?;
    let meta = f.metadata().map_err(|e| FsError::from_io(&e, path))?;
    if meta.is_dir() {
        return Err(FsError::new(
            FsErrorCode::IsADirectory,
            "folder",
            Some(path),
        ));
    }
    let bytes = read_limited(f, limit)
        .map_err(|e| FsError::from_io(&e, path))?
        .ok_or_else(|| FsError::new(FsErrorCode::TooLarge, "SVG too large", Some(path)))?;
    let text = std::str::from_utf8(strip_bom(&bytes))
        .map_err(|e| FsError::new(FsErrorCode::InvalidSvg, e.to_string(), Some(path)))?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    Ok(SvgFile {
        name,
        text: text.to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::icon::testdata::fixtures;
    use tempfile::tempdir;

    #[test]
    fn reads_every_svg_fixture() {
        for e in fs::read_dir(fixtures().join("svg")).unwrap() {
            let p = e.unwrap().path();
            let svg = read_svg_file(&p).unwrap();
            assert!(svg.text.contains("<svg"), "{}", svg.name);
            assert!(svg.name.ends_with(".svg"));
        }
    }

    #[test]
    fn strips_the_bom_and_rejects_non_utf8_and_big_files() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("ü 😀.svg");
        fs::write(&p, b"\xEF\xBB\xBF<svg/>").unwrap();
        let svg = read_svg_file(&p).unwrap();
        assert_eq!(
            (svg.name.as_str(), svg.text.as_str()),
            ("ü 😀.svg", "<svg/>")
        );
        fs::write(&p, b"\xFF\xFE<\0s\0").unwrap();
        assert_eq!(read_svg_file(&p).unwrap_err().code, FsErrorCode::InvalidSvg);
        fs::write(&p, vec![b' '; 101]).unwrap();
        assert_eq!(
            read_svg_file_limited(&p, 100).unwrap_err().code,
            FsErrorCode::TooLarge
        );
        assert_eq!(
            read_svg_file(&dir.path().join("none.svg"))
                .unwrap_err()
                .code,
            FsErrorCode::NotFound
        );
    }
}
