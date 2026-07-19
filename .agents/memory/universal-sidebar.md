---
name: Sidebar — Social Only
description: AppShell sidebar shows ONLY on social routes, not on the homepage or other pages.
---

# Sidebar — Social Only

## Rule
`AppShell` renders `AppSidebar` only when `isSocialRoute(location)` is true. Non-social pages (home, DEX, launch, bots, docs) use `InnerTopNav` — a full-width sticky top bar. The home page has its own `HomeNav` component (standalone sticky header, not AppShell at all).

**Why:** The sidebar is part of the social/community section only. The homepage and other non-social pages have their own top nav. Changing this (adding sidebar everywhere) was explicitly rejected by the user.

## How to apply
- Social paths: `/community`, `/communities`, `/notifications`, `/inbox`, `/leaderboards`, `/bounties`, `/vip`, `/trenchy-ai`, `/swap`, `/dashboard`, `/social`, `/profile`, `/u/*`
- Home page (`Home.tsx`) does NOT use `<AppShell>` — it renders `<HomeNav>` directly inside a plain `<div className="min-h-screen bg-[#0a0a0f]">`.
- DEX, Launch, and other non-social pages use `<AppShell>` which automatically shows `InnerTopNav` (not the sidebar) for those routes.
- **Never add the sidebar to the homepage or other non-social pages without explicit user instruction.**
