# Use an Expo app for internet-independent control

Nemu will provide a separate Expo mobile app before beta as its internet-independent client. Its beta scope includes Account login, explicit Home selection, a separate Access Client pairing for each Home, LAN control during internet outages, automatic Relay fallback, Device commissioning, and every operation authorized for the active Membership. Nemu will not serve the web dashboard from the Controller because distributing and updating that copy would add a second web deployment path. The Vercel-hosted dashboard remains internet-dependent. The mobile app's internal implementation remains deferred.

For mobile-assisted Matter commissioning, the Controller remains the Matter commissioner and fabric authority. The mobile app facilitates QR and Bluetooth proximity interaction without becoming an independent fabric authority or cloud-syncing Matter fabric credentials.
