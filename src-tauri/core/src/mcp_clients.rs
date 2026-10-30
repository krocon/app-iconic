//! MCP client configurations (prompt 086): where Claude Desktop and Cursor keep their list of
//! MCP servers, and how the `app-iconic` entry is merged into or removed from it.
//!
//! - The paths come from a **fixed list** computed here from the OS and the user's folders
//!   (design 086 E1) – never from the WebView.
//! - Merging keeps the other servers, unknown fields and the key order (`preserve_order`);
//!   comments or invalid JSON are an error (`invalid_config`), never a rewrite (E3).
//! - Writing makes a backup copy first and replaces the file atomically (E5).
//!
//! Sources: modelcontextprotocol.io “Connect to local MCP servers” (Claude Desktop) and
//! cursor.com/docs/context/mcp (Cursor), see `prompts/done/086-ki-einrichtung-verlauf.design.md`.

use crate::error::{FsError, FsErrorCode};
use crate::fs_atomic::write_atomic;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

/// The name of our entry under `mcpServers`.
pub const SERVER_NAME: &str = "app-iconic";
/// A client configuration larger than this is not read (1 MiB).
pub const MAX_CONFIG: u64 = 1 << 20;

/// The MCP clients the app can set up (design 086 E1).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum McpClient {
    ClaudeDesktop,
    Cursor,
}

impl McpClient {
    pub const ALL: [McpClient; 2] = [McpClient::ClaudeDesktop, McpClient::Cursor];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Os {
    Mac,
    Windows,
    Linux,
}

/// The OS this program runs on (everything that is neither macOS nor Windows counts as Linux).
pub fn current_os() -> Os {
    if cfg!(target_os = "macos") {
        Os::Mac
    } else if cfg!(target_os = "windows") {
        Os::Windows
    } else {
        Os::Linux
    }
}

/// The user's folders the paths are built from.
#[derive(Debug, Clone)]
pub struct Dirs {
    pub home: PathBuf,
    /// `%APPDATA%` (Windows only; `None` = `<home>\AppData\Roaming`).
    pub appdata: Option<PathBuf>,
}

/// Where `client` keeps its MCP servers on `os` (pure).
pub fn config_path(client: McpClient, os: Os, d: &Dirs) -> PathBuf {
    match client {
        McpClient::ClaudeDesktop => {
            let dir = match os {
                Os::Mac => d.home.join("Library").join("Application Support"),
                Os::Windows => d
                    .appdata
                    .clone()
                    .unwrap_or_else(|| d.home.join("AppData").join("Roaming")),
                Os::Linux => d.home.join(".config"),
            };
            dir.join("Claude").join("claude_desktop_config.json")
        }
        McpClient::Cursor => d.home.join(".cursor").join("mcp.json"),
    }
}

/// What a configuration says about our entry (design 086 E7).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ClientState {
    /// No file.
    Absent,
    /// A file without our entry.
    Missing,
    /// Our entry points at this sidecar.
    Installed,
    /// Our entry points somewhere else (e.g. an older installation).
    Other,
    /// Not plain JSON or not the expected shape.
    Invalid,
}

/// Reads a configuration; `None` = there is none.
pub fn read(path: &Path) -> Result<Option<String>, FsError> {
    let mut f = match fs::File::open(path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(FsError::from_io(&e, path)),
    };
    let len = f.metadata().map_err(|e| FsError::from_io(&e, path))?.len();
    if len > MAX_CONFIG {
        return Err(FsError::new(
            FsErrorCode::TooLarge,
            "the configuration is larger than 1 MiB",
            Some(path),
        ));
    }
    let mut text = String::new();
    f.read_to_string(&mut text).map_err(|e| {
        if e.kind() == std::io::ErrorKind::InvalidData {
            invalid("the configuration is not UTF-8 text")
        } else {
            FsError::from_io(&e, path)
        }
    })?;
    Ok(Some(text))
}

fn invalid(message: impl Into<String>) -> FsError {
    FsError::new(FsErrorCode::InvalidConfig, message, None)
}

/// The configuration as an object (empty text = `{}`); comments, invalid JSON or another shape
/// are `invalid_config`.
fn parse(text: Option<&str>) -> Result<Map<String, Value>, FsError> {
    let text = text.unwrap_or("");
    if text.trim().is_empty() {
        return Ok(Map::new());
    }
    let v: Value = serde_json::from_str(text)
        .map_err(|e| invalid(format!("not plain JSON (comments are not allowed): {e}")))?;
    let Value::Object(root) = v else {
        return Err(invalid("the configuration is not a JSON object"));
    };
    match root.get("mcpServers") {
        None | Some(Value::Object(_)) => Ok(root),
        Some(_) => Err(invalid("mcpServers is not an object")),
    }
}

fn render(root: &Map<String, Value>) -> String {
    let mut s = serde_json::to_string_pretty(root).unwrap_or_else(|_| "{}".into());
    s.push('\n');
    s
}

/// The state of our entry in `text` for the sidecar at `sidecar`.
pub fn state(text: Option<&str>, sidecar: Option<&str>) -> ClientState {
    let Some(t) = text else {
        return ClientState::Absent;
    };
    let Ok(root) = parse(Some(t)) else {
        return ClientState::Invalid;
    };
    match root
        .get("mcpServers")
        .and_then(|s| s.get(SERVER_NAME))
        .and_then(|e| e.get("command"))
    {
        None => match root.get("mcpServers").and_then(|s| s.get(SERVER_NAME)) {
            Some(_) => ClientState::Other,
            None => ClientState::Missing,
        },
        Some(c) if sidecar.is_some() && c.as_str() == sidecar => ClientState::Installed,
        Some(_) => ClientState::Other,
    }
}

/// `text` with our entry for `sidecar` (design 086 E2/E3); `None` = it already is like that.
pub fn merged(
    text: Option<&str>,
    client: McpClient,
    sidecar: &str,
) -> Result<Option<String>, FsError> {
    let mut root = parse(text)?;
    let before = root.clone();
    let servers = root
        .entry("mcpServers")
        .or_insert_with(|| Value::Object(Map::new()));
    let Value::Object(servers) = servers else {
        return Err(invalid("mcpServers is not an object"));
    };
    let entry = servers
        .entry(SERVER_NAME)
        .or_insert_with(|| Value::Object(Map::new()));
    if !entry.is_object() {
        *entry = Value::Object(Map::new());
    }
    let Value::Object(entry) = entry else {
        unreachable!()
    };
    if client == McpClient::Cursor {
        entry.insert("type".into(), Value::String("stdio".into()));
    }
    entry.insert("command".into(), Value::String(sidecar.into()));
    let unchanged = text.is_some() && root == before && order_equal(&root, &before);
    Ok(if unchanged { None } else { Some(render(&root)) })
}

fn order_equal(a: &Map<String, Value>, b: &Map<String, Value>) -> bool {
    a.keys().eq(b.keys())
}

/// `text` without our entry; `None` = there is nothing to remove.
pub fn removed(text: Option<&str>) -> Result<Option<String>, FsError> {
    if text.is_none() {
        return Ok(None);
    }
    let mut root = parse(text)?;
    let gone = match root.get_mut("mcpServers") {
        Some(Value::Object(s)) => s.shift_remove(SERVER_NAME).is_some(),
        _ => false,
    };
    Ok(gone.then(|| render(&root)))
}

/// The backup name of `path` for the time `secs`: `<name>.app-iconic-<secs>.bak`, never an
/// existing file.
fn backup_path(path: &Path, secs: u64) -> PathBuf {
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    let mut n = 0;
    loop {
        let suffix = if n == 0 {
            String::new()
        } else {
            format!("-{n}")
        };
        let p = path.with_file_name(format!("{name}.app-iconic-{secs}{suffix}.bak"));
        if !p.exists() {
            return p;
        }
        n += 1;
    }
}

/// Writes `text` to `path` (design 086 E4/E5): the file must still be `expected` (the text the
/// user saw; `None` = no file), the folder is created, an existing file is copied to a backup
/// first, then replaced atomically. Returns the backup.
pub fn write(path: &Path, expected: Option<&str>, text: &str) -> Result<Option<PathBuf>, FsError> {
    let now = read(path)?;
    if now.as_deref() != expected {
        return Err(FsError::new(
            FsErrorCode::ConfigChanged,
            "the configuration changed since the preview",
            Some(path),
        ));
    }
    let backup = if now.is_some() {
        let secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let b = backup_path(path, secs);
        fs::copy(path, &b).map_err(|e| FsError::from_io(&e, &b))?;
        Some(b)
    } else {
        None
    };
    #[cfg(unix)]
    let mode = {
        use std::os::unix::fs::PermissionsExt;
        fs::metadata(path)
            .map(|m| m.permissions().mode() & 0o777)
            .unwrap_or(0o600)
    };
    write_atomic(path, text.as_bytes()).map_err(|e| FsError::from_io(&e, path))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(mode));
    }
    Ok(backup)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SIDE: &str = "/Applications/AppIconic.app/Contents/MacOS/app-iconic-mcp";

    fn dirs(home: &str, appdata: Option<&str>) -> Dirs {
        Dirs {
            home: PathBuf::from(home),
            appdata: appdata.map(PathBuf::from),
        }
    }

    #[test]
    fn paths_per_os_follow_the_docs() {
        let d = dirs("/h", None);
        assert_eq!(
            config_path(McpClient::ClaudeDesktop, Os::Mac, &d),
            Path::new("/h/Library/Application Support/Claude/claude_desktop_config.json")
        );
        assert_eq!(
            config_path(McpClient::ClaudeDesktop, Os::Linux, &d),
            Path::new("/h/.config/Claude/claude_desktop_config.json")
        );
        assert_eq!(
            config_path(
                McpClient::ClaudeDesktop,
                Os::Windows,
                &dirs("/h", Some("/roaming"))
            ),
            Path::new("/roaming/Claude/claude_desktop_config.json")
        );
        assert_eq!(
            config_path(McpClient::ClaudeDesktop, Os::Windows, &d),
            Path::new("/h/AppData/Roaming/Claude/claude_desktop_config.json")
        );
        for os in [Os::Mac, Os::Windows, Os::Linux] {
            assert_eq!(
                config_path(McpClient::Cursor, os, &d),
                Path::new("/h/.cursor/mcp.json")
            );
        }
    }

    #[test]
    fn targets_serialise_as_camel_case() {
        assert_eq!(
            serde_json::to_string(&McpClient::ClaudeDesktop).unwrap(),
            "\"claudeDesktop\""
        );
        assert_eq!(
            serde_json::from_str::<McpClient>("\"cursor\"").unwrap(),
            McpClient::Cursor
        );
        assert!(serde_json::from_str::<McpClient>("\"../x\"").is_err());
    }

    const FOREIGN: &str = r#"{
  "zeta": 1,
  "mcpServers": {
    "filesystem": { "command": "npx", "args": ["-y", "x"], "env": { "KEY": "secret" } },
    "other": { "url": "https://example.com/mcp" }
  },
  "alpha": { "nested": [1, 2, 3] },
  "globalShortcut": "Ctrl+Space"
}"#;

    #[test]
    fn merging_keeps_other_servers_unknown_fields_and_order() {
        let out = merged(Some(FOREIGN), McpClient::ClaudeDesktop, SIDE)
            .unwrap()
            .unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        let root = v.as_object().unwrap();
        assert_eq!(
            root.keys().collect::<Vec<_>>(),
            ["zeta", "mcpServers", "alpha", "globalShortcut"]
        );
        let servers = root["mcpServers"].as_object().unwrap();
        assert_eq!(
            servers.keys().collect::<Vec<_>>(),
            ["filesystem", "other", SERVER_NAME]
        );
        assert_eq!(servers["filesystem"]["env"]["KEY"], "secret");
        assert_eq!(servers["other"]["url"], "https://example.com/mcp");
        assert_eq!(servers[SERVER_NAME], serde_json::json!({ "command": SIDE }));
        assert_eq!(root["alpha"]["nested"], serde_json::json!([1, 2, 3]));
        assert!(out.ends_with("}\n"));
        assert_eq!(state(Some(&out), Some(SIDE)), ClientState::Installed);
        // a second time: nothing to do
        assert_eq!(
            merged(Some(&out), McpClient::ClaudeDesktop, SIDE).unwrap(),
            None
        );
    }

    #[test]
    fn an_existing_entry_keeps_its_other_fields_cursor_gets_type() {
        let text = r#"{"mcpServers":{"app-iconic":{"command":"/old/app-iconic-mcp","args":["-v"],"env":{"A":"1"}}}}"#;
        assert_eq!(state(Some(text), Some(SIDE)), ClientState::Other);
        let out = merged(Some(text), McpClient::Cursor, SIDE)
            .unwrap()
            .unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        let e = &v["mcpServers"][SERVER_NAME];
        assert_eq!(e["command"], SIDE);
        assert_eq!(e["type"], "stdio");
        assert_eq!(e["args"], serde_json::json!(["-v"]));
        assert_eq!(e["env"]["A"], "1");
        assert_eq!(
            e.as_object().unwrap().keys().collect::<Vec<_>>(),
            ["command", "args", "env", "type"]
        );
    }

    #[test]
    fn no_file_or_an_empty_one_starts_from_scratch() {
        let out = merged(None, McpClient::Cursor, SIDE).unwrap().unwrap();
        assert_eq!(
            out,
            format!(
                "{{\n  \"mcpServers\": {{\n    \"app-iconic\": {{\n      \"type\": \"stdio\",\n      \"command\": \"{SIDE}\"\n    }}\n  }}\n}}\n"
            )
        );
        assert!(
            merged(Some("  \n"), McpClient::ClaudeDesktop, SIDE)
                .unwrap()
                .is_some()
        );
        assert_eq!(state(None, Some(SIDE)), ClientState::Absent);
        assert_eq!(state(Some("{}"), Some(SIDE)), ClientState::Missing);
    }

    #[test]
    fn comments_invalid_json_or_other_shapes_are_errors() {
        for bad in [
            "{\n  // my servers\n  \"mcpServers\": {}\n}",
            "{ \"mcpServers\": { /* x */ } }",
            "{ \"mcpServers\": {}, }",
            "[1, 2]",
            "{ \"mcpServers\": \"none\" }",
            "{ \"mcpServers\": [] }",
            "not json",
        ] {
            let e = merged(Some(bad), McpClient::ClaudeDesktop, SIDE).unwrap_err();
            assert_eq!(e.code, FsErrorCode::InvalidConfig, "{bad}");
            assert_eq!(
                removed(Some(bad)).unwrap_err().code,
                FsErrorCode::InvalidConfig
            );
            assert_eq!(state(Some(bad), Some(SIDE)), ClientState::Invalid);
        }
    }

    #[test]
    fn removing_takes_only_our_entry() {
        let with = merged(Some(FOREIGN), McpClient::ClaudeDesktop, SIDE)
            .unwrap()
            .unwrap();
        let out = removed(Some(&with)).unwrap().unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(
            v["mcpServers"]
                .as_object()
                .unwrap()
                .keys()
                .collect::<Vec<_>>(),
            ["filesystem", "other"]
        );
        assert_eq!(v["globalShortcut"], "Ctrl+Space");
        // nothing there → nothing to do
        assert_eq!(removed(Some(FOREIGN)).unwrap(), None);
        assert_eq!(removed(None).unwrap(), None);
        // only our server: an empty mcpServers stays
        let only = merged(None, McpClient::ClaudeDesktop, SIDE)
            .unwrap()
            .unwrap();
        assert_eq!(
            removed(Some(&only)).unwrap().unwrap(),
            "{\n  \"mcpServers\": {}\n}\n"
        );
    }

    #[test]
    fn writing_creates_the_folder_and_keeps_a_backup() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp
            .path()
            .join("deep")
            .join("Claude")
            .join("claude_desktop_config.json");
        let first = merged(None, McpClient::ClaudeDesktop, SIDE)
            .unwrap()
            .unwrap();
        assert_eq!(write(&file, None, &first).unwrap(), None);
        assert_eq!(read(&file).unwrap().as_deref(), Some(first.as_str()));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(&file).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600);
        }
        let second = removed(Some(&first)).unwrap().unwrap();
        let backup = write(&file, Some(&first), &second).unwrap().unwrap();
        assert_eq!(fs::read_to_string(&backup).unwrap(), first);
        assert!(
            backup
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("claude_desktop_config.json.app-iconic-")
        );
        assert_eq!(read(&file).unwrap().as_deref(), Some(second.as_str()));
        // a second backup in the same second gets its own name
        let third = write(&file, Some(&second), &first).unwrap().unwrap();
        assert_ne!(third, backup);
        assert_eq!(fs::read_to_string(&third).unwrap(), second);
    }

    #[test]
    fn writing_refuses_a_file_that_changed_since_the_preview() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("mcp.json");
        fs::write(&file, "{}").unwrap();
        let e = write(&file, Some("{ }"), "{\"x\":1}").unwrap_err();
        assert_eq!(e.code, FsErrorCode::ConfigChanged);
        let e = write(&file, None, "{\"x\":1}").unwrap_err();
        assert_eq!(e.code, FsErrorCode::ConfigChanged);
        assert_eq!(fs::read_to_string(&file).unwrap(), "{}");
        assert_eq!(
            fs::read_dir(tmp.path()).unwrap().count(),
            1,
            "no backup, no temp file"
        );
    }

    #[cfg(unix)]
    #[test]
    fn writing_keeps_the_permissions_of_the_old_file() {
        use std::os::unix::fs::PermissionsExt;
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("mcp.json");
        fs::write(&file, "{}").unwrap();
        fs::set_permissions(&file, fs::Permissions::from_mode(0o640)).unwrap();
        write(&file, Some("{}"), "{\"a\":1}\n").unwrap();
        assert_eq!(
            fs::metadata(&file).unwrap().permissions().mode() & 0o777,
            0o640
        );
    }

    #[test]
    fn large_files_are_not_read() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("mcp.json");
        fs::write(&file, vec![b' '; (MAX_CONFIG + 1) as usize]).unwrap();
        assert_eq!(read(&file).unwrap_err().code, FsErrorCode::TooLarge);
        assert_eq!(read(&tmp.path().join("none.json")).unwrap(), None);
    }
}
