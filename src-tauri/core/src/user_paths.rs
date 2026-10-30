//! Paths from trusted sources (prompt 033 E1, prepared in 071): the file commands (`open_icon`,
//! `save_icon`, `read_svg_file`, `read_image_file`, `export_*`, `add_recent_file`,
//! `open_document_window`) only take a path the backend saw coming from somewhere trusted – the
//! answer of a `pick_*` dialog, "Open Recent", the system (argv, a second start, the Finder), a
//! drop onto a window, the AI bridge the user switched on, or an internal folder of the app.
//! Anything else is `not_allowed`: a compromised WebView cannot read or overwrite arbitrary files
//! (defence in depth, review 031 finding 6; model: `reveal.rs`).
//!
//! Two kinds of grants:
//! - [`UserPaths::allow`]: exact paths (files or folders as the user chose them). Bounded, the
//!   oldest go first, so a long session cannot grow the set without end.
//! - [`UserPaths::allow_tree`]: a folder of the app and everything below it (recovery files,
//!   symbol libraries, … – prompts 083/084/086). Only for folders the backend computes itself,
//!   never for a path from the WebView.
//!
//! Paths are compared by their components (no `canonicalize`: a dialog answer comes back as the
//! same string, symlinks are not resolved); a path with `..` is never allowed, below a tree neither.

use crate::error::{FsError, FsErrorCode};
use std::collections::VecDeque;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

/// Most remembered exact paths.
pub const MAX_PATHS: usize = 1024;

#[derive(Debug, Default)]
pub struct UserPaths {
    exact: Mutex<VecDeque<PathBuf>>,
    trees: Mutex<Vec<PathBuf>>,
}

impl UserPaths {
    /// Remembers `paths` (absolute ones only; a known path moves to the end).
    pub fn allow<'a>(&self, paths: impl IntoIterator<Item = &'a Path>) {
        let mut set = self.exact.lock().unwrap_or_else(|e| e.into_inner());
        for p in paths.into_iter().filter(|p| is_plain_absolute(p)) {
            set.retain(|q| q != p);
            set.push_back(p.to_path_buf());
            if set.len() > MAX_PATHS {
                set.pop_front();
            }
        }
    }

    /// [`allow`](Self::allow) for path strings (dialog answers, recent files, the AI bridge).
    pub fn allow_str<'a>(&self, paths: impl IntoIterator<Item = &'a str>) {
        let paths: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
        self.allow(paths.iter().map(PathBuf::as_path));
    }

    /// Allows the internal folder `dir` and everything below it (absolute, without `..`).
    /// For folders the backend computes (app data, recovery, libraries) – never a WebView path.
    pub fn allow_tree(&self, dir: &Path) -> Result<(), FsError> {
        if !is_plain_absolute(dir) {
            return Err(FsError::new(
                FsErrorCode::InvalidPath,
                "an internal folder must be absolute without ..",
                Some(dir),
            ));
        }
        let mut trees = self.trees.lock().unwrap_or_else(|e| e.into_inner());
        if !trees.iter().any(|t| t == dir) {
            trees.push(dir.to_path_buf());
        }
        Ok(())
    }

    /// `path` came from a trusted source: allowed exactly or inside an allowed tree.
    pub fn is_allowed(&self, path: &Path) -> bool {
        if !is_plain_absolute(path) {
            return false;
        }
        let exact = self.exact.lock().unwrap_or_else(|e| e.into_inner());
        if exact.iter().any(|p| p == path) {
            return true;
        }
        drop(exact);
        let trees = self.trees.lock().unwrap_or_else(|e| e.into_inner());
        trees.iter().any(|t| path.starts_with(t))
    }

    /// `Ok` for an allowed path, else `not_allowed`.
    pub fn check(&self, path: &Path) -> Result<(), FsError> {
        if self.is_allowed(path) {
            Ok(())
        } else {
            Err(FsError::new(
                FsErrorCode::NotAllowed,
                "the path did not come from a dialog, a recent file, the system or a drop",
                Some(path),
            ))
        }
    }

    /// A path from the WebView: absolute (`invalid_path`) and allowed (`not_allowed`).
    pub fn checked(&self, path: &str) -> Result<PathBuf, FsError> {
        let p = PathBuf::from(path);
        if path.is_empty() || !p.is_absolute() {
            return Err(FsError::new(
                FsErrorCode::InvalidPath,
                "path must be absolute",
                Some(&p),
            ));
        }
        self.check(&p)?;
        Ok(p)
    }

    /// Number of exact paths.
    pub fn len(&self) -> usize {
        self.exact.lock().unwrap_or_else(|e| e.into_inner()).len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// Absolute and without `.`/`..` components (so `starts_with` cannot be fooled).
fn is_plain_absolute(p: &Path) -> bool {
    p.is_absolute()
        && !p
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
        && !p.as_os_str().to_string_lossy().contains('\0')
}

/// What a dropped file is, by its extension (the reading commands check the content again).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DropKind {
    Icon,
    Svg,
    Image,
    Other,
}

pub fn drop_kind(path: &Path) -> DropKind {
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "icon" => DropKind::Icon,
        "svg" => DropKind::Svg,
        "png" | "jpg" | "jpeg" | "webp" => DropKind::Image,
        _ => DropKind::Other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn abs(name: &str) -> PathBuf {
        std::env::temp_dir().join(name)
    }

    #[test]
    fn dropped_paths_are_allowed_relative_ones_not() {
        let set = UserPaths::default();
        let a = abs("a.svg");
        set.allow([a.as_path(), Path::new("relative.svg")]);
        assert!(set.is_allowed(&a));
        assert!(!set.is_allowed(Path::new("relative.svg")));
        assert!(!set.is_allowed(&abs("b.svg")));
        set.allow([a.as_path()]);
        assert_eq!(set.len(), 1);
    }

    #[test]
    fn the_set_is_bounded_oldest_out_first() {
        let set = UserPaths::default();
        let paths: Vec<PathBuf> = (0..MAX_PATHS + 2)
            .map(|i| abs(&format!("{i}.png")))
            .collect();
        set.allow(paths.iter().map(PathBuf::as_path));
        assert_eq!(set.len(), MAX_PATHS);
        assert!(!set.is_allowed(&paths[0]) && !set.is_allowed(&paths[1]));
        assert!(set.is_allowed(&paths[MAX_PATHS + 1]));
    }

    #[test]
    fn exact_paths_do_not_open_their_folder_or_neighbours() {
        let set = UserPaths::default();
        let dir = abs("picked");
        set.allow_str([dir.to_str().unwrap()]);
        assert!(set.is_allowed(&dir));
        assert!(
            !set.is_allowed(&dir.join("inner.svg")),
            "a picked folder is no tree"
        );
        assert!(!set.is_allowed(&abs("picked2")));
        assert_eq!(
            set.check(&abs("other.icon")).unwrap_err().code,
            FsErrorCode::NotAllowed
        );
    }

    #[test]
    fn checked_wants_absolute_then_allowed() {
        let set = UserPaths::default();
        assert_eq!(set.checked("").unwrap_err().code, FsErrorCode::InvalidPath);
        assert_eq!(
            set.checked("a.icon").unwrap_err().code,
            FsErrorCode::InvalidPath
        );
        let p = abs("a.icon");
        let s = p.to_str().unwrap();
        assert_eq!(set.checked(s).unwrap_err().code, FsErrorCode::NotAllowed);
        set.allow([p.as_path()]);
        assert_eq!(set.checked(s).unwrap(), p);
    }

    #[test]
    fn trees_allow_everything_below_but_no_escape() {
        let set = UserPaths::default();
        let root = abs("app-data").join("recovery");
        set.allow_tree(&root).unwrap();
        assert!(set.is_allowed(&root));
        assert!(set.is_allowed(&root.join("doc-1").join("a.icon")));
        assert!(!set.is_allowed(&root.join("..").join("settings.json")));
        // `.` inside a path is no component for `Path` (it stays inside)
        assert!(set.is_allowed(&root.join(".").join("x")));
        assert!(!set.is_allowed(&abs("app-data").join("recovery2")));
        assert!(!set.is_allowed(&abs("app-data")));
        assert_eq!(
            set.allow_tree(Path::new("relative")).unwrap_err().code,
            FsErrorCode::InvalidPath
        );
        assert!(set.allow_tree(&root.join("..")).is_err());
        // exact grants with `..` are ignored too
        set.allow([abs("x").join("..").join("y").as_path()]);
        assert!(set.is_empty());
    }

    #[test]
    fn kinds_by_extension() {
        assert_eq!(drop_kind(Path::new("/x/A.ICON")), DropKind::Icon);
        assert_eq!(drop_kind(Path::new("/x/a.svg")), DropKind::Svg);
        for e in ["png", "JPG", "jpeg", "webp"] {
            assert_eq!(
                drop_kind(&PathBuf::from(format!("/x/a.{e}"))),
                DropKind::Image
            );
        }
        assert_eq!(drop_kind(Path::new("/x/a.pdf")), DropKind::Other);
        assert_eq!(drop_kind(Path::new("/x/noext")), DropKind::Other);
    }
}
