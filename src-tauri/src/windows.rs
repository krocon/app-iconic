//! Document windows (design 003 E8, E10, E11): one document per window, labels `main` and
//! `doc-<n>`. Keeps the start path of a new window, the path each window shows (to bring an
//! already open file to the front instead of opening it twice) and which windows ask the user
//! themselves before they close (`take_over_close` → event `close-requested`).
//! Prompt 005: the action a window runs at start (a menu click while no window was open, design
//! 005 E6) and the quit sequence over all windows (E13).

use std::collections::{HashMap, HashSet, VecDeque};
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

/// What the quit sequence does next (design 005 E13).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QuitStep {
    /// Ask this window (it closes itself, or the user cancels).
    Ask(String),
    /// Every window is gone: exit the app.
    Exit,
    /// Not quitting (cancelled or never started).
    Idle,
}

/// Quit asks the windows one after the other (design 005 E13): the current one closes
/// ([`QuitQueue::closed`]) → the next one; Cancel ([`QuitQueue::cancel`]) ends the sequence.
#[derive(Debug, Default)]
pub struct QuitQueue {
    active: bool,
    queue: VecDeque<String>,
    current: Option<String>,
}

impl QuitQueue {
    /// Starts quitting with these windows; `false` if a sequence is already running.
    pub fn begin(&mut self, labels: impl IntoIterator<Item = String>) -> bool {
        if self.active {
            return false;
        }
        self.active = true;
        self.queue = labels.into_iter().collect();
        self.current = None;
        true
    }

    pub fn active(&self) -> bool {
        self.active
    }

    pub fn current(&self) -> Option<&str> {
        self.current.as_deref()
    }

    /// The next window to ask, or `Exit` when none is left.
    pub fn advance(&mut self) -> QuitStep {
        if !self.active {
            return QuitStep::Idle;
        }
        match self.queue.pop_front() {
            Some(label) => {
                self.current = Some(label.clone());
                QuitStep::Ask(label)
            }
            None => {
                self.active = false;
                self.current = None;
                QuitStep::Exit
            }
        }
    }

    /// The window `label` is gone; `true` if it was the one being asked (→ [`Self::advance`]).
    pub fn closed(&mut self, label: &str) -> bool {
        self.queue.retain(|l| l != label);
        if self.active && self.current.as_deref() == Some(label) {
            self.current = None;
            return true;
        }
        false
    }

    /// The user cancelled: the app stays, the other windows are left alone.
    pub fn cancel(&mut self) {
        self.active = false;
        self.queue.clear();
        self.current = None;
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
    /// label → action the window runs at start (taken once, design 005 E6).
    start_action: HashMap<String, String>,
    /// labels that asked for their start path already (design 030 E5).
    asked: HashSet<String>,
    quit: QuitQueue,
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
        let mut i = self.lock();
        i.asked.insert(label.to_owned());
        i.start.remove(label)
    }

    /**
     * A file for window `label` while it has not asked for its start path yet and has none
     * (design 030 E5: a double click that starts the app opens the file in the first window, no
     * extra empty one). `false`: the window is running – open the file elsewhere.
     */
    pub fn offer_start_path(&self, label: &str, path: String) -> bool {
        let mut i = self.lock();
        if i.asked.contains(label) || i.start.contains_key(label) {
            return false;
        }
        i.start.insert(label.to_owned(), path);
        true
    }

    /// A fresh label whose window runs `action` once it has started.
    pub fn new_label_with_action(&self, action: String) -> String {
        let label = self.new_label(None);
        self.lock().start_action.insert(label.clone(), action);
        label
    }

    pub fn take_start_action(&self, label: &str) -> Option<String> {
        self.lock().start_action.remove(label)
    }

    /// Runs `f` on the quit sequence (one lock for check and change).
    pub fn quit<R>(&self, f: impl FnOnce(&mut QuitQueue) -> R) -> R {
        f(&mut self.lock().quit)
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
        i.start_action.remove(label);
        i.asked.remove(label);
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
    fn a_file_goes_to_a_window_that_has_not_started_yet() {
        let w = DocWindows::default();
        assert!(w.offer_start_path("main", "/a.icon".into()));
        assert!(
            !w.offer_start_path("main", "/b.icon".into()),
            "one start file per window"
        );
        assert_eq!(w.take_start_path("main").as_deref(), Some("/a.icon"));
        assert!(
            !w.offer_start_path("main", "/c.icon".into()),
            "running: elsewhere"
        );
    }

    #[test]
    fn start_actions_are_taken_once() {
        let w = DocWindows::default();
        let a = w.new_label_with_action("file.open".into());
        assert_eq!(w.take_start_path(&a), None);
        assert_eq!(w.take_start_action(&a).as_deref(), Some("file.open"));
        assert_eq!(w.take_start_action(&a), None);
    }

    #[test]
    fn quit_asks_one_window_after_the_other() {
        let mut q = QuitQueue::default();
        assert_eq!(q.advance(), QuitStep::Idle);
        assert!(q.begin(["main".to_string(), "doc-1".into(), "doc-2".into()]));
        assert!(!q.begin(["x".to_string()]), "already quitting");
        assert_eq!(q.advance(), QuitStep::Ask("main".into()));
        // a window closed by hand leaves the queue; it is not the one being asked
        assert!(!q.closed("doc-2"));
        assert!(q.closed("main"));
        assert_eq!(q.advance(), QuitStep::Ask("doc-1".into()));
        assert!(q.closed("doc-1"));
        assert_eq!(q.advance(), QuitStep::Exit);
        assert!(!q.active());
        assert_eq!(q.advance(), QuitStep::Idle);
    }

    #[test]
    fn cancel_stops_quitting() {
        let mut q = QuitQueue::default();
        q.begin(["main".to_string(), "doc-1".into()]);
        assert_eq!(q.advance(), QuitStep::Ask("main".into()));
        q.cancel();
        assert!(!q.active() && q.current().is_none());
        assert!(!q.closed("main"));
        assert_eq!(q.advance(), QuitStep::Idle);
        // a new Quit starts again
        assert!(q.begin(["doc-1".to_string()]));
        assert_eq!(q.advance(), QuitStep::Ask("doc-1".into()));
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
