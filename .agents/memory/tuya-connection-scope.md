---
name: Tuya connection scope
description: The user's chosen Smart Life pairing and Tuya Cloud control flow for Home Control.
---

Pair devices in Smart Life, then have Home Control list and control them through the Tuya Cloud API. The saved `TUYA_UID` must exactly match the UID of the Smart Life account linked to the same Tuya Cloud project; a mismatch can cause 1106 even when services are authorized and devices are linked. Do not pursue native Smart Life SDK or direct local pairing unless the user changes direction.

**Why:** The user explicitly chose to keep pairing in Smart Life and use the platform for Home Control. Matching the linked account UID restored device listing and an OFF command was confirmed by Tuya.

**How to apply:** Keep pairing outside Home Control; troubleshoot exact UID match first, then project credentials, region, API authorization, and per-device control permission.
