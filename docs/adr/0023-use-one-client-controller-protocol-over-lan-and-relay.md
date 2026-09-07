# Use one client–Controller protocol over LAN and Relay

Clients use one logical request, outcome, capability-manifest, and state-event protocol whether they reach a Controller over LAN or Relay. `packages/controller` hides the transport selection and automatically falls back to Relay after LAN failure. This prevents local and remote behavior from becoming separate product implementations while allowing their underlying transports to differ.
