//! Publisher entry point. `publish-release decide` reads a release request and
//! writes the decision; it needs no key. `publish-release plan` reads a publish
//! request and writes the plan. Both read JSON on stdin and write JSON on
//! stdout. The release-signing key is `NEMU_RELEASE_SIGNING_KEY` (base64 of
//! the 32-byte ed25519 seed). It is not written to either.

use std::io::{self, Write};
use std::process::ExitCode;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde::Serialize;
use serde::de::DeserializeOwned;

use updater::{
    ImageTag, PublishDecision, PublishError, PublishRequest, ReleaseRequest, decide, plan_publish,
    signing_key_from_base64,
};

fn main() -> ExitCode {
    let result = match std::env::args().nth(1).as_deref() {
        Some("decide") => decision(),
        Some("plan") => plan(),
        _ => Err("usage: publish-release <decide|plan>".to_string()),
    };
    if let Err(error) = result {
        eprintln!("{error}");
        return ExitCode::from(1);
    }
    ExitCode::SUCCESS
}

fn decision() -> Result<(), String> {
    let request: ReleaseRequest = read()?;
    write(&decide(&request).map_err(display_error)?)
}

fn plan() -> Result<(), String> {
    let encoded = std::env::var("NEMU_RELEASE_SIGNING_KEY")
        .map_err(|_| "NEMU_RELEASE_SIGNING_KEY is not set".to_string())?;
    let signing_key = signing_key_from_base64(&encoded).map_err(display_error)?;
    let request: PublishRequest = read()?;
    let plan = plan_publish(&request, &signing_key).map_err(display_error)?;
    write(&PlanOutput {
        decision: &plan.decision,
        signed_manifest: BASE64.encode(&plan.signed_manifest),
        version_tags: &plan.version_tags,
        pointer_tags: &plan.pointer_tags,
    })
}

fn read<T: DeserializeOwned>() -> Result<T, String> {
    serde_json::from_reader(io::stdin().lock())
        .map_err(|_| "the publish request could not be read".to_string())
}

fn write(output: &impl Serialize) -> Result<(), String> {
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, output)
        .map_err(|_| "the publish plan could not be written".to_string())?;
    writeln!(stdout).map_err(|_| "the publish plan could not be written".to_string())
}

fn display_error(error: PublishError) -> String {
    error.to_string()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlanOutput<'a> {
    #[serde(flatten)]
    decision: &'a PublishDecision,
    signed_manifest: String,
    version_tags: &'a [ImageTag],
    pointer_tags: &'a [ImageTag],
}
