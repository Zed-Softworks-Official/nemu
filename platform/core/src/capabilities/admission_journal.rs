//! Admission-gap journal seam.
//!
//! NEM-25 replaces the body of `note_disk_floor` with the fsynced journal.
//! This stub only records that History admission asked for a `disk_floor` gap.

use std::sync::Mutex;

use chrono::{DateTime, Utc};

static DISK_FLOOR_ONSETS: Mutex<Vec<DateTime<Utc>>> = Mutex::new(Vec::new());

pub fn note_disk_floor(onset: DateTime<Utc>) {
    // NEM-25 replaces this body with the admission-gap journal.
    // Keep the first onset only so a sustained floor breach stays bounded.
    let mut onsets = DISK_FLOOR_ONSETS
        .lock()
        .expect("disk floor journal poisoned");
    if onsets.is_empty() {
        onsets.push(onset);
    }
}

#[cfg(test)]
pub(crate) fn clear_disk_floor_for_test() {
    DISK_FLOOR_ONSETS
        .lock()
        .expect("disk floor journal poisoned")
        .clear();
}

#[cfg(test)]
pub(crate) fn disk_floor_onsets_for_test() -> Vec<DateTime<Utc>> {
    DISK_FLOOR_ONSETS
        .lock()
        .expect("disk floor journal poisoned")
        .clone()
}
