//! Document windows (design 003 E8, E10, E11): one document per window, labels `main` and
//! `doc-<n>`. Keeps the start path of a new window, the path each window shows (to bring an
//! already open file to the front instead of opening it twice) and which windows ask the user
//! themselves before they close (`take_over_close` → event `close-requested`).

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, MutexGuard};

/// Event sent to a window whose close button was pressed after `take_over_close`.
pub const CLOSE_REQUESTED: &str = "close-requested";

/// The title of a window: macOS marks unsaved changes in the close button
/// (`setDocumentEdited:`), the other systems get `• ` in front of the name.
pub fn window_title(title: &str, edited: bool, mac: bool) -> String {
    let title: String = title.chars().take(300).collect();
    if edited && !mac {
        format!("• {title}")
    } else {
        title
    }
}

#[derive(Default)]
struct Inner {
    /// label → path the window opens at start (taken once).
    start: HashMap<String, String>,
    /// label → path the window shows (reported with the title).
    shows: HashMap<String, String>,
    /// labels whose close button asks the frontend first.
    takes_close: HashSet<String>,
}

#[derive(Default)]
pub struct DocWindows {
    next: AtomicU32,
    inner: Mutex<Inner>,
}

impl DocWindows {
    fn lock(&self) -> MutexGuard<'_, Inner> {
        // only inserts/removes – a panic while holding the lock leaves consistent maps
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// A fresh label `doc-<n>`; `path` is handed to that window by [`Self::take_start_path`].
    pub fn new_label(&self, path: Option<String>) -> String {
        let label = format!("doc-{}", self.next.fetch_add(1, Ordering::Relaxed) + 1);
        if let Some(p) = path {
            self.lock().start.insert(label.clone(), p);
        }
        label
    }

    pub fn take_start_path(&self, label: &str) -> Option<String> {
        self.lock().start.remove(label)
    }

    /// The window `label` now shows `path` (`None`: an unsaved document).
    pub fn set_shows(&self, label: &str, path: Option<String>) {
        let mut i = self.lock();
        match path {
            Some(p) => i.shows.insert(label.to_owned(), p),
            None => i.shows.remove(label),
        };
    }

    /// The window (other than `except`) that shows `path`.
    pub fn showing(&self, path: &str, except: Option<&str>) -> Option<String> {
        let i = self.lock();
        let mut labels: Vec<&String> = i
            .shows
            .iter()
            .filter(|(l, p)| p.as_str() == path && Some(l.as_str()) != except)
            .map(|(l, _)| l)
            .collect();
        labels.sort();
        labels.first().map(|l| (*l).clone())
    }

    pub fn take_over_close(&self, label: &str) {
        self.lock().takes_close.insert(label.to_owned());
    }

    pub fn takes_close(&self, label: &str) -> bool {
        self.lock().takes_close.contains(label)
    }

    /// Forgets a destroyed window.
    pub fn forget(&self, label: &str) {
        let mut i = self.lock();
        i.start.remove(label);
        i.shows.remove(label);
        i.takes_close.remove(label);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn titles_mark_unsaved_changes() {
        assert_eq!(window_title("a.icon", false, false), "a.icon");
        assert_eq!(window_title("a.icon", true, false), "• a.icon");
        assert_eq!(window_title("a.icon", true, true), "a.icon");
        assert_eq!(window_title(&"x".repeat(500), false, false).len(), 300);
    }

    #[test]
    fn labels_and_start_paths() {
        let w = DocWindows::default();
        let a = w.new_label(Some("/a.icon".into()));
        let b = w.new_label(None);
        assert_eq!((a.as_str(), b.as_str()), ("doc-1", "doc-2"));
        assert_eq!(w.take_start_path(&a).as_deref(), Some("/a.icon"));
        assert_eq!(w.take_start_path(&a), None, "only once");
        assert_eq!(w.take_start_path(&b), None);
    }

    #[test]
    fn finds_the_window_showing_a_path() {
        let w = DocWindows::default();
        w.set_shows("main", Some("/a.icon".into()));
        w.set_shows("doc-1", Some("/b.icon".into()));
        assert_eq!(w.showing("/a.icon", None).as_deref(), Some("main"));
        assert_eq!(w.showing("/a.icon", Some("main")), None);
        w.set_shows("main", None);
        assert_eq!(w.showing("/a.icon", None), None);
        w.forget("doc-1");
        assert_eq!(w.showing("/b.icon", None), None);
    }

    #[test]
    fn close_takeover_per_window() {
        let w = DocWindows::default();
        assert!(!w.takes_close("main"));
        w.take_over_close("main");
        assert!(w.takes_close("main") && !w.takes_close("doc-1"));
        w.forget("main");
        assert!(!w.takes_close("main"));
    }
}
