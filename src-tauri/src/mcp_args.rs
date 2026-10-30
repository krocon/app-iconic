//! The argument checks of the AI tools (design 018 E7, E13, E15; split from `mcp.rs` in prompt
//! 033, behaviour unchanged): schema check, bounds and defaults Rust sets before a window sees the
//! call, the timeout per tool, and which paths a call hands to the app (prompt 033 E1: a path from
//! the AI bridge the user switched on counts as trusted).

use crate::mcp::{CALL_TIMEOUT, FILE_TIMEOUT, err};
use ai_mcp::bridge::BridgeError;
use ai_mcp::tools;
use serde_json::{Map, Value, json};
use std::path::Path;
use std::time::Duration;

fn bad(message: impl Into<String>) -> BridgeError {
    err("invalid_request", message)
}

fn type_ok(schema: &Value, v: &Value) -> bool {
    let ty = schema["type"].as_str().unwrap_or("");
    let ok = match ty {
        "string" => v.is_string(),
        "integer" => v.is_u64() || v.is_i64(),
        "number" => v.is_number(),
        "boolean" => v.is_boolean(),
        "object" => v.is_object(),
        "array" => v.as_array().is_some_and(|a| {
            let items = &schema["items"];
            items.is_null() || a.iter().all(|x| type_ok(items, x))
        }),
        _ => true,
    };
    if !ok {
        return false;
    }
    if let Some(allowed) = schema["enum"].as_array()
        && !allowed.contains(v)
    {
        return false;
    }
    if let Some(n) = v.as_f64()
        && (schema["minimum"].as_f64().is_some_and(|m| n < m)
            || schema["maximum"].as_f64().is_some_and(|m| n > m))
    {
        return false;
    }
    if ty == "object"
        && let (Some(props), Some(o)) = (schema["properties"].as_object(), v.as_object())
    {
        if schema["additionalProperties"] == false && o.keys().any(|k| !props.contains_key(k)) {
            return false;
        }
        for r in schema["required"].as_array().into_iter().flatten() {
            if r.as_str().is_some_and(|k| !o.contains_key(k)) {
                return false;
            }
        }
        return o
            .iter()
            .all(|(k, x)| props.get(k).is_none_or(|s| type_ok(s, x)));
    }
    true
}

/// `args` fit the tool's schema (design 018 E7): an object with the required keys, no others,
/// each of its type and range. Returns the arguments as an object (`null` = `{}`).
pub fn check_args(tool: &str, args: &Value) -> Result<Map<String, Value>, BridgeError> {
    let schema = tools::schema(tool).ok_or_else(|| bad(format!("unknown tool {tool}")))?;
    let args = if args.is_null() {
        json!({})
    } else {
        args.clone()
    };
    let Value::Object(map) = &args else {
        return Err(bad("the arguments must be an object"));
    };
    let props = schema["properties"]
        .as_object()
        .cloned()
        .unwrap_or_default();
    if let Some(k) = map.keys().find(|k| !props.contains_key(*k)) {
        return Err(bad(format!("unknown argument {k}")));
    }
    for r in schema["required"].as_array().into_iter().flatten() {
        if let Some(k) = r.as_str()
            && !map.contains_key(k)
        {
            return Err(bad(format!("{k} is missing")));
        }
    }
    for (k, v) in map {
        if !type_ok(&props[k], v) {
            return Err(bad(format!("{k} does not fit its schema: {}", props[k])));
        }
    }
    Ok(map.clone())
}

/// An absolute path without NUL (like `UserPaths::checked`, design 018 E13).
pub fn absolute(path: &str) -> Result<(), BridgeError> {
    if path.is_empty() || path.contains('\0') || !Path::new(path).is_absolute() {
        return Err(err("invalid_path", "the path must be absolute"));
    }
    Ok(())
}

/// Defaults and bounds that Rust sets before the window sees the call (E15).
pub fn bound(tool: &str, a: &mut Map<String, Value>) -> Result<(), BridgeError> {
    match tool {
        "get_asset_svg" if !a.contains_key("max_chars") => {
            a.insert("max_chars".into(), json!(tools::SVG_CHARS_DEFAULT));
        }
        "get_tree" if !a.contains_key("max_nodes") => {
            a.insert("max_nodes".into(), json!(tools::TREE_NODES_DEFAULT));
        }
        "insert_svg" => {
            let n = a["markup"].as_str().map_or(0, str::len);
            if n > tools::MARKUP_MAX {
                return Err(err(
                    "too_large",
                    format!("markup has {n} bytes, limit {}", tools::MARKUP_MAX),
                ));
            }
        }
        "run_command" => {
            let n = serde_json::to_string(&a["command"]).map_or(0, |s| s.len());
            if n > tools::COMMAND_MAX {
                return Err(err(
                    "too_large",
                    format!("command has {n} bytes, limit {}", tools::COMMAND_MAX),
                ));
            }
        }
        "export_png" | "export_svg" => {
            absolute(a["dir"].as_str().unwrap_or(""))?;
        }
        "save_document" => {
            if let Some(p) = a.get("path").and_then(Value::as_str) {
                absolute(p)?;
            }
        }
        _ => {}
    }
    Ok(())
}

pub fn timeout_of(tool: &str) -> Duration {
    match tool {
        "save_document" | "export_png" | "export_svg" | "open" => FILE_TIMEOUT,
        _ => CALL_TIMEOUT,
    }
}

/// The file paths a call hands to the app (checked by [`bound`] before): the document to open
/// or save to, the export folder. The router grants them before the window runs the call.
pub fn file_paths(tool: &str, a: &Map<String, Value>) -> Vec<String> {
    let key = match tool {
        "open_document" | "save_document" => "path",
        "export_png" | "export_svg" => "dir",
        _ => return vec![],
    };
    a.get(key)
        .and_then(Value::as_str)
        .map(|p| vec![p.to_owned()])
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_paths_of_the_file_tools_only() {
        let a = |v: Value| v.as_object().unwrap().clone();
        assert_eq!(
            file_paths("open_document", &a(json!({"path": "/a.icon"}))),
            vec!["/a.icon"]
        );
        assert_eq!(
            file_paths("save_document", &a(json!({"path": "/b.icon"}))),
            vec!["/b.icon"]
        );
        assert!(file_paths("save_document", &a(json!({}))).is_empty());
        assert_eq!(
            file_paths("export_png", &a(json!({"dir": "/out"}))),
            vec!["/out"]
        );
        assert!(file_paths("get_tree", &a(json!({"path": "/x"}))).is_empty());
    }
}
