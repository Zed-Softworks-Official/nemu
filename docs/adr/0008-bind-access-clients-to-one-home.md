# Bind Access Clients to one Home

An Account can hold Memberships in multiple Homes, but each Access Client belongs to one Membership. An app stores a separate Access Client credential for each Home and requires the user to select an active Home. LAN discovery and Relay routing use the selected Home. Clients never choose the first cloud pairing implicitly because an implicit choice can send a request under the wrong Home identity.
