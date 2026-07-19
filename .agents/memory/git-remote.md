---
name: GitHub Remote Name
description: The GitHub remote for this project is named 'github', not 'origin'.
---

# GitHub Remote

## Rule
Always use `git push github main` — the remote is named `github`, not `origin`.

**Why:** The Replit environment uses `origin` for its own versioning; the user's GitHub repo was added as a separate remote named `github`.
