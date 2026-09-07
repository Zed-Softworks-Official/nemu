# Authenticate and isolate MQTT adapters

Core and each protocol adapter use separate MQTT credentials with topic-level permissions. An adapter publishes only within its protocol namespace and consumes only its Command topics. The Controller host does not expose MQTT to the external network.

Core treats adapters as partially trusted. Adapters receive no PostgreSQL, cloud, Membership, or Controller-identity credentials. Core validates every canonical payload and limits each adapter to its own Devices and topics.
