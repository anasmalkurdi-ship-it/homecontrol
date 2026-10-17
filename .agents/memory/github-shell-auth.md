---
name: GitHub shell authentication
description: Troubleshooting when Replit's connected GitHub account and shell Git authentication disagree.
---

A GitHub connection can appear active while `gh auth status` reports no login and an HTTPS push is rejected for invalid credentials.

**Why:** Replit's Git provider connection and shell authentication can diverge even when the integration reports healthy.

**How to apply:** Verify shell access before promising a sync. If it fails, use Replit's Git pane or the documented secret-backed Git URL flow; never ask the user to paste a token into chat.
