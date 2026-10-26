//! Typed **view** over `icon.json` (design 002 E1). The `serde_json::Value` stays the truth and is
//! what gets written; this view checks the structure when a file is opened and gives typed access
//! to the fields we know. Every level keeps unknown fields in `extra` – Icon Composer writes many
//! more (specializations, `glass`, `hidden`, `position`, `specular`, `blur-material` …), which are
//! only passed through.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// The whole document.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct IconJson {
    /// `"automatic"`, `"system-light"` … or an object; interpreted in prompt 010.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<Value>,
    #[serde(default)]
    pub groups: Vec<IconGroup>,
    #[serde(
        rename = "supported-platforms",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub supported_platforms: Option<SupportedPlatforms>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct IconGroup {
    #[serde(default)]
    pub layers: Vec<IconLayer>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shadow: Option<Shadow>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub translucency: Option<Translucency>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct IconLayer {
    /// Missing when only `image-name-specializations` names the asset.
    #[serde(
        rename = "image-name",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub image_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Lost by the legacy app (legacy §2) – kept here.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Shadow {
    /// `neutral`, `layer-color` … (only passed through)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct Translucency {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<f64>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct SupportedPlatforms {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub circles: Option<PlatformSet>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub squares: Option<PlatformSet>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// Seen as `"shared"` (squares) and `["watchOS"]` (circles); either form is accepted for both.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PlatformSet {
    Keyword(String),
    List(Vec<String>),
}

impl IconJson {
    /// The typed view of a parsed `icon.json`; `Err` = the structure does not fit.
    pub fn from_value(value: &Value) -> Result<Self, serde_json::Error> {
        Self::deserialize(value)
    }

    /// Every `image-name` of every layer, in document order.
    pub fn image_names(&self) -> impl Iterator<Item = &str> {
        self.groups
            .iter()
            .flat_map(|g| &g.layers)
            .filter_map(|l| l.image_name.as_deref())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::icon::testdata::camscanner_json;
    use serde_json::json;

    fn camscanner() -> Value {
        serde_json::from_slice(&camscanner_json()).unwrap()
    }

    #[test]
    fn reads_the_fixture_including_layer_opacity() {
        let icon = IconJson::from_value(&camscanner()).unwrap();
        assert_eq!(icon.fill, Some(json!("automatic")));
        assert_eq!(icon.groups.len(), 2);
        assert_eq!(icon.groups[0].layers[0].opacity, Some(1.0));
        assert_eq!(icon.groups[1].layers[0].opacity, None);
        assert_eq!(
            icon.image_names().collect::<Vec<_>>(),
            ["logo-scanner 3.svg", "logo-scanner-2 2.svg"]
        );
        let sp = icon.supported_platforms.unwrap();
        assert_eq!(sp.squares, Some(PlatformSet::Keyword("shared".into())));
        assert_eq!(sp.circles, Some(PlatformSet::List(vec!["watchOS".into()])));
    }

    #[test]
    fn keeps_unknown_fields_on_every_level() {
        let mut v = camscanner();
        let future = json!({ "nested": [1, { "deep": true }] });
        v["x-future"] = future.clone();
        v["supported-platforms"]["x-future"] = future.clone();
        for g in v["groups"].as_array_mut().unwrap() {
            g["x-future"] = future.clone();
            g["shadow"]["x-future"] = future.clone();
            g["translucency"]["x-future"] = future.clone();
            g["blur-material"] = Value::Null;
            for l in g["layers"].as_array_mut().unwrap() {
                l["x-future"] = future.clone();
                l["glass"] = json!(true);
            }
        }
        let icon = IconJson::from_value(&v).unwrap();
        assert_eq!(icon.groups[0].extra["blur-material"], Value::Null);
        // the view holds `opacity` as f64 (`1` → `1.0`); written like Icon Composer both are `1`
        let back = serde_json::to_value(&icon).unwrap();
        assert_eq!(
            crate::icon::format_icon_json(&back),
            crate::icon::format_icon_json(&v)
        );
    }

    #[test]
    fn accepts_layers_named_only_by_specializations() {
        // from a real Icon Composer file (design 002, "Belege")
        let v = json!({ "groups": [{ "layers": [{
            "image-name-specializations": [{ "value": "light.svg" }, { "appearance": "dark", "value": "dark.svg" }],
            "name": "layer1 1",
            "position": { "scale": 0.9, "translation-in-points": [0, 0] }
        }], "specular": true }] });
        let icon = IconJson::from_value(&v).unwrap();
        assert_eq!(icon.image_names().count(), 0);
        assert_eq!(serde_json::to_value(&icon).unwrap(), v);
    }

    #[test]
    fn rejects_wrong_types_of_known_fields() {
        assert!(IconJson::from_value(&json!({ "groups": {} })).is_err());
        assert!(
            IconJson::from_value(&json!({ "groups": [{ "layers": [{ "opacity": "1" }] }] }))
                .is_err()
        );
        assert!(IconJson::from_value(&json!([])).is_err());
        assert!(IconJson::from_value(&json!({})).is_ok());
    }
}
