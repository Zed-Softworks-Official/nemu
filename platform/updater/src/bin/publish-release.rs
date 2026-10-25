//! Publisher entry point. The release-signing key is `NEMU_RELEASE_SIGNING_KEY`
//! (base64 of the 32-byte ed25519 seed). The request JSON is stdin. The plan
//! JSON is stdout. The key is not written to either.

use std::io::{self, Write};
use std::process::ExitCode;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde::Serialize;

use updater::{
    ImageTag, PublishError, PublishPlan, PublishRequest, ReleaseChannel, plan_publish,
    signing_key_from_base64,
};

fn main() -> ExitCode {
    if let Err(error) = publish() {
        eprintln!("{error}");
        return ExitCode::from(1);
    }
    ExitCode::SUCCESS
}

fn publish() -> Result<(), String> {
    let encoded = std::env::var("NEMU_RELEASE_SIGNING_KEY")
        .map_err(|_| "NEMU_RELEASE_SIGNING_KEY is not set".to_string())?;
    let signing_key = signing_key_from_base64(&encoded).map_err(display_error)?;
    let request: PublishRequest = serde_json::from_reader(io::stdin())
        .map_err(|_| "the publish request could not be read".to_string())?;
    let plan = plan_publish(&request, &signing_key).map_err(display_error)?;
    let output = PlanOutput::from_plan(&plan);
    serde_json::to_writer(io::stdout(), &output)
        .map_err(|_| "the publish plan could not be written".to_string())?;
    writeln!(io::stdout()).map_err(|_| "the publish plan could not be written".to_string())?;
    Ok(())
}

fn display_error(error: PublishError) -> String {
    error.to_string()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlanOutput<'a> {
    platform_version: &'a str,
    allocated_version: bool,
    git_tag: Option<&'a str>,
    merge_back_to_canary: bool,
    channel: ReleaseChannel,
    signed_manifest: String,
    image_tags: &'a [ImageTag],
}

impl<'a> PlanOutput<'a> {
    fn from_plan(plan: &'a PublishPlan) -> Self {
        Self {
            platform_version: &plan.platform_version,
            allocated_version: plan.allocated_version,
            git_tag: plan.git_tag.as_deref(),
            merge_back_to_canary: plan.merge_back_to_canary,
            channel: plan.channel,
            signed_manifest: BASE64.encode(&plan.signed_manifest),
            image_tags: &plan.image_tags,
        }
    }
}
