//! Home calendar buckets and prospective timezone periods.
//!
//! Observations stay UTC instants. Daily and monthly buckets retain the IANA
//! timezone id used to create them. Readable History stays on the Controller.

use chrono::{DateTime, Datelike, NaiveDate, TimeZone, Utc};
use chrono_tz::Tz;
use thiserror::Error;

/// UTC bounds of one local day or month, tagged with the timezone that defined it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CalendarBucket {
    pub timezone: String,
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub partial: bool,
}

/// One prospective Home timezone. Bounds are UTC instants, half-open.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TimezonePeriod {
    pub timezone: String,
    pub effective_from: DateTime<Utc>,
    pub effective_until: Option<DateTime<Utc>>,
}

/// Closing the open period and opening the next one at a future midnight.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TimezoneChange {
    pub closed: TimezonePeriod,
    pub opened: TimezonePeriod,
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum CalendarError {
    #[error("unknown IANA timezone")]
    UnknownTimezone,
    #[error("timezone period is open")]
    OpenPeriod,
    #[error("timezone change was requested before the period started")]
    RequestBeforePeriod,
    #[error("timezone is unchanged")]
    UnchangedTimezone,
    #[error("local midnight does not exist")]
    MissingLocalTime,
    #[error("calendar date overflow")]
    DateOverflow,
    #[error("timezone period bounds are invalid")]
    InvalidPeriod,
}

pub fn daily_bucket(
    timezone: &str,
    instant: DateTime<Utc>,
) -> Result<CalendarBucket, CalendarError> {
    let tz = parse_timezone(timezone)?;
    let date = instant.with_timezone(&tz).date_naive();
    natural_day(timezone, tz, date)
}

pub fn monthly_bucket(
    timezone: &str,
    instant: DateTime<Utc>,
) -> Result<CalendarBucket, CalendarError> {
    let tz = parse_timezone(timezone)?;
    let local_date = instant.with_timezone(&tz).date_naive();
    let start_date = NaiveDate::from_ymd_opt(local_date.year(), local_date.month(), 1)
        .ok_or(CalendarError::DateOverflow)?;
    natural_month(timezone, tz, start_date)
}

/// A change requested at `requested_at` takes effect at the next midnight in
/// `new_timezone`. The old period keeps its timezone and earlier bounds.
pub fn schedule_timezone_change(
    current: &TimezonePeriod,
    new_timezone: &str,
    requested_at: DateTime<Utc>,
) -> Result<TimezoneChange, CalendarError> {
    if current.effective_until.is_some() {
        return Err(CalendarError::InvalidPeriod);
    }
    if requested_at < current.effective_from {
        return Err(CalendarError::RequestBeforePeriod);
    }
    let current_tz = parse_timezone(&current.timezone)?;
    let new_tz = parse_timezone(new_timezone)?;
    if current_tz == new_tz {
        return Err(CalendarError::UnchangedTimezone);
    }
    let effective = next_local_midnight(new_tz, requested_at)?;
    if effective <= current.effective_from {
        return Err(CalendarError::InvalidPeriod);
    }
    Ok(TimezoneChange {
        closed: TimezonePeriod {
            timezone: current.timezone.clone(),
            effective_from: current.effective_from,
            effective_until: Some(effective),
        },
        opened: TimezonePeriod {
            timezone: new_timezone.to_owned(),
            effective_from: effective,
            effective_until: None,
        },
    })
}

/// Rebuilds every local day in a closed period. Days the period does not cover
/// completely are partial. An open period has no finite end.
pub fn daily_buckets(period: &TimezonePeriod) -> Result<Vec<CalendarBucket>, CalendarError> {
    let until = period.effective_until.ok_or(CalendarError::OpenPeriod)?;
    if until <= period.effective_from {
        return Err(CalendarError::InvalidPeriod);
    }
    let tz = parse_timezone(&period.timezone)?;
    let mut date = period.effective_from.with_timezone(&tz).date_naive();
    let mut buckets = Vec::new();
    loop {
        let natural = natural_day(&period.timezone, tz, date)?;
        if natural.start >= until {
            break;
        }
        if natural.end <= period.effective_from {
            date = date.succ_opt().ok_or(CalendarError::DateOverflow)?;
            continue;
        }
        let start = natural.start.max(period.effective_from);
        let end = natural.end.min(until);
        if start >= end {
            break;
        }
        buckets.push(CalendarBucket {
            timezone: period.timezone.clone(),
            start,
            end,
            partial: start != natural.start || end != natural.end,
        });
        if end < natural.end {
            break;
        }
        date = date.succ_opt().ok_or(CalendarError::DateOverflow)?;
    }
    Ok(buckets)
}

fn parse_timezone(timezone: &str) -> Result<Tz, CalendarError> {
    timezone.parse().map_err(|_| CalendarError::UnknownTimezone)
}

fn natural_day(timezone: &str, tz: Tz, date: NaiveDate) -> Result<CalendarBucket, CalendarError> {
    let start = local_midnight(tz, date)?;
    let end = local_midnight(tz, date.succ_opt().ok_or(CalendarError::DateOverflow)?)?;
    if end <= start {
        return Err(CalendarError::InvalidPeriod);
    }
    Ok(CalendarBucket {
        timezone: timezone.to_owned(),
        start,
        end,
        partial: false,
    })
}

fn natural_month(
    timezone: &str,
    tz: Tz,
    start_date: NaiveDate,
) -> Result<CalendarBucket, CalendarError> {
    let start = local_midnight(tz, start_date)?;
    let end = local_midnight(tz, next_month(start_date)?)?;
    if end <= start {
        return Err(CalendarError::InvalidPeriod);
    }
    Ok(CalendarBucket {
        timezone: timezone.to_owned(),
        start,
        end,
        partial: false,
    })
}

fn next_month(date: NaiveDate) -> Result<NaiveDate, CalendarError> {
    let (year, month) = if date.month() == 12 {
        (
            date.year()
                .checked_add(1)
                .ok_or(CalendarError::DateOverflow)?,
            1,
        )
    } else {
        (date.year(), date.month() + 1)
    };
    NaiveDate::from_ymd_opt(year, month, 1).ok_or(CalendarError::DateOverflow)
}

/// Next local midnight strictly after `instant`. An exact midnight waits for
/// the following one, so a timezone change does not take effect immediately.
fn next_local_midnight(tz: Tz, instant: DateTime<Utc>) -> Result<DateTime<Utc>, CalendarError> {
    let date = instant.with_timezone(&tz).date_naive();
    local_midnight(tz, date.succ_opt().ok_or(CalendarError::DateOverflow)?)
}

fn local_midnight(tz: Tz, date: NaiveDate) -> Result<DateTime<Utc>, CalendarError> {
    match tz.with_ymd_and_hms(date.year(), date.month(), date.day(), 0, 0, 0) {
        chrono::LocalResult::Single(local) => Ok(local.with_timezone(&Utc)),
        chrono::LocalResult::Ambiguous(earliest, _) => Ok(earliest.with_timezone(&Utc)),
        chrono::LocalResult::None => Err(CalendarError::MissingLocalTime),
    }
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;

    use super::*;

    fn utc(year: i32, month: u32, day: u32, hour: u32, min: u32, sec: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(year, month, day, hour, min, sec)
            .unwrap()
    }

    fn elapsed_seconds(bucket: &CalendarBucket) -> i64 {
        (bucket.end - bucket.start).num_seconds()
    }

    fn open_los_angeles() -> TimezonePeriod {
        TimezonePeriod {
            timezone: "America/Los_Angeles".to_owned(),
            effective_from: utc(2026, 6, 1, 7, 0, 0),
            effective_until: None,
        }
    }

    #[test]
    fn observations_remain_utc_instants_and_buckets_keep_their_timezone() {
        let observed_at = utc(2026, 6, 15, 20, 30, 0);
        let bucket = daily_bucket("America/Los_Angeles", observed_at).unwrap();

        assert_eq!(observed_at, utc(2026, 6, 15, 20, 30, 0));
        assert_eq!(observed_at.timezone(), Utc);
        assert_eq!(bucket.start.timezone(), Utc);
        assert_eq!(bucket.end.timezone(), Utc);
        assert_eq!(bucket.timezone, "America/Los_Angeles");
        assert_eq!(bucket.start, utc(2026, 6, 15, 7, 0, 0));
        assert_eq!(bucket.end, utc(2026, 6, 16, 7, 0, 0));
        assert_ne!(bucket.start, utc(2026, 6, 15, 0, 0, 0));
        assert!(!bucket.partial);
    }

    #[test]
    fn local_days_use_actual_elapsed_duration_across_daylight_saving() {
        let spring_early = daily_bucket("America/Los_Angeles", utc(2026, 3, 8, 9, 0, 0)).unwrap();
        let spring_late = daily_bucket("America/Los_Angeles", utc(2026, 3, 9, 6, 0, 0)).unwrap();
        assert_eq!(spring_early, spring_late);
        assert_eq!(spring_early.timezone, "America/Los_Angeles");
        assert_eq!(spring_early.start, utc(2026, 3, 8, 8, 0, 0));
        assert_eq!(spring_early.end, utc(2026, 3, 9, 7, 0, 0));
        assert_eq!(elapsed_seconds(&spring_early), 23 * 3600);
        assert!(!spring_early.partial);

        let ordinary = daily_bucket("America/Los_Angeles", utc(2026, 6, 15, 19, 0, 0)).unwrap();
        assert_eq!(ordinary.timezone, "America/Los_Angeles");
        assert_eq!(ordinary.start, utc(2026, 6, 15, 7, 0, 0));
        assert_eq!(ordinary.end, utc(2026, 6, 16, 7, 0, 0));
        assert_eq!(elapsed_seconds(&ordinary), 24 * 3600);
        assert!(!ordinary.partial);

        let fall_first = daily_bucket("America/Los_Angeles", utc(2026, 11, 1, 8, 30, 0)).unwrap();
        let fall_second = daily_bucket("America/Los_Angeles", utc(2026, 11, 1, 9, 30, 0)).unwrap();
        assert_eq!(fall_first, fall_second);
        assert_eq!(fall_first.timezone, "America/Los_Angeles");
        assert_eq!(fall_first.start, utc(2026, 11, 1, 7, 0, 0));
        assert_eq!(fall_first.end, utc(2026, 11, 2, 8, 0, 0));
        assert_eq!(elapsed_seconds(&fall_first), 25 * 3600);
        assert!(!fall_first.partial);
    }

    #[test]
    fn monthly_buckets_cover_the_actual_local_month() {
        let march = monthly_bucket("America/Los_Angeles", utc(2026, 3, 8, 18, 0, 0)).unwrap();
        assert_eq!(march.timezone, "America/Los_Angeles");
        assert_eq!(march.start, utc(2026, 3, 1, 8, 0, 0));
        assert_eq!(march.end, utc(2026, 4, 1, 7, 0, 0));
        assert_eq!(elapsed_seconds(&march), 743 * 3600);
        assert!(!march.partial);

        let november = monthly_bucket("America/Los_Angeles", utc(2026, 11, 1, 12, 0, 0)).unwrap();
        assert_eq!(november.timezone, "America/Los_Angeles");
        assert_eq!(november.start, utc(2026, 11, 1, 7, 0, 0));
        assert_eq!(november.end, utc(2026, 12, 1, 8, 0, 0));
        assert_eq!(elapsed_seconds(&november), 721 * 3600);
        assert!(!november.partial);

        let january = monthly_bucket("America/Los_Angeles", utc(2026, 1, 15, 12, 0, 0)).unwrap();
        assert_eq!(january.timezone, "America/Los_Angeles");
        assert_eq!(january.start, utc(2026, 1, 1, 8, 0, 0));
        assert_eq!(january.end, utc(2026, 2, 1, 8, 0, 0));
        assert_eq!(elapsed_seconds(&january), 744 * 3600);
        assert!(!january.partial);
    }

    #[test]
    fn timezone_change_starts_at_the_next_midnight_in_the_new_timezone() {
        let requested_at = utc(2026, 6, 15, 18, 0, 0);
        let change =
            schedule_timezone_change(&open_los_angeles(), "America/New_York", requested_at)
                .unwrap();

        let next_new_york_midnight = utc(2026, 6, 16, 4, 0, 0);
        let next_los_angeles_midnight = utc(2026, 6, 16, 7, 0, 0);
        assert!(change.opened.effective_from > requested_at);
        assert_eq!(change.opened.effective_from, next_new_york_midnight);
        assert_ne!(change.opened.effective_from, next_los_angeles_midnight);
        assert_eq!(change.closed.effective_from, utc(2026, 6, 1, 7, 0, 0));
        assert_eq!(change.closed.effective_until, Some(next_new_york_midnight));
        assert_eq!(change.closed.timezone, "America/Los_Angeles");
        assert_eq!(change.opened.timezone, "America/New_York");
        assert_eq!(change.opened.effective_until, None);

        let at_midnight = utc(2026, 6, 16, 4, 0, 0);
        let waits =
            schedule_timezone_change(&open_los_angeles(), "America/New_York", at_midnight).unwrap();
        assert_eq!(waits.opened.effective_from, utc(2026, 6, 17, 4, 0, 0));
        assert_ne!(waits.opened.effective_from, at_midnight);

        let after_new_midnight = utc(2026, 6, 16, 5, 0, 0);
        let following =
            schedule_timezone_change(&open_los_angeles(), "America/New_York", after_new_midnight)
                .unwrap();
        assert_eq!(following.opened.effective_from, utc(2026, 6, 17, 4, 0, 0));
        assert_ne!(following.opened.effective_from, utc(2026, 6, 16, 7, 0, 0));
    }

    #[test]
    fn closing_a_period_does_not_reinterpret_earlier_buckets() {
        let denver = TimezonePeriod {
            timezone: "America/Denver".to_owned(),
            effective_from: utc(2026, 1, 1, 7, 0, 0),
            effective_until: Some(utc(2026, 2, 1, 7, 0, 0)),
        };
        let original_denver = daily_buckets(&denver).unwrap();

        let change = schedule_timezone_change(
            &open_los_angeles(),
            "America/New_York",
            utc(2026, 6, 15, 18, 0, 0),
        )
        .unwrap();
        let rebuilt_denver = daily_buckets(&denver).unwrap();
        assert_eq!(rebuilt_denver, original_denver);
        assert_eq!(rebuilt_denver.len(), 31);
        assert!(
            rebuilt_denver
                .iter()
                .all(|bucket| !bucket.partial && bucket.timezone == "America/Denver")
        );
        assert_eq!(
            rebuilt_denver.first().unwrap().start,
            utc(2026, 1, 1, 7, 0, 0)
        );
        assert_eq!(rebuilt_denver.last().unwrap().end, utc(2026, 2, 1, 7, 0, 0));

        let january_15 = daily_bucket("America/Denver", utc(2026, 1, 15, 18, 0, 0)).unwrap();
        assert_eq!(january_15.start, utc(2026, 1, 15, 7, 0, 0));
        assert_eq!(january_15.end, utc(2026, 1, 16, 7, 0, 0));
        assert_eq!(
            rebuilt_denver
                .iter()
                .find(|bucket| bucket.start == january_15.start),
            Some(&january_15)
        );

        let rebuilt = daily_buckets(&change.closed).unwrap();
        assert!(
            rebuilt
                .iter()
                .all(|bucket| bucket.timezone == "America/Los_Angeles")
        );
        let june_14 = daily_bucket("America/Los_Angeles", utc(2026, 6, 14, 18, 0, 0)).unwrap();
        assert_eq!(june_14.start, utc(2026, 6, 14, 7, 0, 0));
        assert_eq!(june_14.end, utc(2026, 6, 15, 7, 0, 0));
        assert_eq!(
            rebuilt.iter().find(|bucket| bucket.start == june_14.start),
            Some(&june_14)
        );
    }

    #[test]
    fn shortened_los_angeles_day_cut_by_new_york_midnight_is_partial() {
        let change = schedule_timezone_change(
            &open_los_angeles(),
            "America/New_York",
            utc(2026, 6, 15, 18, 0, 0),
        )
        .unwrap();
        let buckets = daily_buckets(&change.closed).unwrap();
        assert_eq!(buckets.len(), 15);

        let boundary = buckets
            .iter()
            .find(|bucket| bucket.start == utc(2026, 6, 15, 7, 0, 0))
            .unwrap();
        assert!(boundary.partial);
        assert_eq!(boundary.end, utc(2026, 6, 16, 4, 0, 0));
        assert_eq!(boundary.timezone, "America/Los_Angeles");
        assert_eq!(elapsed_seconds(boundary), 21 * 3600);
        assert_eq!(buckets.iter().filter(|bucket| bucket.partial).count(), 1);
        assert!(
            buckets
                .iter()
                .filter(|bucket| bucket.start < boundary.start)
                .all(|bucket| !bucket.partial)
        );

        let earlier = buckets
            .iter()
            .find(|bucket| bucket.start == utc(2026, 6, 14, 7, 0, 0))
            .unwrap();
        assert!(!earlier.partial);
        assert_eq!(earlier.end, utc(2026, 6, 15, 7, 0, 0));
        assert_eq!(elapsed_seconds(earlier), 24 * 3600);

        let after_midnight = schedule_timezone_change(
            &open_los_angeles(),
            "America/New_York",
            utc(2026, 6, 16, 5, 0, 0),
        )
        .unwrap();
        let later = daily_buckets(&after_midnight.closed).unwrap();
        let current = later
            .iter()
            .find(|bucket| bucket.start == utc(2026, 6, 15, 7, 0, 0))
            .unwrap();
        assert!(!current.partial);
        assert_eq!(current.end, utc(2026, 6, 16, 7, 0, 0));
        let cut = later
            .iter()
            .find(|bucket| bucket.start == utc(2026, 6, 16, 7, 0, 0))
            .unwrap();
        assert!(cut.partial);
        assert_eq!(cut.end, utc(2026, 6, 17, 4, 0, 0));
        assert_eq!(cut.timezone, "America/Los_Angeles");
    }

    #[test]
    fn unknown_timezone_is_rejected() {
        let instant = utc(2026, 6, 15, 18, 0, 0);
        assert!(daily_bucket("Not/A_Timezone", instant).is_err());
        assert!(monthly_bucket("Not/A_Timezone", instant).is_err());
    }
}
