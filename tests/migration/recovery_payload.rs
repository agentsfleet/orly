use orly::{
    Result,
    core::{constants::REGISTRY_PATH, payload::Payload},
};
use orly_fs::digest::ContentDigest;

pub(super) fn recovery_payload() -> Result<Payload> {
    let payload = Payload::embedded()?;
    let mut files = payload.files().clone();
    // Exercise every real destination and journal boundary with small replacement bytes.
    // The full-payload migration separately checks the shipped embedded resources.
    for (path, bytes) in &mut files {
        if path != REGISTRY_PATH {
            *bytes = b"recovery fixture resource\n".to_vec();
        }
    }
    Payload::from_json(&serde_json::to_vec(&serde_json::json!({
        "digest": ContentDigest::identity(&files)?, "files": files,
    }))?)
}
