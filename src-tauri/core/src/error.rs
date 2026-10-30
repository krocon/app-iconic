//! Structured, serialisable errors (`FsError { code, message, path }`), as in comic-commander.

use serde::{Deserialize, Serialize};
use std::io;
use std::path::Path;

/// Machine-readable error codes. Serialised as `snake_case` strings so the frontend can map
/// them to user-facing texts (`describeFsError()` in `src/app/core/errors/fs-error.ts`).
/// A new code goes into both files.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FsErrorCode {
    NotFound,
    PermissionDenied,
    NotADirectory,
    IsADirectory,
    InvalidPath,
    /// Any other I/O error (message carries the details).
    Io,
    /// No or broken `icon.json`, unsafe entry names (prompt 002).
    InvalidIcon,
    /// A valid file we cannot read, e.g. an encrypted ZIP or unknown compression (prompt 002).
    UnsupportedIcon,
    /// Over the limits for files, entries or the whole archive (prompt 002 E7).
    TooLarge,
    /// An asset that should be taken over unchanged is not known (prompt 002 E5).
    MissingAsset,
    /// An SVG file that is not UTF-8 text (prompt 002 E15).
    InvalidSvg,
    /// A menu spec from the frontend over the limits or with bad ids/texts (prompt 005 E6).
    InvalidMenu,
    /// A file that is no PNG, JPEG, WebP or SVG image ("Add › Image…", prompt 008 E8).
    InvalidImage,
    /// An export target exists and overwriting was not confirmed (prompt 012 E11).
    AlreadyExists,
    /// Text to path: empty text, a line break, size or letter spacing out of range (prompt 013 E11).
    InvalidText,
    /// Text to path: the font has no glyph for some characters, e.g. emoji (prompt 013 E11).
    MissingGlyphs,
    /// AI control (prompt 018 E9): the document changed since the revision the AI expected.
    RevisionConflict,
    /// AI control: no open document (window) with this id.
    UnknownDocument,
    /// AI control: a tool call with missing, wrong or too large arguments.
    InvalidRequest,
    /// AI control: the window did not answer in time.
    Timeout,
    /// AI control: the user did not allow it (saving to a new path, export, design 018 E13).
    Denied,
    /// AI control: the action is not allowed for the AI, not enabled now, or its arguments do
    /// not fit.
    Unavailable,
    /// A path that came from no trusted source (dialog, Open Recent, the system, a drop, the AI
    /// bridge, an internal folder of the app) – defence in depth against a compromised WebView
    /// (prompt 033 E1).
    NotAllowed,
    /// A recovery snapshot that is gone, taken by another window, or still belongs to a running
    /// instance (prompt 083).
    RecoveryUnavailable,
}

/// The one error type every command returns.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FsError {
    pub code: FsErrorCode,
    pub message: String,
    pub path: Option<String>,
}

impl FsError {
    pub fn new(code: FsErrorCode, message: impl Into<String>, path: Option<&Path>) -> Self {
        Self {
            code,
            message: message.into(),
            path: path.map(|p| p.to_string_lossy().into_owned()),
        }
    }

    /// Maps an `io::Error` to a code; the path is the one the operation was about.
    pub fn from_io(err: &io::Error, path: &Path) -> Self {
        let code = match err.kind() {
            io::ErrorKind::NotFound => FsErrorCode::NotFound,
            io::ErrorKind::PermissionDenied => FsErrorCode::PermissionDenied,
            io::ErrorKind::NotADirectory => FsErrorCode::NotADirectory,
            io::ErrorKind::IsADirectory => FsErrorCode::IsADirectory,
            _ => FsErrorCode::Io,
        };
        Self::new(code, err.to_string(), Some(path))
    }
}

impl std::fmt::Display for FsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}: {}", self.code, self.message)
    }
}

impl std::error::Error for FsError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_serialise_as_snake_case() {
        let e = FsError::new(FsErrorCode::NotADirectory, "x", Some(Path::new("/a")));
        let json = serde_json::to_string(&e).unwrap();
        assert_eq!(
            json,
            r#"{"code":"not_a_directory","message":"x","path":"/a"}"#
        );
    }

    #[test]
    fn io_errors_map_to_codes() {
        let p = Path::new("/x");
        let nf = io::Error::from(io::ErrorKind::NotFound);
        assert_eq!(FsError::from_io(&nf, p).code, FsErrorCode::NotFound);
        let pd = io::Error::from(io::ErrorKind::PermissionDenied);
        assert_eq!(FsError::from_io(&pd, p).code, FsErrorCode::PermissionDenied);
        let other = io::Error::other("boom");
        assert_eq!(FsError::from_io(&other, p).code, FsErrorCode::Io);
    }

    #[test]
    fn icon_codes_serialise_as_snake_case() {
        for (code, text) in [
            (FsErrorCode::InvalidIcon, "invalid_icon"),
            (FsErrorCode::UnsupportedIcon, "unsupported_icon"),
            (FsErrorCode::TooLarge, "too_large"),
            (FsErrorCode::MissingAsset, "missing_asset"),
            (FsErrorCode::InvalidSvg, "invalid_svg"),
            (FsErrorCode::InvalidMenu, "invalid_menu"),
            (FsErrorCode::InvalidImage, "invalid_image"),
            (FsErrorCode::AlreadyExists, "already_exists"),
            (FsErrorCode::InvalidText, "invalid_text"),
            (FsErrorCode::MissingGlyphs, "missing_glyphs"),
            (FsErrorCode::RevisionConflict, "revision_conflict"),
            (FsErrorCode::UnknownDocument, "unknown_document"),
            (FsErrorCode::InvalidRequest, "invalid_request"),
            (FsErrorCode::Timeout, "timeout"),
            (FsErrorCode::Denied, "denied"),
            (FsErrorCode::Unavailable, "unavailable"),
            (FsErrorCode::NotAllowed, "not_allowed"),
            (FsErrorCode::RecoveryUnavailable, "recovery_unavailable"),
        ] {
            assert_eq!(serde_json::to_value(code).unwrap(), text);
        }
    }
}
