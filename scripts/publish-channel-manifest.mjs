// Writes a signed channel manifest to the release-channels Blob store, which
// get.nemu.sh serves at /releases/<channel>.json. The store is not trusted:
// the installer and Updater verify the signature against the pinned key.
//
// Usage: node publish-channel-manifest.mjs <canary|stable> <manifest.json>
// Needs BLOB_READ_WRITE_TOKEN and @vercel/blob resolvable from this file.

import { readFile } from "node:fs/promises";
import { put } from "@vercel/blob";

const [channel, file] = process.argv.slice(2);
if (channel !== "canary" && channel !== "stable") {
  console.error(`unknown Release channel: ${channel}`);
  process.exit(1);
}
if (!file) {
  console.error("missing manifest path");
  process.exit(1);
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN is not set");
  process.exit(1);
}

const body = await readFile(file);
JSON.parse(body.toString("utf8"));

const blob = await put(`releases/${channel}.json`, body, {
  access: "public",
  addRandomSuffix: false,
  allowOverwrite: true,
  cacheControlMaxAge: 60,
  contentType: "application/json",
});

console.log(blob.url);
