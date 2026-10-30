//! The tools of the MCP server (design 018 E7): names, descriptions and input schemas. A missing
//! `id` means the last active document window. The schemas are kept as a snapshot
//! (`tools.snapshot.json`, test `the_schemas_match_the_snapshot`). Form taken over from
//! editlicious `ed-mcp/src/tools.rs` (design 016 E5).

use serde_json::{Value, json};

/// Largest `max_chars` of `get_asset_svg` and its default (design 018 E15).
pub const SVG_CHARS_MAX: u64 = 200_000;
pub const SVG_CHARS_DEFAULT: u64 = 20_000;
/// Largest `max_nodes` of `get_tree` and its default.
pub const TREE_NODES_MAX: u64 = 5_000;
pub const TREE_NODES_DEFAULT: u64 = 500;
/// Preview sizes (pixels, square) and the default.
pub const PREVIEW_MIN: u64 = 16;
pub const PREVIEW_MAX: u64 = 1024;
pub const PREVIEW_DEFAULT: u64 = 512;
/// Longest SVG markup of `insert_svg` and longest serialised `command` (bytes).
pub const MARKUP_MAX: usize = 1 << 20;
pub const COMMAND_MAX: usize = 4 << 20;
/// PNG sizes of the export (design 012).
pub const PNG_SIZES: &[u64] = &[1024, 512, 256, 128, 64, 32, 16];

fn id() -> Value {
    json!({
        "type": "string",
        "description": "Document id = window label from list_documents (\"main\", \"doc-2\"); default: the last active window"
    })
}

fn revision() -> Value {
    json!({
        "type": "integer",
        "minimum": 0,
        "description": "Fail with revision_conflict if the document changed since this revision (get_document, or the last write's answer)"
    })
}

fn node_ref() -> Value {
    json!({
        "type": "object",
        "description": "A node of an SVG asset: {asset: asset file name, id: internal node id} (from get_tree)",
        "properties": {
            "asset": {"type": "string"},
            "id": {"type": "string"}
        },
        "required": ["asset", "id"],
        "additionalProperties": false
    })
}

fn appearances() -> Value {
    json!({
        "type": "array",
        "items": {"type": "string", "enum": ["light", "dark", "tinted"]},
        "description": "Default: light and dark. tinted = approximation: luminance × tint"
    })
}

/// The tint of the tinted approximation (prompt 077 E2): a view setting, not in the document.
fn tint() -> Value {
    json!({"type": "string", "pattern": "^#[0-9a-fA-F]{6}$", "description": "tinted only: the tint, default the canvas tint"})
}

fn mask() -> Value {
    json!({"type": "string", "enum": ["none", "squircle", "circle"]})
}

fn dir() -> Value {
    json!({"type": "string", "description": "Absolute path of an existing folder"})
}

fn tool(name: &str, description: &str, properties: Value, required: &[&str]) -> Value {
    json!({
        "name": name,
        "description": description,
        "inputSchema": {
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": false
        }
    })
}

/// Every tool with its schema (`tools/list`).
pub fn list() -> Vec<Value> {
    vec![
        tool(
            "list_documents",
            "Lists the open documents (one per window): id, name, path, unsaved changes, revision, which one is active.",
            json!({}),
            &[],
        ),
        tool(
            "new_document",
            "Creates a new icon (one group, one empty layer) – reuses an untouched new window, else opens a new window.",
            json!({}),
            &[],
        ),
        tool(
            "open_document",
            "Opens a .icon file (absolute path, bundle folder or ZIP) – or shows its window if it is open.",
            json!({"path": {"type": "string"}}),
            &["path"],
        ),
        tool(
            "save_document",
            "Saves a document to its file, or to `path` (absolute, may ask the user first) in `format` (bundle folder or zip).",
            json!({
                "id": id(),
                "path": {"type": "string"},
                "format": {"type": "string", "enum": ["bundle", "zip"]}
            }),
            &[],
        ),
        tool(
            "activate_document",
            "Brings the window of a document to the front; tools without id then work on it.",
            json!({"id": id()}),
            &["id"],
        ),
        tool(
            "get_document",
            "The document: name, path, revision, unsaved, undo step, selection, the asset list and icon.json (groups, layers, fill …).",
            json!({
                "id": id(),
                "icon_json": {"type": "boolean", "description": "include icon.json (default true)"}
            }),
            &[],
        ),
        tool(
            "get_asset_svg",
            "The SVG source of an asset (as saved, without internal ids), at most max_chars (default 20000, at most 200000).",
            json!({
                "id": id(),
                "asset": {"type": "string"},
                "max_chars": {"type": "integer", "minimum": 1, "maximum": SVG_CHARS_MAX},
                "node_ids": {"type": "boolean", "description": "keep the internal node ids (data-ai-id) that get_tree's refs use"}
            }),
            &["asset"],
        ),
        tool(
            "get_tree",
            "The hierarchy: root, groups, layers and their SVG nodes (kind, label, tag, node ref, fill/stroke swatch, hidden, z), depth-first, at most max_nodes (default 500, at most 5000). Like the panel, the front-most comes first on every level; z of a node = its paint order among its siblings (0 = back).",
            json!({
                "id": id(),
                "max_nodes": {"type": "integer", "minimum": 1, "maximum": TREE_NODES_MAX}
            }),
            &[],
        ),
        tool(
            "get_node",
            "One SVG node: tag, attributes, text, children, and its bounding box in icon units (0…1024) as the browser measures it.",
            json!({"id": id(), "node": node_ref()}),
            &["node"],
        ),
        tool(
            "get_selection",
            "The selected nodes and icon items (groups/layers).",
            json!({"id": id()}),
            &[],
        ),
        tool(
            "run_command",
            "Runs one document command as JSON, e.g. {\"type\":\"setAttributes\",\"changes\":[{\"ref\":{\"asset\":\"a.svg\",\"id\":\"n3\"},\"name\":\"fill\",\"value\":\"#f00\"}]} or {\"type\":\"setIconJsonValue\",\"path\":[\"fill\"],\"value\":{\"solid\":\"srgb:1.00000,0.50000,0.00000,1.00000\"}}. One undo step.",
            json!({"id": id(), "command": {"type": "object"}, "expected_revision": revision()}),
            &["command"],
        ),
        tool(
            "list_actions",
            "Lists the actions run_action may run (id, label, group, enabled, argument schema) – the same as menus, palette and keyboard.",
            json!({"id": id()}),
            &[],
        ),
        tool(
            "run_action",
            "Runs an action of the app with arguments, e.g. add.circle {cx, cy, r, fill}, icon.setFill {fill}, properties.set {name, value}, edit.delete. One undo step; the answer has the new revision and selection.",
            json!({
                "id": id(),
                "action": {"type": "string"},
                "args": {"type": "object"},
                "expected_revision": revision()
            }),
            &["action"],
        ),
        tool(
            "insert_svg",
            "Inserts SVG markup (one element, several, or a whole <svg>) like the SVG Snippet command – cleaned, centred unless it has a transform, into `parent` (a container node ref) or the current target. One undo step.",
            json!({
                "id": id(),
                "markup": {"type": "string"},
                "parent": node_ref(),
                "index": {"type": "integer", "minimum": 0},
                "expected_revision": revision()
            }),
            &["markup"],
        ),
        tool(
            "select",
            "Selects SVG nodes (empty list: nothing).",
            json!({"id": id(), "nodes": {"type": "array", "items": node_ref()}}),
            &["nodes"],
        ),
        tool(
            "export_png",
            "Exports PNGs (resvg) into a folder: <name>-<appearance>-<size>.png. May ask the user first.",
            json!({
                "id": id(),
                "dir": dir(),
                "sizes": {"type": "array", "items": {"type": "integer", "enum": PNG_SIZES}, "description": "Default: [1024]"},
                "appearances": appearances(),
                "mask": mask(),
                "effects": {"type": "boolean", "description": "shadow/translucency/glass approximation"},
                "tint": tint(),
                "overwrite": {"type": "boolean"}
            }),
            &["dir"],
        ),
        tool(
            "export_svg",
            "Exports one flat SVG per appearance into a folder: <name>-<appearance>.svg. May ask the user first.",
            json!({
                "id": id(),
                "dir": dir(),
                "appearances": appearances(),
                "mask": mask(),
                "effects": {"type": "boolean"},
                "tint": tint(),
                "overwrite": {"type": "boolean"}
            }),
            &["dir"],
        ),
        tool(
            "export_package",
            "Exports a developer package into a folder (prompt 078): appiconset = Xcode AppIcon.appiconset (Contents.json, iOS 1024 + dark/tinted, macOS 16–512 @1x/@2x, optional watchOS), icns = <name>.icns, ico = <name>.ico (16–256). May ask the user first.",
            json!({
                "id": id(),
                "dir": dir(),
                "format": {"type": "string", "enum": ["appiconset", "icns", "ico"]},
                "platforms": {"type": "array", "items": {"type": "string", "enum": ["ios", "macos", "watchos"]}, "description": "appiconset only. Default: ios, macos"},
                "appearances": {"type": "array", "items": {"type": "string", "enum": ["light", "dark", "tinted"]}, "description": "appiconset: iOS variants (light is always there)"},
                "mask": {"type": "string", "enum": ["none", "squircle", "circle"], "description": "ico only"},
                "effects": {"type": "boolean"},
                "overwrite": {"type": "boolean"}
            }),
            &["dir", "format"],
        ),
        tool(
            "render_preview",
            "Renders the icon as a PNG image (the export path) so you can see the result: size 16…1024 (default 512), appearance light/dark/tinted, mask (default squircle).",
            json!({
                "id": id(),
                "size": {"type": "integer", "minimum": PREVIEW_MIN, "maximum": PREVIEW_MAX},
                "appearance": {"type": "string", "enum": ["light", "dark", "tinted"]},
                "tint": tint(),
                "mask": mask()
            }),
            &[],
        ),
    ]
}

pub fn names() -> Vec<String> {
    list()
        .iter()
        .filter_map(|t| t["name"].as_str().map(str::to_owned))
        .collect()
}

/// The schema of one tool.
pub fn schema(name: &str) -> Option<Value> {
    list()
        .into_iter()
        .find(|t| t["name"] == name)
        .map(|t| t["inputSchema"].clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_tool_has_a_unique_name_a_description_and_an_object_schema() {
        let names = names();
        assert_eq!(names.len(), 19);
        let mut sorted = names.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), names.len());
        for t in list() {
            assert!(!t["description"].as_str().unwrap().is_empty());
            assert_eq!(t["inputSchema"]["type"], "object");
            for r in t["inputSchema"]["required"].as_array().unwrap() {
                assert!(
                    t["inputSchema"]["properties"]
                        .get(r.as_str().unwrap())
                        .is_some()
                );
            }
        }
        assert!(schema("get_tree").is_some() && schema("nope").is_none());
    }

    /// The schemas are part of the contract with AI clients (design 018 E7): a change must be
    /// deliberate. `UPDATE_SNAPSHOT=1 cargo test -p ai-mcp` writes the file anew.
    #[test]
    fn the_schemas_match_the_snapshot() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tools.snapshot.json");
        let now = serde_json::to_string_pretty(&list()).unwrap() + "\n";
        if std::env::var_os("UPDATE_SNAPSHOT").is_some() {
            std::fs::write(path, &now).unwrap();
        }
        // compared as values: the key order depends on serde_json's `preserve_order`, which the
        // workspace turns on for ai-core
        let saved: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap_or_default())
            .unwrap_or(Value::Null);
        assert_eq!(
            saved,
            Value::Array(list()),
            "tool schemas changed – UPDATE_SNAPSHOT=1 cargo test -p ai-mcp"
        );
    }
}
