//! "Show in Finder / Explorer / Files" after an export (design 030 E6) – instead of a share sheet.
//! Only paths this process exported can be shown: the WebView names a file, Rust checks that it
//! wrote it and asks the file manager to select it. Nothing is opened or run.

use crate::error::{FsError, FsErrorCode};
use std::collections::VecDeque;
use std::path::Path;
use std::sync::Mutex;
use tauri::State;

/// Most remembered exported files (the oldest go first).
const MAX_REMEMBERED: usize = 1024;

/// The files written by the exports of this process.
#[derive(Default)]
pub struct Exported(Mutex<VecDeque<String>>);

impl Exported {
    pub fn remember(&self, paths: impl IntoIterator<Item = String>) {
        let mut list = self.0.lock().unwrap_or_else(|e| e.into_inner());
        for p in paths {
            list.retain(|x| x != &p);
            list.push_back(p);
            if list.len() > MAX_REMEMBERED {
                list.pop_front();
            }
        }
    }

    pub fn contains(&self, path: &str) -> bool {
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .iter()
            .any(|p| p == path)
    }
}

/// Program and arguments that show `path` in the file manager of `os` (`std::env::consts::OS`).
pub fn reveal_command(os: &str, path: &Path) -> (String, Vec<String>) {
    let p = path.to_string_lossy().into_owned();
    match os {
        "macos" => ("open".into(), vec!["-R".into(), p]),
        "windows" => ("explorer".into(), vec![format!("/select,{p}")]),
        // Linux & co.: the folder (selecting a file needs D-Bus FileManager1 – not worth it)
        _ => {
            let dir = path
                .parent()
                .map(|d| d.to_string_lossy().into_owned())
                .unwrap_or(p);
            ("xdg-open".into(), vec![dir])
        }
    }
}

/// Shows an exported file in the file manager; `not_found` for a path not exported here.
#[tauri::command]
pub async fn reveal_export(exported: State<'_, Exported>, path: String) -> Result<(), FsError> {
    let p = std::path::PathBuf::from(&path);
    // a file or the folder of a package export (`AppIcon.appiconset`, prompt 078)
    if !exported.contains(&path) || !p.exists() {
        return Err(FsError::new(
            FsErrorCode::NotFound,
            "not an exported file",
            Some(&p),
        ));
    }
    let (program, args) = reveal_command(std::env::consts::OS, &p);
    tauri::async_runtime::spawn_blocking(move || {
        std::process::Command::new(program)
            .args(args)
            .spawn()
            .map(|_| ())
            .map_err(|e| FsError::from_io(&e, &p))
    })
    .await
    .map_err(|e| FsError::new(FsErrorCode::Io, e.to_string(), None))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_exported_paths_are_remembered_and_the_list_is_bounded() {
        let e = Exported::default();
        e.remember(["/out/a.png".to_string(), "/out/b.png".to_string()]);
        assert!(e.contains("/out/a.png"));
        assert!(!e.contains("/etc/passwd"));
        e.remember((0..MAX_REMEMBERED).map(|i| format!("/x/{i}")));
        assert!(!e.contains("/out/a.png"), "oldest dropped");
        assert!(e.contains(&format!("/x/{}", MAX_REMEMBERED - 1)));
    }

    #[test]
    fn file_manager_per_os() {
        let p = Path::new("/out/icon-dark.png");
        assert_eq!(
            reveal_command("macos", p),
            (
                "open".into(),
                vec!["-R".into(), "/out/icon-dark.png".into()]
            )
        );
        assert_eq!(
            reveal_command("windows", p).1,
            vec!["/select,/out/icon-dark.png".to_string()]
        );
        assert_eq!(
            reveal_command("linux", p),
            ("xdg-open".into(), vec!["/out".into()])
        );
    }

    /// Every `#[tauri::command]` in this file is an `async fn` (as `commands::command_rules`).
    #[test]
    fn commands_are_async() {
        let src = include_str!("reveal.rs");
        let n = src
            .lines()
            .zip(src.lines().skip(1))
            .filter(|(a, _)| a.trim() == "#[tauri::command]")
            .inspect(|(_, b)| assert!(b.trim().starts_with("pub async fn"), "{b}"))
            .count();
        assert_eq!(n, 1);
    }
}
