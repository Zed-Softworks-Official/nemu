# Version Device state snapshots

Core creates a new State epoch whenever it rebuilds in-memory Device state. Within that epoch, Core assigns a monotonically increasing revision to every Device-state snapshot. Every Device-state event carries the State epoch, revision, and observation time. Clients ignore older revisions, discard cached state when the State epoch changes, and request a full snapshot after a gap.
