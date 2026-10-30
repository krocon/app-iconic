//! Paths the user handed to the app (prompt 071, prepared for the path rule of prompt 033): files
//! dropped onto a window count as chosen like the answer of an "open" dialog. The set is bounded
//! (oldest out first), so a long session cannot grow it without end. Prompt 033 adds the other
//! trusted sources and lets the file commands check against it.

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Most remembered paths.
pub const MAX_PATHS: usize = 1024;

#[derive(Debug, Default)]
pub struct UserPaths(Mutex<VecDeque<PathBuf>>);

impl UserPaths {
    /// Remembers `paths` (absolute ones only; a known path moves to the end).
    pub fn allow<'a>(&self, paths: impl IntoIterator<Item = &'a Path>) {
        let mut set = self.0.lock().unwrap_or_else(|e| e.into_inner());
        for p in paths.into_iter().filter(|p| p.is_absolute()) {
            set.retain(|q| q != p);
            set.push_back(p.to_path_buf());
            if set.len() > MAX_PATHS {
                set.pop_front();
            }
        }
    }

    pub fn contains(&self, path: &Path) -> bool {
        let set = self.0.lock().unwrap_or_else(|e| e.into_inner());
        set.iter().any(|p| p == path)
    }

    pub fn len(&self) -> usize {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
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
        assert!(set.contains(&a));
        assert!(!set.contains(Path::new("relative.svg")));
        assert!(!set.contains(&abs("b.svg")));
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
        assert!(!set.contains(&paths[0]) && !set.contains(&paths[1]));
        assert!(set.contains(&paths[MAX_PATHS + 1]));
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
