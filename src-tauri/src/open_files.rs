//! Files handed to the app by the system (design 030 E5): the command line of the first start,
//! a second start on Windows/Linux (`tauri-plugin-single-instance`) and the Finder on macOS
//! (`RunEvent::Opened`). After editlicious `commands::paths_from_args` / `files_opened` (design
//! 012 E3, MIT, same author), here for `.icon` documents that open in document windows.

use crate::commands::{build_document_window, focus};
use crate::windows::DocWindows;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// The first window of the app (`tauri.conf.json`).
pub const MAIN_LABEL: &str = "main";

/// A `.icon` document: a bundle folder (macOS) or a ZIP file with that extension.
fn is_icon(p: &Path) -> bool {
    p.extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("icon"))
        && p.exists()
}

/// The `.icon` paths of command line arguments (without the program): options left out, relative
/// paths against `cwd` (dropped without one), only existing documents.
pub fn paths_from_args(args: impl IntoIterator<Item = String>, cwd: Option<&Path>) -> Vec<String> {
    args.into_iter()
        .filter(|a| !a.starts_with('-'))
        .filter_map(|a| {
            let p = PathBuf::from(&a);
            let p = if p.is_absolute() { p } else { cwd?.join(p) };
            is_icon(&p).then(|| p.to_string_lossy().into_owned())
        })
        .collect()
}

/// Opens `paths`: the first window takes the first one while it is still starting, a file shown
/// somewhere comes to the front, every other one gets a new document window.
pub fn open_paths(app: &AppHandle, paths: Vec<String>) {
    let windows = app.state::<DocWindows>();
    for path in paths {
        if let Some(label) = windows.showing(&path, None)
            && focus(app, &label)
        {
            continue;
        }
        if app.get_webview_window(MAIN_LABEL).is_some()
            && windows.offer_start_path(MAIN_LABEL, path.clone())
        {
            continue;
        }
        let label = windows.new_label(Some(path));
        let _ = build_document_window(app, &label);
    }
}

/// A second start without files: the front window comes forward.
pub fn bring_to_front(app: &AppHandle) {
    if let Some(w) = app.webview_windows().values().next() {
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_existing_icon_documents_only() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("bundle.icon")).unwrap();
        std::fs::write(dir.path().join("zip.ICON"), "PK").unwrap();
        std::fs::write(dir.path().join("x.svg"), "<svg/>").unwrap();
        let abs = dir.path().join("zip.ICON").to_string_lossy().into_owned();
        let got = paths_from_args(
            [
                "-psn_0_1".into(),
                "--flag".into(),
                "bundle.icon".into(),
                "x.svg".into(),
                "missing.icon".into(),
                abs.clone(),
            ],
            Some(dir.path()),
        );
        let bundle = dir
            .path()
            .join("bundle.icon")
            .to_string_lossy()
            .into_owned();
        assert_eq!(got, vec![bundle, abs]);
        assert!(paths_from_args(["bundle.icon".to_string()], None).is_empty());
    }
}
