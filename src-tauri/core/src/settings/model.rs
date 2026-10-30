//! The types and defaults of `settings.json` (design 015; split from `settings.rs` in prompt
//! 033, behaviour unchanged). Defaults from legacy §9; reading, merging and checking stay in the
//! parent module.

use serde::{Deserialize, Serialize};

pub const FILE_NAME: &str = "settings.json";
pub const SCHEMA_VERSION: u32 = 1;
/// Width range of a side panel in CSS pixels (legacy §9).
pub const PANEL_MIN: u32 = 160;
pub const PANEL_MAX: u32 = 480;
pub(super) const MAX_BYTES: u64 = 64 * 1024;
/// The PNG sizes of the export (largest first, = `PNG_SIZES` of `export::png` / TS).
pub(super) const PNG_SIZES: [u32; 7] = [1024, 512, 256, 128, 64, 32, 16];
pub(super) const APPEARANCES: [&str; 3] = ["light", "dark", "tinted"];
pub(super) const MASKS: [&str; 3] = ["none", "squircle", "circle"];
pub(super) const MAX_PATH: usize = 4096;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Panel {
    pub visible: bool,
    /// CSS pixels, [`PANEL_MIN`]…[`PANEL_MAX`].
    pub width: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Panels {
    pub commands: Panel,
    pub hierarchy: Panel,
    pub properties: Panel,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasSettings {
    pub rulers: bool,
    pub guides: bool,
    pub background: bool,
    /// Group effects as a preview approximation (design 010 E13).
    pub effects: bool,
    pub cross_cursor: bool,
    pub handles: bool,
    pub snap_to_grid: bool,
    pub magic_snap: bool,
    /// Smart Guides: path, tangent, perpendicular, construction guides (prompt 040).
    pub smart_guides: bool,
    /// The icon grid drawn as guides: `apple` | `material` | `grid` (prompt 056).
    pub guide_template: String,
    /// Divisions of the `grid` template, 2…64.
    pub guide_divisions: u32,
    /// Grid spacing in document units, 1…256.
    pub grid_size: u32,
    /// `worldZero` | `svgCenter`.
    pub grid_origin: String,
    /// `point` | `boxed` | `none`.
    pub selection_mode: String,
    /// The zoom new windows start with: `0` = fit (≤ 100 %), else 0.25…2 (design 015 E7).
    pub zoom: f64,
    /// Preview appearance: `system` | `light` | `dark`.
    pub appearance: String,
    /// Platform mask of the preview: `none` | `squircle` | `circle`.
    pub mask: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSettings {
    /// `png` | `svg` | `appiconset` | `icns` | `ico` (prompt 078) | `android` | `web` (079).
    pub format: String,
    pub appearances: Vec<String>,
    pub sizes: Vec<u32>,
    pub mask: String,
    pub effects: bool,
    /// The last export folder (opaque path) or `None`.
    pub target_dir: Option<String>,
    /// Platforms of the Xcode icon set: `ios`, `macos`, `watchos` (prompt 078).
    pub platforms: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FreehandSettings {
    /// Smoothing (RDP epsilon), 0…20.
    pub epsilon: f64,
    /// 1…64.
    pub stroke_width: u32,
    pub closed: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugSettings {
    /// Log how undo steps are grouped (legacy §9).
    pub log_undo_grouping: bool,
}

/// AI control over MCP (design 018 E16).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSettings {
    /// The bridge for the `app-iconic-mcp` sidecar is open (default off).
    pub enabled: bool,
    /// Saving to a new path and exports ask the user first (design 018 E13).
    pub confirm_files: bool,
}

/// Constraints (prompt 065).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstraintSettings {
    /// Solve the constraints again after free changes (default off).
    pub auto_solve: bool,
}

/// Recovery snapshots of unsaved documents (prompt 083).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySettings {
    /// Seconds after a change until a snapshot is written; `0` = off. At most [`MAX_RECOVERY_INTERVAL`].
    pub interval: u32,
}

/// Longest recovery interval in seconds (one hour).
pub const MAX_RECOVERY_INTERVAL: u32 = 3600;

/// The command sidebar (prompt 068).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidebarSettings {
    /// The construction section is open (default closed).
    pub construction_open: bool,
}

/// Colours of the colour popover (prompt 074 E5): recently used and the user's palette, each as
/// `#RRGGBB` / `#RRGGBBAA` (upper case, no duplicates).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColorSettings {
    pub recent: Vec<String>,
    pub palette: Vec<String>,
}

/// Most recently used colours.
pub const MAX_RECENT_COLORS: usize = 16;
/// Most colours of the palette.
pub const MAX_PALETTE_COLORS: usize = 64;

/// The remembered paint of one kind of shape (design 019 E12): attribute values as written, `""`
/// = not set.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawStyle {
    pub fill: String,
    pub fill_opacity: String,
    pub stroke: String,
    pub stroke_width: String,
    pub stroke_opacity: String,
    pub stroke_linecap: String,
    pub stroke_linejoin: String,
    pub stroke_dasharray: String,
    pub opacity: String,
}

impl DrawStyle {
    /// A thin black line without fill (design 019 E13).
    pub(super) fn thin_line() -> Self {
        Self {
            fill: "none".into(),
            fill_opacity: String::new(),
            stroke: "#000000".into(),
            stroke_width: "1".into(),
            stroke_opacity: String::new(),
            stroke_linecap: String::new(),
            stroke_linejoin: String::new(),
            stroke_dasharray: String::new(),
            opacity: String::new(),
        }
    }

    pub(super) fn fields_mut(&mut self) -> [&mut String; 9] {
        [
            &mut self.fill,
            &mut self.fill_opacity,
            &mut self.stroke,
            &mut self.stroke_width,
            &mut self.stroke_opacity,
            &mut self.stroke_linecap,
            &mut self.stroke_linejoin,
            &mut self.stroke_dasharray,
            &mut self.opacity,
        ]
    }
}

/// One remembered style per kind of shape (design 019 E12).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawingStyles {
    pub rect: DrawStyle,
    pub circle: DrawStyle,
    pub ellipse: DrawStyle,
    pub line: DrawStyle,
    pub polyline: DrawStyle,
    pub polygon: DrawStyle,
    pub path: DrawStyle,
    pub arc: DrawStyle,
}

impl DrawingStyles {
    pub(super) fn all_mut(&mut self) -> [&mut DrawStyle; 8] {
        [
            &mut self.rect,
            &mut self.circle,
            &mut self.ellipse,
            &mut self.line,
            &mut self.polyline,
            &mut self.polygon,
            &mut self.path,
            &mut self.arc,
        ]
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawingSettings {
    pub styles: DrawingStyles,
}

/// Longest remembered style value.
const MAX_STYLE_VALUE: usize = 128;

/// A style value that may be written as an attribute (design 019 E13): short, no markup or CSS
/// syntax, no control characters and no `url(` (a reference into another asset).
pub fn style_value_ok(v: &str) -> bool {
    v.chars().count() <= MAX_STYLE_VALUE
        && !v
            .chars()
            .any(|c| c.is_control() || "<>\"'`;{}\\".contains(c))
        && !v.to_ascii_lowercase().contains("url(")
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub schema_version: u32,
    /// `system` | `light` | `dark`.
    pub theme: String,
    /// `system` | `en` | `de`.
    pub language: String,
    /// What a window without a file starts with (prompt 082): `startScreen` | `emptyDocument`.
    pub startup: String,
    pub panels: Panels,
    pub canvas: CanvasSettings,
    pub export: ExportSettings,
    pub freehand: FreehandSettings,
    pub debug: DebugSettings,
    pub mcp: McpSettings,
    pub constraints: ConstraintSettings,
    pub recovery: RecoverySettings,
    pub sidebar: SidebarSettings,
    pub drawing: DrawingSettings,
    pub colors: ColorSettings,
}

impl Default for Settings {
    fn default() -> Self {
        let panel = |width| Panel {
            visible: true,
            width,
        };
        Self {
            schema_version: SCHEMA_VERSION,
            theme: "system".into(),
            language: "system".into(),
            startup: "startScreen".into(),
            panels: Panels {
                commands: panel(260),
                hierarchy: panel(260),
                properties: panel(300),
            },
            canvas: CanvasSettings {
                rulers: true,
                guides: true,
                background: true,
                effects: true,
                cross_cursor: true,
                handles: true,
                snap_to_grid: false,
                magic_snap: true,
                smart_guides: true,
                guide_template: "apple".into(),
                guide_divisions: 8,
                grid_size: 10,
                grid_origin: "worldZero".into(),
                selection_mode: "point".into(),
                zoom: 0.0,
                appearance: "system".into(),
                mask: "squircle".into(),
            },
            export: ExportSettings {
                format: "png".into(),
                appearances: vec!["light".into(), "dark".into()],
                sizes: vec![1024],
                mask: "none".into(),
                effects: false,
                target_dir: None,
                platforms: vec!["ios".into(), "macos".into()],
            },
            freehand: FreehandSettings {
                epsilon: 2.5,
                stroke_width: 8,
                closed: false,
            },
            debug: DebugSettings {
                log_undo_grouping: false,
            },
            mcp: McpSettings {
                enabled: false,
                confirm_files: true,
            },
            constraints: ConstraintSettings { auto_solve: false },
            recovery: RecoverySettings { interval: 30 },
            sidebar: SidebarSettings {
                construction_open: false,
            },
            drawing: DrawingSettings {
                styles: DrawingStyles {
                    rect: DrawStyle::thin_line(),
                    circle: DrawStyle::thin_line(),
                    ellipse: DrawStyle::thin_line(),
                    line: DrawStyle::thin_line(),
                    polyline: DrawStyle::thin_line(),
                    polygon: DrawStyle::thin_line(),
                    path: DrawStyle::thin_line(),
                    arc: DrawStyle::thin_line(),
                },
            },
            colors: ColorSettings {
                recent: Vec::new(),
                palette: Vec::new(),
            },
        }
    }
}
