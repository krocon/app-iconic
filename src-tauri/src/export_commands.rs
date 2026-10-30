//! Export commands (prompt 012): thin layer over `ai_core::export`, every command `async`, the
//! work in `spawn_blocking`. One cancel flag per window (design 012 E12).

use crate::commands::{blocking, file_path, to_string};
use crate::error::FsError;
use crate::reveal::Exported;
use ai_core::export::{
    ExportOptions, ExportProgress, ExportReport, Variant, files, fonts::system_fonts,
};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

/// The running PNG export of each window (label → cancel flag).
#[derive(Default)]
pub struct ExportJobs(Mutex<HashMap<String, Arc<AtomicBool>>>);

impl ExportJobs {
    fn start(&self, label: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        let mut jobs = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(old) = jobs.insert(label.to_string(), flag.clone()) {
            old.store(true, Ordering::SeqCst);
        }
        flag
    }

    fn finish(&self, label: &str, flag: &Arc<AtomicBool>) {
        let mut jobs = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if jobs.get(label).is_some_and(|f| Arc::ptr_eq(f, flag)) {
            jobs.remove(label);
        }
    }

    fn cancel(&self, label: &str) {
        if let Some(f) = self.0.lock().unwrap_or_else(|e| e.into_inner()).get(label) {
            f.store(true, Ordering::SeqCst);
        }
    }
}

/// Native folder dialog for the export target; `None` = cancelled.
#[tauri::command]
pub async fn pick_export_dir(app: AppHandle) -> Result<Option<String>, FsError> {
    blocking(move || {
        Ok(app
            .dialog()
            .file()
            .blocking_pick_folder()
            .and_then(to_string))
    })
    .await
}

/// Writes the SVG of every appearance as `<name>-<appearance>.svg` into `target_dir`.
#[tauri::command]
pub async fn export_svg(
    exported: State<'_, Exported>,
    variants: Vec<Variant>,
    target_dir: String,
    options: ExportOptions,
) -> Result<ExportReport, FsError> {
    let dir = file_path(&target_dir)?;
    let report = blocking(move || files::export_svg(&variants, &dir, &options)).await?;
    exported.remember(report.files.iter().map(|f| f.path.clone()));
    Ok(report)
}

/// Renders every appearance in every size with resvg; progress per file over `on_progress`.
#[tauri::command]
pub async fn export_png(
    window: WebviewWindow,
    jobs: State<'_, ExportJobs>,
    variants: Vec<Variant>,
    sizes: Vec<u32>,
    target_dir: String,
    options: ExportOptions,
    on_progress: Channel<ExportProgress>,
) -> Result<ExportReport, FsError> {
    let dir = file_path(&target_dir)?;
    let label = window.label().to_string();
    let flag = jobs.start(&label);
    let cancel = flag.clone();
    let result = blocking(move || {
        files::export_png(
            &variants,
            &sizes,
            &dir,
            &options,
            system_fonts(),
            &cancel,
            |p| {
                let _ = on_progress.send(p);
            },
        )
    })
    .await;
    jobs.finish(&label, &flag);
    if let Ok(report) = &result {
        use tauri::Manager;
        window
            .app_handle()
            .state::<Exported>()
            .remember(report.files.iter().map(|f| f.path.clone()));
    }
    result
}

/// The colour of the composed icon at a document point (prompt 074 E3: the eyedropper on images
/// and gradients), `#RRGGBBAA`.
#[tauri::command]
pub async fn pick_color(svg: String, x: f64, y: f64) -> Result<String, FsError> {
    blocking(move || ai_core::export::png::pick_pixel(&svg, x, y, system_fonts())).await
}

/// Stops the PNG export of the calling window after the current file.
#[tauri::command]
pub async fn cancel_export(
    window: WebviewWindow,
    jobs: State<'_, ExportJobs>,
) -> Result<(), FsError> {
    jobs.cancel(window.label());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jobs_cancel_per_window_and_a_new_job_cancels_the_old_one() {
        let jobs = ExportJobs::default();
        let a = jobs.start("main");
        let b = jobs.start("doc-1");
        jobs.cancel("doc-1");
        assert!(!a.load(Ordering::SeqCst));
        assert!(b.load(Ordering::SeqCst));
        let a2 = jobs.start("main");
        assert!(a.load(Ordering::SeqCst));
        jobs.finish("main", &a);
        jobs.cancel("main");
        assert!(
            a2.load(Ordering::SeqCst),
            "finishing the old job keeps the new one"
        );
        jobs.finish("main", &a2);
        assert!(jobs.0.lock().unwrap().get("main").is_none());
    }

    /// Every `#[tauri::command]` in this file is an `async fn` (as `commands::command_rules`).
    #[test]
    fn commands_are_async() {
        let src = include_str!("export_commands.rs");
        let mut lines = src.lines();
        let mut count = 0;
        while let Some(line) = lines.next() {
            if line.trim() == "#[tauri::command]" {
                let next = lines.next().unwrap_or_default().trim();
                assert!(
                    next.starts_with("pub async fn"),
                    "synchronous command: {next}"
                );
                count += 1;
            }
        }
        assert_eq!(count, 5);
    }
}
