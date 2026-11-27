//! The sliding replay window for per-Access Client counters.
//!
//! The Controller keeps the highest counter it has accepted plus a bitmap of
//! the 64 counters ending at it. A counter is accepted once; anything older
//! than the window is refused. Counters start at 1.

pub const REPLAY_WINDOW_SIZE: u64 = 64;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ReplayWindow {
    /// Highest accepted counter, or 0 when nothing has been accepted.
    pub highest: u64,
    /// Bit `i` is set when counter `highest - i` has been accepted.
    pub seen: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum ReplayRejection {
    #[error("replayed")]
    Replayed,
    #[error("outside_window")]
    OutsideWindow,
}

impl ReplayWindow {
    /// Returns the window after accepting `counter`, or why it is refused.
    /// The window itself never changes, so a caller commits the result only
    /// once the rest of its checks pass.
    pub fn accept(&self, counter: u64) -> Result<ReplayWindow, ReplayRejection> {
        if counter == 0 {
            return Err(ReplayRejection::OutsideWindow);
        }
        if counter > self.highest {
            let shift = counter - self.highest;
            let seen = if shift >= REPLAY_WINDOW_SIZE {
                0
            } else {
                self.seen << shift
            };
            return Ok(ReplayWindow {
                highest: counter,
                seen: seen | 1,
            });
        }
        let age = self.highest - counter;
        if age >= REPLAY_WINDOW_SIZE {
            return Err(ReplayRejection::OutsideWindow);
        }
        let bit = 1u64 << age;
        if self.seen & bit != 0 {
            return Err(ReplayRejection::Replayed);
        }
        Ok(ReplayWindow {
            highest: self.highest,
            seen: self.seen | bit,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(counters: &[u64]) -> Vec<Result<(), ReplayRejection>> {
        let mut window = ReplayWindow::default();
        counters
            .iter()
            .map(|&c| window.accept(c).map(|next| window = next))
            .collect()
    }

    #[test]
    fn accepts_each_counter_once_in_any_order_inside_the_window() {
        assert_eq!(
            run(&[1, 3, 2, 3]),
            vec![Ok(()), Ok(()), Ok(()), Err(ReplayRejection::Replayed)]
        );
    }

    #[test]
    fn refuses_counters_older_than_the_window() {
        assert_eq!(
            run(&[100, 37, 36]),
            vec![Ok(()), Ok(()), Err(ReplayRejection::OutsideWindow)]
        );
        assert_eq!(run(&[0]), vec![Err(ReplayRejection::OutsideWindow)]);
    }

    #[test]
    fn a_large_jump_clears_the_window() {
        assert_eq!(
            run(&[5, 500, 5, 499]),
            vec![Ok(()), Ok(()), Err(ReplayRejection::OutsideWindow), Ok(())]
        );
    }
}
