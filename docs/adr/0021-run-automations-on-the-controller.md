# Run Automations on the Controller

Nemu will persist and evaluate Automations in Core on the Controller so rules keep working without cloud availability and operate on the same canonical Capabilities as direct control. Automation actions use the existing Command executor rather than a separate device-control path. Automations belong to the Home, persist after their creator leaves, and can be created, edited, disabled, or deleted by any Owner or Member. Core records the creator and last editor locally. Each Home stores a timezone so scheduled Automations continue using the Controller clock during an internet outage.

If the Controller cannot establish trustworthy time after a power loss, it pauses scheduled Automations and notifies an Owner instead of executing them at uncertain times. State-based Automations can continue when their inputs are valid.
