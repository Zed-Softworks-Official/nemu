# Separate Device management from Home administration

Members and Owners can commission, control, and remove Devices. Only Owners can manage Memberships and Access Clients, change networking, install updates, restore backups, configure Relay access, and inspect detailed Controller health metrics. Members see service and Device availability without access to host, database, or storage details.

All Owners are peers. An Owner can revoke any Access Client and manage any Membership, but cannot remove or demote the last Owner. Members can revoke only their own Access Clients or leave the Home.

Relay exposes the same authorized operations as LAN access. Protocols may still require physical proximity. Network changes, updates, and restores use staged operations with validation and automatic rollback.

Networking administration covers Nemu settings and IoT networks, including Relay, Controller addressing and certificates, Zigbee, Matter, and commissioning. Nemu does not manage the Ubuntu host's Wi-Fi, Ethernet, DNS, or static IP configuration. Host networking belongs to a future Nemu-managed appliance.
