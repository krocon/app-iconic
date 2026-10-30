//! The native menu bar of macOS (design 005 E6/E7; `apply` taken over from editlicious
//! `src-tauri/src/app_menu.rs`, there from comic-commander design 008 E8). Every window builds its
//! menu model and sends it as a [`MenuSpec`] (checked in `ai-core::menu_spec`); the menu bar shows
//! the spec of the focused window and is rebuilt when the focus moves. A click goes as
//! [`EVENT`] to that window only. With no window open (macOS keeps running) the last spec stays
//! with only window-free items enabled; a click there opens a window that runs the action.
//! Windows/Linux draw the menu in HTML – there specs are only checked and kept.

use crate::windows::DocWindows;
use ai_core::menu_spec::{self, MenuSpec, NoWindow};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Emitter, Manager};

pub const EVENT: &str = "menu-action";

/// Payload of [`EVENT`].
#[derive(Debug, Clone, Serialize)]
pub struct MenuAction {
    pub id: String,
}

#[derive(Default)]
struct Inner {
    specs: HashMap<String, MenuSpec>,
    /// The window that had the focus last (menus and clicks belong to it).
    focused: Option<String>,
    /// The spec of the window closed last (shown while no window is open).
    last: Option<MenuSpec>,
}

/// The menu spec of every window.
#[derive(Default)]
pub struct MenuSpecs(Mutex<Inner>);

impl MenuSpecs {
    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Keeps the spec of `label`; `true` if that window is the focused one (show it now).
    pub fn store(&self, label: &str, spec: MenuSpec) -> bool {
        let mut i = self.lock();
        i.specs.insert(label.to_owned(), spec);
        i.focused.is_none() || i.focused.as_deref() == Some(label)
    }

    /// `label` got the focus; its spec (if it sent one).
    pub fn focus(&self, label: &str) -> Option<MenuSpec> {
        let mut i = self.lock();
        i.focused = Some(label.to_owned());
        i.specs.get(label).cloned()
    }

    pub fn focused(&self) -> Option<String> {
        self.lock().focused.clone()
    }

    /// `label` is gone; the spec to show if no window is left.
    pub fn remove(&self, label: &str) -> Option<MenuSpec> {
        let mut i = self.lock();
        if let Some(spec) = i.specs.remove(label) {
            i.last = Some(spec);
        }
        if i.focused.as_deref() == Some(label) {
            i.focused = None;
        }
        i.last.as_ref().map(menu_spec::without_window)
    }
}

/// The window menu clicks go to: the focused one, else the one focused last, else any.
fn target_window(app: &AppHandle) -> Option<String> {
    let windows = app.webview_windows();
    if let Some((label, _)) = windows
        .iter()
        .find(|(_, w)| w.is_focused().unwrap_or(false))
    {
        return Some(label.clone());
    }
    if let Some(l) = app.state::<MenuSpecs>().focused()
        && windows.contains_key(&l)
    {
        return Some(l);
    }
    let mut labels: Vec<&String> = windows.keys().collect();
    labels.sort();
    labels.first().map(|l| (*l).clone())
}

/// A click in the native menu (design 005 E6, E13).
pub fn route(app: &AppHandle, id: String) {
    if id == "app.quit" {
        crate::menu_commands::begin_quit(app);
        return;
    }
    if !menu_spec::valid_id(&id) {
        return;
    }
    if let Some(label) = target_window(app) {
        let _ = app.emit_to(label.as_str(), EVENT, MenuAction { id });
        return;
    }
    let docs = app.state::<DocWindows>();
    let label = match menu_spec::no_window_action(&id) {
        NoWindow::OpenWindow => docs.new_label(None),
        NoWindow::OpenWindowThen(action) => docs.new_label_with_action(action),
        NoWindow::Ignore => return,
    };
    let _ = crate::window_commands::build_document_window(app, &label);
}

/// Window events that change the menu (macOS: rebuild on the main thread – window events are
/// delivered there).
pub fn on_focus(app: &AppHandle, label: &str) {
    if let Some(spec) = app.state::<MenuSpecs>().focus(label)
        && cfg!(target_os = "macos")
    {
        let _ = apply(app, &spec);
    }
}

pub fn on_destroyed(app: &AppHandle, label: &str) {
    let rest = app.state::<MenuSpecs>().remove(label);
    let others = app.webview_windows().keys().any(|l| l != label);
    if !others
        && let Some(spec) = rest
        && cfg!(target_os = "macos")
    {
        let _ = apply(app, &spec);
    }
}

/// Builds and sets the native menu (macOS). Compiled on every OS, so that a Linux build checks it
/// too (called on macOS only).
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn apply(app: &AppHandle, spec: &MenuSpec) -> tauri::Result<()> {
    use ai_core::menu_spec::{MenuItemSpec, Predefined, accelerator, predefined};
    use tauri::menu::{
        CheckMenuItemBuilder, IsMenuItem, MenuBuilder, MenuItemBuilder, PredefinedMenuItem,
        Submenu, SubmenuBuilder,
    };
    fn items<'m>(
        app: &'m AppHandle,
        list: &[MenuItemSpec],
        b: SubmenuBuilder<'m, tauri::Wry, AppHandle>,
    ) -> tauri::Result<SubmenuBuilder<'m, tauri::Wry, AppHandle>> {
        let mut b = b;
        for item in list {
            b = match item {
                MenuItemSpec::Separator => b.separator(),
                // Cocoa's selectors reach the WebView: copy/paste in text fields (design 005 E7)
                MenuItemSpec::Action { id, label, .. } if predefined(id).is_some() => {
                    let l = Some(label.as_str());
                    let p = match predefined(id) {
                        Some(Predefined::Cut) => PredefinedMenuItem::cut(app, l)?,
                        Some(Predefined::Copy) => PredefinedMenuItem::copy(app, l)?,
                        Some(Predefined::Paste) => PredefinedMenuItem::paste(app, l)?,
                        _ => PredefinedMenuItem::select_all(app, l)?,
                    };
                    b.item(&p)
                }
                MenuItemSpec::Action {
                    id,
                    label,
                    accelerator: acc,
                    enabled,
                    checked,
                } => {
                    let acc = acc.as_deref().and_then(accelerator);
                    match checked {
                        Some(c) => {
                            let mut i = CheckMenuItemBuilder::with_id(id.as_str(), label)
                                .enabled(*enabled)
                                .checked(*c);
                            if let Some(a) = acc {
                                i = i.accelerator(a);
                            }
                            b.item(&i.build(app)?)
                        }
                        None => {
                            let mut i =
                                MenuItemBuilder::with_id(id.as_str(), label).enabled(*enabled);
                            if let Some(a) = acc {
                                i = i.accelerator(a);
                            }
                            b.item(&i.build(app)?)
                        }
                    }
                }
                MenuItemSpec::Submenu { label, items: sub } => {
                    let s: Submenu<tauri::Wry> =
                        items(app, sub, SubmenuBuilder::new(app, label))?.build()?;
                    b.item(&s)
                }
            };
        }
        Ok(b)
    }
    // texts in the UI language (design 015 E14); Settings… opens the dialog of the window in front
    let t = spec.app.clone().unwrap_or_default();
    let mut settings = MenuItemBuilder::with_id("app.settings", &t.settings);
    if let Some(a) = t.settings_accelerator.as_deref().and_then(accelerator) {
        settings = settings.accelerator(a);
    }
    let app_menu = SubmenuBuilder::new(app, app.package_info().name.clone())
        .item(&MenuItemBuilder::with_id("app.about", &t.about).build(app)?)
        .separator()
        .item(&settings.build(app)?)
        .separator()
        .item(&PredefinedMenuItem::services(app, Some(&t.services))?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some(&t.hide))?)
        .item(&PredefinedMenuItem::hide_others(app, Some(&t.hide_others))?)
        .item(&PredefinedMenuItem::show_all(app, Some(&t.show_all))?)
        .separator()
        .item(
            &MenuItemBuilder::with_id("app.quit", &t.quit)
                .accelerator("CmdOrCtrl+Q")
                .build(app)?,
        )
        .build()?;
    // no predefined "Close Window" (⌘W is our File › Close, which asks about unsaved changes)
    let window = SubmenuBuilder::new(app, &t.window)
        .item(&PredefinedMenuItem::minimize(app, Some(&t.minimize))?)
        .item(&PredefinedMenuItem::maximize(app, Some(&t.maximize))?)
        .build()?;
    let mut tops: Vec<Submenu<tauri::Wry>> = Vec::new();
    for m in &spec.menus {
        tops.push(items(app, &m.items, SubmenuBuilder::new(app, &m.label))?.build()?);
    }
    // our menus after the app menu; Edit is ours too – Undo/Redo run document actions, a
    // predefined Edit menu would also undo in the WebView (editlicious design 005 E3)
    let mut all: Vec<&dyn IsMenuItem<tauri::Wry>> = vec![&app_menu];
    for t in &tops {
        all.push(t);
    }
    all.push(&window);
    let menu = MenuBuilder::new(app).items(&all).build()?;
    app.set_menu(menu)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ai_core::menu_spec::{MenuItemSpec, TopMenu};

    fn spec(id: &str) -> MenuSpec {
        MenuSpec {
            menus: vec![TopMenu {
                label: "File".into(),
                items: vec![MenuItemSpec::Action {
                    id: id.into(),
                    label: "x".into(),
                    accelerator: None,
                    enabled: true,
                    checked: None,
                }],
            }],
            app: None,
        }
    }

    #[test]
    fn the_focused_window_owns_the_menu() {
        let m = MenuSpecs::default();
        assert!(m.store("main", spec("file.save")), "nothing focused yet");
        assert_eq!(m.focus("main"), Some(spec("file.save")));
        assert!(!m.store("doc-1", spec("file.open")), "doc-1 is in the back");
        assert_eq!(m.focus("doc-1"), Some(spec("file.open")));
        assert_eq!(m.focused().as_deref(), Some("doc-1"));
        assert!(m.store("doc-1", spec("file.close")));
    }

    #[test]
    fn without_windows_the_last_spec_stays_with_window_free_items() {
        let m = MenuSpecs::default();
        m.store("main", spec("file.save"));
        m.focus("main");
        let rest = m.remove("main").unwrap();
        let MenuItemSpec::Action { enabled, .. } = &rest.menus[0].items[0] else {
            panic!("action expected")
        };
        assert!(!enabled, "Save needs a window");
        assert_eq!(m.focused(), None);
        m.store("doc-1", spec("file.open"));
        let rest = m.remove("doc-1").unwrap();
        let MenuItemSpec::Action { enabled, .. } = &rest.menus[0].items[0] else {
            panic!("action expected")
        };
        assert!(enabled, "Open works without a window");
    }
}
