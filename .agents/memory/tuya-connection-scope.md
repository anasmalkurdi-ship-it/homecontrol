---
name: Tuya connection scope
description: The user's decision to defer live Tuya control while building the room-management interface.
---

The user chose to build the rooms interface only for now rather than add sign-in. Keep room and device tiles local to the phone and clearly labeled as previews; do not connect to Tuya or send device commands until the user asks to enable secure sign-in and cloud control.

**Why:** Sending cloud commands without authentication could expose control of the user's home devices.

**How to apply:** Preserve the preview-only behavior in future UI or backend changes unless the user explicitly expands the scope.
