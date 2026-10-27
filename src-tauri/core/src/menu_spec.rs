//! Übernommen aus editlicious `src-tauri/src/app_menu.rs` (Prompt 005, dort aus comic-commander
//! Design 008 E8) – ohne Tauri, damit der Engine-Job der CI die Prüfungen testet.
//!
//! The menu model the frontend builds (`features/menus/menu-model.ts`) arrives as a [`MenuSpec`];
//! it is checked strictly here (sizes, depth, ids, texts) before the app turns it into the native
//! macOS menu (`app_menu.rs`). Shortcuts become accelerators only with a modifier or as F keys –
//! a plain key in a menu would be caught before the WebView. New for AppIconic (design 005
//! E6/E7): Cut/Copy/Paste/Select All are predefined items, and a menu without any window.

use crate::error::{FsError, FsErrorCode};
use serde::{Deserialize, Serialize};

pub const MAX_MENUS: usize = 12;
pub const MAX_ITEMS: usize = 400;
pub const MAX_DEPTH: usize = 3;
pub const MAX_LABEL: usize = 120;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MenuItemSpec {
    Action {
        id: String,
        label: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        accelerator: Option<String>,
        #[serde(default = "yes")]
        enabled: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        checked: Option<bool>,
    },
    Separator,
    Submenu {
        label: String,
        items: Vec<MenuItemSpec>,
    },
}

fn yes() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct TopMenu {
    pub label: String,
    pub items: Vec<MenuItemSpec>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct MenuSpec {
    pub menus: Vec<TopMenu>,
    /// Texts of the macOS app and Window menus in the UI language (design 015 E14); missing =
    /// English.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app: Option<AppMenuSpec>,
}

/// The texts of the menus Rust adds on macOS (app menu, Window) – the frontend translates them.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppMenuSpec {
    pub about: String,
    pub settings: String,
    /// Shortcut of Settings… (our chord notation, e.g. `Mod+,`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub settings_accelerator: Option<String>,
    pub services: String,
    pub hide: String,
    pub hide_others: String,
    pub show_all: String,
    pub quit: String,
    pub window: String,
    pub minimize: String,
    pub maximize: String,
}

impl Default for AppMenuSpec {
    fn default() -> Self {
        Self {
            about: "About AppIconic".into(),
            settings: "Settings…".into(),
            settings_accelerator: Some("Mod+,".into()),
            services: "Services".into(),
            hide: "Hide AppIconic".into(),
            hide_others: "Hide Others".into(),
            show_all: "Show All".into(),
            quit: "Quit AppIconic".into(),
            window: "Window".into(),
            minimize: "Minimize".into(),
            maximize: "Zoom".into(),
        }
    }
}

impl AppMenuSpec {
    fn labels(&self) -> [&str; 10] {
        [
            &self.about,
            &self.settings,
            &self.services,
            &self.hide,
            &self.hide_others,
            &self.show_all,
            &self.quit,
            &self.window,
            &self.minimize,
            &self.maximize,
        ]
    }
}

fn invalid(message: impl Into<String>) -> FsError {
    FsError::new(FsErrorCode::InvalidMenu, message, None)
}

/// An action id: `^[a-z][A-Za-z0-9.]{0,63}$` (same rule as the action catalogue).
pub fn valid_id(id: &str) -> bool {
    let mut chars = id.chars();
    id.len() <= 64
        && chars.next().is_some_and(|c| c.is_ascii_lowercase())
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '.')
}

fn valid_label(label: &str) -> bool {
    !label.trim().is_empty()
        && label.chars().count() <= MAX_LABEL
        && !label.chars().any(char::is_control)
}

/// Checks the whole spec; the first problem is the error.
pub fn validate(spec: &MenuSpec) -> Result<(), FsError> {
    if spec.menus.len() > MAX_MENUS {
        return Err(invalid("too many menus"));
    }
    fn walk(items: &[MenuItemSpec], depth: usize, count: &mut usize) -> Result<(), FsError> {
        if depth > MAX_DEPTH {
            return Err(invalid("menus nested too deeply"));
        }
        for item in items {
            *count += 1;
            if *count > MAX_ITEMS {
                return Err(invalid("too many menu items"));
            }
            match item {
                MenuItemSpec::Action { id, label, .. } => {
                    if !valid_id(id) {
                        return Err(invalid(format!("bad action id {id:?}")));
                    }
                    if !valid_label(label) {
                        return Err(invalid("bad menu text"));
                    }
                }
                MenuItemSpec::Separator => {}
                MenuItemSpec::Submenu { label, items } => {
                    if !valid_label(label) {
                        return Err(invalid("bad menu text"));
                    }
                    walk(items, depth + 1, count)?;
                }
            }
        }
        Ok(())
    }
    if let Some(app) = &spec.app
        && !app.labels().iter().all(|l| valid_label(l))
    {
        return Err(invalid("bad menu text"));
    }
    let mut count = 0usize;
    for m in &spec.menus {
        if !valid_label(&m.label) {
            return Err(invalid("bad menu text"));
        }
        walk(&m.items, 1, &mut count)?;
    }
    Ok(())
}

/// Our chord notation (`Mod+Shift+p`, design 005 E2) as a Tauri accelerator, `None` when the
/// chord has no modifier and is no F key, or uses a key the menu cannot show.
pub fn accelerator(chord: &str) -> Option<String> {
    let (mods, key) = split_chord(chord)?;
    let mut out: Vec<String> = Vec::new();
    for m in &mods {
        out.push(
            match *m {
                "Mod" => "CmdOrCtrl",
                "Ctrl" => "Control",
                "Alt" => "Alt",
                "Shift" => "Shift",
                _ => return None,
            }
            .into(),
        );
    }
    let is_f = key.len() <= 3
        && key.starts_with('F')
        && key[1..].parse::<u8>().is_ok_and(|n| (1..=24).contains(&n));
    if mods.is_empty() && !is_f {
        return None;
    }
    let k = if key.chars().count() == 1 {
        let c = key.chars().next()?;
        if c.is_ascii_alphanumeric() {
            c.to_ascii_uppercase().to_string()
        } else {
            match c {
                ',' | '.' | '-' | '=' | '[' | ']' | '/' | ';' | '\'' | '`' | '\\' => c.to_string(),
                _ => return None,
            }
        }
    } else if is_f
        || matches!(
            key,
            "ArrowUp"
                | "ArrowDown"
                | "ArrowLeft"
                | "ArrowRight"
                | "Home"
                | "End"
                | "PageUp"
                | "PageDown"
                | "Enter"
                | "Escape"
                | "Space"
                | "Tab"
                | "Backspace"
                | "Delete"
        )
    {
        key.to_string()
    } else {
        return None;
    };
    out.push(k);
    Some(out.join("+"))
}

/// `Mod+Shift+P` → (["Mod", "Shift"], "P"); `Mod++` → (["Mod"], "+").
pub fn split_chord(chord: &str) -> Option<(Vec<&str>, &str)> {
    if chord.is_empty() || chord.len() > 40 || chord.chars().any(char::is_control) {
        return None;
    }
    let (head, key) = if let Some(h) = chord.strip_suffix("++") {
        (h, "+")
    } else if chord == "+" {
        ("", "+")
    } else {
        match chord.rsplit_once('+') {
            Some((h, k)) => (h, k),
            None => ("", chord),
        }
    };
    if key.is_empty() {
        return None;
    }
    let mods: Vec<&str> = if head.is_empty() {
        Vec::new()
    } else {
        head.split('+').collect()
    };
    let order = ["Mod", "Ctrl", "Alt", "Shift", "Meta"];
    let mut last = None;
    for m in &mods {
        let i = order.iter().position(|o| o == m)?;
        if last.is_some_and(|l| i <= l) {
            return None;
        }
        last = Some(i);
    }
    Some((mods, key))
}

/// Edit items that become predefined (Cocoa) items on macOS (design 005 E7): their selectors go
/// to the WebView, so copy and paste work in text fields and reach the page as DOM events.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Predefined {
    Cut,
    Copy,
    Paste,
    SelectAll,
}

pub fn predefined(id: &str) -> Option<Predefined> {
    match id {
        "edit.cut" => Some(Predefined::Cut),
        "edit.copy" => Some(Predefined::Copy),
        "edit.paste" => Some(Predefined::Paste),
        "edit.selectAll" => Some(Predefined::SelectAll),
        _ => None,
    }
}

/// Actions that make sense without any window (macOS keeps running, design 003 E10).
pub fn works_without_window(id: &str) -> bool {
    matches!(
        id,
        "file.new"
            | "file.newWindow"
            | "file.open"
            | "app.about"
            | "app.settings"
            | "app.shortcuts"
            | "app.quit"
    ) || id.starts_with("file.recent.")
}

/// The last window's menu while no window is open: only what works without one stays enabled.
pub fn without_window(spec: &MenuSpec) -> MenuSpec {
    fn items(list: &[MenuItemSpec]) -> Vec<MenuItemSpec> {
        list.iter()
            .map(|i| match i {
                MenuItemSpec::Action {
                    id,
                    label,
                    accelerator,
                    enabled,
                    checked,
                } => MenuItemSpec::Action {
                    id: id.clone(),
                    label: label.clone(),
                    accelerator: accelerator.clone(),
                    enabled: *enabled && works_without_window(id),
                    checked: *checked,
                },
                MenuItemSpec::Separator => MenuItemSpec::Separator,
                MenuItemSpec::Submenu { label, items: sub } => MenuItemSpec::Submenu {
                    label: label.clone(),
                    items: items(sub),
                },
            })
            .collect()
    }
    MenuSpec {
        menus: spec
            .menus
            .iter()
            .map(|m| TopMenu {
                label: m.label.clone(),
                items: items(&m.items),
            })
            .collect(),
        app: spec.app.clone(),
    }
}

/// What a menu click does while no window is open (design 005 E6).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NoWindow {
    /// A new document window is the whole action (New, New Window).
    OpenWindow,
    /// A new window, which then runs the action (Open…, Open Recent, About …).
    OpenWindowThen(String),
    Ignore,
}

pub fn no_window_action(id: &str) -> NoWindow {
    match id {
        "file.new" | "file.newWindow" => NoWindow::OpenWindow,
        _ if valid_id(id) && works_without_window(id) && id != "app.quit" => {
            NoWindow::OpenWindowThen(id.to_owned())
        }
        _ => NoWindow::Ignore,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn action(id: &str, acc: Option<&str>) -> MenuItemSpec {
        MenuItemSpec::Action {
            id: id.into(),
            label: "Lesen ä".into(),
            accelerator: acc.map(Into::into),
            enabled: true,
            checked: None,
        }
    }

    fn spec(items: Vec<MenuItemSpec>) -> MenuSpec {
        MenuSpec {
            menus: vec![TopMenu {
                label: "File".into(),
                items,
            }],
            app: None,
        }
    }

    #[test]
    fn accelerators_only_for_chords_with_modifiers_or_f_keys() {
        assert_eq!(
            accelerator("Mod+Shift+p").as_deref(),
            Some("CmdOrCtrl+Shift+P")
        );
        assert_eq!(accelerator("Mod+1").as_deref(), Some("CmdOrCtrl+1"));
        assert_eq!(accelerator("Mod+0").as_deref(), Some("CmdOrCtrl+0"));
        assert_eq!(accelerator("Mod+/").as_deref(), Some("CmdOrCtrl+/"));
        assert_eq!(accelerator("Mod+=").as_deref(), Some("CmdOrCtrl+="));
        assert_eq!(accelerator("Mod+-").as_deref(), Some("CmdOrCtrl+-"));
        assert_eq!(
            accelerator("Mod+Shift+ArrowUp").as_deref(),
            Some("CmdOrCtrl+Shift+ArrowUp")
        );
        assert_eq!(
            accelerator("Mod+Ctrl+f").as_deref(),
            Some("CmdOrCtrl+Control+F")
        );
        assert_eq!(accelerator("F10").as_deref(), Some("F10"));
        // plain keys would be caught by the menu before the WebView
        assert_eq!(accelerator("Delete"), None);
        assert_eq!(accelerator("Backspace"), None);
        assert_eq!(accelerator("Escape"), None);
        assert_eq!(accelerator("Space"), None);
        assert_eq!(accelerator("i"), None);
        // what the menu cannot show
        assert_eq!(accelerator("Mod++"), None);
        assert_eq!(accelerator("Mod+}"), None);
        assert_eq!(accelerator("Meta+x"), None);
        assert_eq!(accelerator("Mod+Unidentified"), None);
        assert_eq!(accelerator("Shift+Mod+p"), None);
        assert_eq!(accelerator("F25"), None);
        assert_eq!(accelerator(""), None);
        assert_eq!(accelerator("Mod+a\u{0}"), None);
    }

    #[test]
    fn chords_split_with_a_plus_key() {
        assert_eq!(split_chord("Mod++"), Some((vec!["Mod"], "+")));
        assert_eq!(split_chord("+"), Some((vec![], "+")));
        assert_eq!(
            split_chord("Mod+Shift+F10"),
            Some((vec!["Mod", "Shift"], "F10"))
        );
        assert_eq!(split_chord("Hyper+x"), None);
        assert_eq!(split_chord("Mod+"), None);
        assert_eq!(split_chord("Mod+Mod+x"), None);
        assert_eq!(split_chord(&"Mod+".repeat(20)), None);
    }

    #[test]
    fn spec_is_checked_strictly() {
        let ok = spec(vec![
            action("file.open", Some("Mod+o")),
            MenuItemSpec::Separator,
            MenuItemSpec::Submenu {
                label: "Open Recent".into(),
                items: vec![action("file.recent.1", None)],
            },
        ]);
        assert!(validate(&ok).is_ok());
        let json = r#"{"menus":[{"label":"File","items":[{"kind":"action","id":"app.quit","label":"Quit","accelerator":"Mod+q"},{"kind":"separator"}]}]}"#;
        assert!(validate(&serde_json::from_str::<MenuSpec>(json).unwrap()).is_ok());
        // hostile input
        for bad_id in ["../evil", "File.open", "", "a b", "a-b", &"a".repeat(65)] {
            assert_eq!(
                validate(&spec(vec![action(bad_id, None)]))
                    .unwrap_err()
                    .code,
                FsErrorCode::InvalidMenu,
                "{bad_id}"
            );
        }
        let mut deep = action("a", None);
        for _ in 0..4 {
            deep = MenuItemSpec::Submenu {
                label: "s".into(),
                items: vec![deep],
            };
        }
        assert!(validate(&spec(vec![deep])).is_err());
        let many = spec((0..=MAX_ITEMS).map(|_| MenuItemSpec::Separator).collect());
        assert!(validate(&many).is_err());
        let menus = MenuSpec {
            menus: (0..=MAX_MENUS)
                .map(|_| TopMenu {
                    label: "x".into(),
                    items: vec![],
                })
                .collect(),
            app: None,
        };
        assert!(validate(&menus).is_err());
        // the texts of the app menu are checked too (design 015 E14)
        let mut app = spec(vec![]);
        app.app = Some(AppMenuSpec::default());
        assert!(validate(&app).is_ok());
        app.app.as_mut().unwrap().quit = " ".into();
        assert!(validate(&app).is_err());
        assert!(works_without_window("app.settings"));
        for label in ["a\u{0}b", "   ", "", &"x".repeat(MAX_LABEL + 1), "a\nb"] {
            let s = MenuSpec {
                menus: vec![TopMenu {
                    label: label.into(),
                    items: vec![],
                }],
                app: None,
            };
            assert!(validate(&s).is_err(), "{label:?}");
        }
        let long_item = spec(vec![MenuItemSpec::Action {
            id: "file.open".into(),
            label: "x".repeat(MAX_LABEL + 1),
            accelerator: None,
            enabled: true,
            checked: None,
        }]);
        assert!(validate(&long_item).is_err());
        // unknown kinds and missing fields do not even parse
        assert!(
            serde_json::from_str::<MenuSpec>(
                r#"{"menus":[{"label":"x","items":[{"kind":"script"}]}]}"#
            )
            .is_err()
        );
        assert!(serde_json::from_str::<MenuSpec>(r#"{"menus":[{"label":"x"}]}"#).is_err());
        assert!(valid_id("file.recent.10"));
    }

    #[test]
    fn edit_items_of_the_webview_are_predefined() {
        assert_eq!(predefined("edit.copy"), Some(Predefined::Copy));
        assert_eq!(predefined("edit.selectAll"), Some(Predefined::SelectAll));
        assert_eq!(predefined("edit.undo"), None);
        assert_eq!(predefined("edit.duplicate"), None);
    }

    #[test]
    fn without_a_window_only_window_free_actions_stay_enabled() {
        let s = spec(vec![
            action("file.open", Some("Mod+o")),
            action("file.save", Some("Mod+s")),
            MenuItemSpec::Submenu {
                label: "Open Recent".into(),
                items: vec![
                    action("file.recent.1", None),
                    action("file.clearRecent", None),
                ],
            },
        ]);
        let enabled: Vec<(String, bool)> = fn_flat(&without_window(&s).menus[0].items);
        assert_eq!(
            enabled,
            [
                ("file.open".to_string(), true),
                ("file.save".to_string(), false),
                ("file.recent.1".to_string(), true),
                ("file.clearRecent".to_string(), false),
            ]
        );
        assert_eq!(no_window_action("file.new"), NoWindow::OpenWindow);
        assert_eq!(no_window_action("file.newWindow"), NoWindow::OpenWindow);
        assert_eq!(
            no_window_action("file.open"),
            NoWindow::OpenWindowThen("file.open".into())
        );
        assert_eq!(
            no_window_action("file.recent.3"),
            NoWindow::OpenWindowThen("file.recent.3".into())
        );
        assert_eq!(no_window_action("file.save"), NoWindow::Ignore);
        assert_eq!(no_window_action("app.quit"), NoWindow::Ignore);
        assert_eq!(no_window_action("file.recent.../x"), NoWindow::Ignore);
    }

    fn fn_flat(items: &[MenuItemSpec]) -> Vec<(String, bool)> {
        items
            .iter()
            .flat_map(|i| match i {
                MenuItemSpec::Action { id, enabled, .. } => vec![(id.clone(), *enabled)],
                MenuItemSpec::Submenu { items, .. } => fn_flat(items),
                MenuItemSpec::Separator => vec![],
            })
            .collect()
    }
}
