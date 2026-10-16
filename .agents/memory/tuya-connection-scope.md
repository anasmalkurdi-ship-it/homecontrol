---
name: Tuya connection scope
description: The user's preference for direct local device pairing instead of Tuya Cloud control.
---

The user wants to pair and control devices directly from Home Control rather than through Tuya Cloud. Do not continue cloud account linkage unless the user re-approves it. Distinguish first-time Wi-Fi/Bluetooth onboarding from local control of devices already paired in Smart Life; verify official SDK and device support before choosing an approach. Treat a supplied APK as a reference, not as an executable library or source project.

**Why:** The user explicitly changed direction and asked to pair devices from this app without using the cloud.

**How to apply:** Ask which direct-device flow they want, inspect any supplied APK for relevant metadata and supported workflows, and confirm device compatibility before implementing direct pairing.
