# Separate Device state, history, and diagnostics

Postgres persists canonical Device inventory and user metadata. Core keeps current Device state in memory and rebuilds it from retained adapter messages after restart. Core stores normalized history under explicit retention and downsampling rules. Raw protocol payloads belong only in a bounded diagnostic log, not in permanent product history.

Each Capability kind defines its retention and downsampling policy. A configurable disk budget limits total History, and the Controller reserves enough storage for Commands and updates. When History reaches its budget, the Controller removes the oldest eligible data without blocking normal operation.
