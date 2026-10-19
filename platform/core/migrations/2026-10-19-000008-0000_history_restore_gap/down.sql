ALTER TABLE history_gaps DROP CONSTRAINT IF EXISTS history_gaps_reason_check;
ALTER TABLE history_gaps ADD CONSTRAINT history_gaps_reason_check CHECK (
    reason IN ('untrusted_time', 'storage_failure', 'queue_loss', 'disk_floor')
);
