use std::fmt;

/// A Platform version: `0.MINOR.PATCH`, or `0.MINOR.PATCH-canary.N` for a
/// Release candidate. The derived order is semver precedence, so a candidate
/// is older than its plain version and candidates compare by `N`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) struct PlatformVersion {
    pub(crate) minor: u64,
    pub(crate) patch: u64,
    stage: Stage,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Stage {
    Candidate(u64),
    Plain,
}

impl PlatformVersion {
    /// `None` for any other form, including leading zeros and `canary.0`.
    pub(crate) fn parse(version: &str) -> Option<Self> {
        let (core, stage) = match version.split_once('-') {
            None => (version, Stage::Plain),
            Some((core, suffix)) => {
                let n = number(suffix.strip_prefix("canary.")?).filter(|n| *n > 0)?;
                (core, Stage::Candidate(n))
            }
        };
        let (minor, patch) = core.strip_prefix("0.")?.split_once('.')?;
        Some(Self {
            minor: number(minor)?,
            patch: number(patch)?,
            stage,
        })
    }

    pub(crate) fn plain(minor: u64, patch: u64) -> Self {
        Self {
            minor,
            patch,
            stage: Stage::Plain,
        }
    }

    /// Release candidate `n` for this version's target.
    pub(crate) fn candidate(self, n: u64) -> Self {
        Self {
            stage: Stage::Candidate(n),
            ..self
        }
    }

    /// The plain version a candidate precedes; a plain version is its own.
    pub(crate) fn target(self) -> Self {
        Self::plain(self.minor, self.patch)
    }

    pub(crate) fn next_patch(self) -> Self {
        Self::plain(self.minor, self.patch + 1)
    }

    pub(crate) fn next_minor(self) -> Self {
        Self::plain(self.minor + 1, 0)
    }

    pub(crate) fn candidate_number(&self) -> Option<u64> {
        match self.stage {
            Stage::Candidate(n) => Some(n),
            Stage::Plain => None,
        }
    }

    pub(crate) fn is_candidate(&self) -> bool {
        matches!(self.stage, Stage::Candidate(_))
    }
}

impl fmt::Display for PlatformVersion {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "0.{}.{}", self.minor, self.patch)?;
        match self.candidate_number() {
            Some(n) => write!(f, "-canary.{n}"),
            None => Ok(()),
        }
    }
}

fn number(text: &str) -> Option<u64> {
    let digits = !text.is_empty() && text.bytes().all(|byte| byte.is_ascii_digit());
    if !digits || (text.len() > 1 && text.starts_with('0')) {
        return None;
    }
    text.parse().ok()
}
