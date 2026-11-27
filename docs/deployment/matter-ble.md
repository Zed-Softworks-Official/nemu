# Matter adapter: Bluetooth LE in the container (draft)

> **Status: draft, unverified.** Nothing on this page has run on Controller hardware yet. The hardware spike (NEM-113) settles it. Until then, treat each item as what we expect, not what we know. Update this page with what the spike finds, and remove this notice when every item below is checked on a real host.

The matter.js Matter Protocol adapter (`platform/matter-adapter`) commissions a fresh Device over Bluetooth LE and gives it the home Wi-Fi. It uses `@matter/nodejs-ble`, which drives the Bluetooth adapter directly over HCI through noble (`@stoprocent/noble` and `@stoprocent/bluetooth-hci-socket`), not BlueZ over D-Bus.

BLE is optional. When the adapter finds no Bluetooth adapter, it logs `BLE off (...)`, starts normally and commissions on-network only. CI and macOS dev machines run this way.

## Adapter settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `MATTER_BLE_ENABLE` | unset (auto) | Unset or `auto`: use BLE when `/sys/class/bluetooth/hci<id>` exists (Linux only). `true`: always try. `false`: never. |
| `MATTER_BLE_HCI_ID` | `0` | The HCI adapter number, so `1` means `hci1`. |

matter.js reads `MATTER_*` variables into its own settings, and these two are its `ble.enable` and `ble.hci.id`. The adapter decides and sets both itself.

At startup the adapter logs `BLE commissioning on hci<id>` when BLE is on. If noble then fails to start, it logs `BLE failed to start; commissioning on-network only`.

## Container requirements (expected, unverified)

1. **Host networking** (`network_mode: host`). The Rust adapter already needs it for mDNS and IPv6. Bluetooth sockets (`AF_BLUETOOTH`) aren't network-namespaced in the same way, so a host-network container should see the host's HCI adapters. The spike checks this.
2. **Capabilities: `NET_ADMIN` and `NET_RAW`.** Both are in today's compose files. noble opens a raw HCI socket (`NET_RAW`) and may bring the adapter up or down (`NET_ADMIN`). Check whether `NET_ADMIN` is still needed once the adapter runs.
3. **No device mount expected.** HCI adapters aren't `/dev` nodes. The host kernel registers them (`hciuart` for the Raspberry Pi's built-in Bluetooth, `btusb` for a USB dongle), and the container reaches them through the socket. Check that `/sys/class/bluetooth/hci0` is visible inside the container, because auto mode looks for it. If it isn't, set `MATTER_BLE_ENABLE=true`.
4. **`security_opt: apparmor:unconfined`.** Today's compose files set it. Check whether the default Docker AppArmor profile blocks raw Bluetooth sockets. Keep it until the spike shows it isn't needed.
5. **D-Bus mount can go.** `/run/dbus` and `DBUS_SYSTEM_BUS_ADDRESS` served the Rust adapter's BlueZ path. matter.js doesn't use D-Bus. Remove both in the cutover (NEM-121) once the spike confirms direct HCI works.
6. **Image base: glibc.** noble, `bluetooth-hci-socket`, `usb` and `serialport` ship prebuilt native modules for glibc `linux-x64` and `linux-arm64`, and pnpm doesn't rebuild them (`allowBuilds: false` in `pnpm-workspace.yaml`). A Debian-slim Node image uses the prebuilds as they are. Alpine (musl) would need a build toolchain in the image.

## `bluetoothd` on the host (open question)

The host's BlueZ daemon (`bluetoothd`) owns the adapter through the kernel's management interface while noble sends HCI commands on the same adapter. They may conflict: both scan, and `bluetoothd` may reset the adapter or reject connections it didn't start. noble's README (stoprocent/noble, "Running without root/sudo" and "Common problems") covers the usual fixes.

Options, in order of preference. The spike picks one:

1. Leave `bluetoothd` running, if commissioning over BLE works reliably with it.
2. Give the adapter to noble exclusively (HCI user channel): `bluetoothd` stops managing `hci0`, or is stopped (`systemctl disable --now bluetooth`). The installer would have to do this, and it costs the host any other Bluetooth use.
3. Use a dedicated USB Bluetooth dongle (`hci1`) for Matter with `MATTER_BLE_HCI_ID=1`, and leave `hci0` to the host.

## Spike checklist (NEM-113)

- [ ] Inside the container, `/sys/class/bluetooth/hci0` is visible and the adapter logs `BLE commissioning on hci0`.
- [ ] A real plug commissions over BLE onto 2.4 GHz Wi-Fi from the app's commissioning flow over LAN, with no CASE-after-AddNOC failure.
- [ ] It works with `bluetoothd` running, or the chosen option above is recorded here.
- [ ] Whether `NET_ADMIN` and `apparmor:unconfined` are needed.
- [ ] The D-Bus mount is removed and BLE still works.
- [ ] Logs from the whole attempt contain no pairing code, passcode or Wi-Fi password.
