---
name: Tuya inching data points
description: Protocol constraints for exposing Tuya's automatic-off inching setting in Home Control.
---

Tuya documents inching as an optional device function. Smart Switch Wi-Fi products expose `switch_inching` as a string data point, while Zigbee devices use a raw data point. The DP number and support can vary by product definition; do not assume every relay supports it or hard-code an ID when the device schema provides one.

**Why:** Inching changes how a physical relay behaves after every activation, and Tuya uses different DP representations across connection types. A payload accepted for one protocol or product may be wrong for another.

**How to apply:** Show inching only when the paired device advertises the function, preserve other gang/channel settings, and verify command encoding against the device's reported schema and real hardware before relying on it.
