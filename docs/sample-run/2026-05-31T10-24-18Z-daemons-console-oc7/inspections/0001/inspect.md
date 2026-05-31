# Inspect

## Where am I

- **URL:** file:///Users/aitoroses/repositories/agent-e2e-worktrees/codex-browser-inspect-refs/packages/harness/test/fixtures/console-app.html
- **Title:** Developer Run Console
- **Viewport:** 1280x720 (dpr 1)
- **Document:** 1280x1002 (scroll 0,0)
- **Primary heading:** Daemons
- **Active landmark:** main
- **Target:** current page (page, resolved)
- **Refs overlay:** enabled

## Summary

- Interactive elements: 34
- Landmarks: 4 (banner, navigation, main, form)
- Headings: h1×1, h2×1, h3×3
- Alerts/status: 1
- Dialogs: 1
- Forms: 1 (5 controls)
- Tables: 1
- Images: 0 (0 missing alt)

## Current visible state

- # Daemons
- ## Routing hosts for users, sessions, and credentials
- ### Active
- ### Pending
- ### Failed

**Alerts / errors:**
- Seed warning: one daemon failed its last health check.

**Dialogs / modals:**
- Confirm delete

**Visible text (top):**
- Terrarium
- ⌘K
- Theme
- Daemons
- Sessions
- Credentials
- Settings
- Routing hosts for users, sessions, and credentials
- Active
- Pending
- Failed
- Seed warning: one daemon failed its last health check.

## What can I act on

| ref | role | name | tag | box | state |
| --- | --- | --- | --- | --- | --- |
| @e1 | banner | Terrarium ⌘K Theme | — | 0,0 1280x56 | visible |
| @e2 | link | Terrarium | — | 20,19 76x18 | visible |
| @e3 | textbox | Search daemons | — | 112,11 168x34 | visible |
| @e4 | button | Open command palette | — | 1117,10 53x35 | visible |
| @e5 | button | Switch theme | — | 1186,11 74x34 | disabled |
| @e6 | navigation | Primary | — | 0,56 220x820 | visible |
| @e7 | link | Daemons | — | 12,72 196x34 | visible |
| @e8 | link | Sessions | — | 12,106 196x34 | visible |
| @e9 | link | Credentials | — | 12,140 196x34 | visible |
| @e10 | link | Settings | — | 12,174 196x34 | visible |
| @e11 | main | Daemons Routing hosts for users, sessions, and credentials A | — | 220,56 1060x820 | visible |
| @e12 | section | Daemons Routing hosts for users, sessions, and credentials | — | 244,80 1012x129 | visible |
| @e13 | heading | Daemons | h1 | 244,101 1012x38 | visible |
| @e14 | heading | Routing hosts for users, sessions, and credentials | h2 | 244,161 1012x28 | visible |
| @e15 | div | Active12 Pending3 Failed1 | — | 244,229 1012x90 | visible |
| @e16 | article | Active12 | — | 244,229 327x90 | visible |
| @e17 | heading | Active | h3 | 261,246 293x17 | visible |
| @e18 | article | Pending3 | — | 587,229 327x90 | visible |
| @e19 | heading | Pending | h3 | 604,246 293x17 | visible |
| @e20 | article | Failed1 | — | 929,229 327x90 | visible |
| @e21 | heading | Failed | h3 | 946,246 293x17 | visible |
| @e22 | alert | Seed warning: one daemon failed its last health check. | — | 244,339 1012x40 | visible |
| @e23 | form | Display name Runtime Local Docker runtime Remote runtime Sta | — | 244,399 1012x136 | visible |
| @e24 | textbox | Display name | — | 261,438 420x34 | visible |
| @e25 | combobox | Runtime | — | 693,436 420x36 | visible |
| @e26 | button | Start daemon | — | 1125,438 114x34 | visible |
| @e27 | checkbox | Auto restart | — | 265,502 13x13 | visible |
| @e28 | button | Bulk delete | — | 693,484 420x34 | disabled |
| @e29 | div | Recent events | — | 244,555 1012x140 | visible |
| @e30 | table | NameRuntimeStatus daemon-01dockeractive daemon-03dockerfaile | — | 244,715 1012x137 | visible |
| @e31 | div | Offscreen helper text (not visible) | — | -9999,0 243x18 | visible |
| @e32 | dialog | Confirm delete | — | 426,876 428x126 | visible |
| @e33 | button | Cancel | — | 447,947 74x34 | visible |
| @e34 | button | Delete | — | 525,947 70x34 | visible |

## Signals

- Console errors: 0
- Network failures: 0

## Artifacts

- [screenshot](screenshot.png)
- [inspect.json](inspect.json)

## UI tree

- `@e1` header[banner] "Terrarium ⌘K Theme" | 0,0 1280x56 | flex row gap:16px | 16px/400 rgb(17, 24, 39) bg:rgb(255, 255, 255) `[data-ui="topbar"]`
  - `@e2` a[link] "Terrarium" | 20,19 76x18 | block | 16px/700 rgb(180, 83, 9) `[data-ui="brand"]`
  - `@e3` input[textbox] "Search daemons" | 112,11 168x34 | block | 14px/400 rgb(0, 0, 0) bg:rgb(255, 255, 255) border:1px solid rgb(209, 213, 219) `[data-ui="search"]`
  - `@e4` button "Open command palette" | 1117,10 53x35 | block | 14px/400 rgb(0, 0, 0) bg:rgb(255, 255, 255) border:1px solid rgb(209, 213, 219) `[data-ui="command-palette"]`
  - `@e5` button "Switch theme" | 1186,11 74x34 | disabled | block | 14px/400 rgba(16, 16, 16, 0.3) bg:rgb(255, 255, 255) border:1px solid rgb(209, 213, 219) `[data-ui="theme-toggle"]`
- `@e6` nav[navigation] "Primary" | 0,56 220x820 | block | 16px/400 rgb(226, 232, 240) bg:rgb(15, 23, 42) `[data-ui="sidebar"]`
  - `@e7` a[link] "Daemons" | 12,72 196x34 | block | 16px/400 rgb(255, 255, 255) bg:rgb(30, 41, 59) `[data-ui="nav-daemons"]`
  - `@e8` a[link] "Sessions" | 12,106 196x34 | block | 16px/400 rgb(203, 213, 225) `[data-ui="nav-sessions"]`
  - `@e9` a[link] "Credentials" | 12,140 196x34 | block | 16px/400 rgb(203, 213, 225) `[data-ui="nav-credentials"]`
  - `@e10` a[link] "Settings" | 12,174 196x34 | block | 16px/400 rgb(203, 213, 225) `[data-ui="nav-settings"]`
- `@e11` main "Daemons Routing hosts for users, sessions, and …" | 220,56 1060x820 | flex column gap:20px | 16px/400 rgb(17, 24, 39) `[data-ui="content"]`
  - `@e12` section "Daemons Routing hosts for users, sessions, and …" | 244,80 1012x129 | block | 16px/400 rgb(17, 24, 39) `[data-ui="overview"]`
    - `@e13` h1[heading] "Daemons" | 244,101 1012x38 | block | 32px/700 rgb(17, 24, 39) `body > [data-ui="overview"] > h1:nth-of-type(1)`
    - `@e14` h2[heading] "Routing hosts for users, sessions, and credenti…" | 244,161 1012x28 | block | 24px/700 rgb(17, 24, 39) `body > [data-ui="overview"] > h2:nth-of-type(1)`
  - `@e15` div "Active12 Pending3 Failed1" | 244,229 1012x90 | grid gap:16px | 16px/400 rgb(17, 24, 39) `[data-ui="metrics"]`
    - `@e16` article "Active12" | 244,229 327x90 | block | 16px/400 rgb(17, 24, 39) bg:rgb(255, 255, 255) border:1px solid rgb(229, 231, 235) `[data-ui="card-active"]`
      - `@e17` h3[heading] "Active" | 261,246 293x17 | block | 14px/600 rgb(17, 24, 39) `body > [data-ui="card-active"] > h3:nth-of-type(1)`
    - `@e18` article "Pending3" | 587,229 327x90 | block | 16px/400 rgb(17, 24, 39) bg:rgb(255, 255, 255) border:1px solid rgb(229, 231, 235) `[data-ui="card-pending"]`
      - `@e19` h3[heading] "Pending" | 604,246 293x17 | block | 14px/600 rgb(17, 24, 39) `body > [data-ui="card-pending"] > h3:nth-of-type(1)`
    - `@e20` article "Failed1" | 929,229 327x90 | block | 16px/400 rgb(17, 24, 39) bg:rgb(255, 255, 255) border:1px solid rgb(229, 231, 235) `[data-ui="card-failed"]`
      - `@e21` h3[heading] "Failed" | 946,246 293x17 | block | 14px/600 rgb(17, 24, 39) `body > [data-ui="card-failed"] > h3:nth-of-type(1)`
  - `@e22` div[alert] "Seed warning: one daemon failed its last health…" | 244,339 1012x40 | block | 16px/400 rgb(146, 64, 14) bg:rgb(254, 243, 199) border:1px solid rgb(245, 158, 11) `[data-ui="seed-alert"]`
  - `@e23` form "Display name Runtime Local Docker runtime Remot…" | 244,399 1012x136 | grid gap:12px | 16px/400 rgb(17, 24, 39) bg:rgb(255, 255, 255) border:1px solid rgb(229, 231, 235) `[data-ui="create-form"]`
    - label "Display name" | 261,418 420x54 | flex column gap:4px | 13px/400 rgb(17, 24, 39) `body > [data-ui="create-form"] > label:nth-of-type(1)`
      - `@e24` input[textbox] "Display name" | 261,438 420x34 | block | 14px/400 rgb(0, 0, 0) bg:rgb(255, 255, 255) border:1px solid rgb(209, 213, 219) `[data-ui="daemon-name"]`
    - label "Runtime Local Docker runtime Remote runtime" | 693,416 420x56 | flex column gap:4px | 13px/400 rgb(17, 24, 39) `body > [data-ui="create-form"] > label:nth-of-type(2)`
      - `@e25` select[combobox] "Runtime" | 693,436 420x36 | block | 14px/400 rgb(0, 0, 0) bg:rgb(255, 255, 255) border:1px solid rgb(209, 213, 219) `[data-ui="runtime"]`
    - `@e26` button "Start daemon" | 1125,438 114x34 | block | 14px/400 rgb(255, 255, 255) bg:rgb(180, 83, 9) border:1px solid rgb(180, 83, 9) `[data-ui="create-daemon"]`
    - label "Auto restart" | 261,499 420x19 | flex row gap:6px | 13px/400 rgb(17, 24, 39) `body > [data-ui="create-form"] > label:nth-of-type(3)`
      - `@e27` input[checkbox] "Auto restart" | 265,502 13x13 | block | 14px/400 rgb(0, 0, 0) `[data-ui="auto-restart"]`
    - `@e28` button "Bulk delete" | 693,484 420x34 | disabled | block | 14px/400 rgba(16, 16, 16, 0.3) bg:rgb(255, 255, 255) border:1px solid rgb(209, 213, 219) `[data-ui="bulk-delete"]`
  - `@e29` div "Recent events" | 244,555 1012x140 | block | scroll 0/232 (auto) | 16px/400 rgb(17, 24, 39) bg:rgb(255, 255, 255) border:1px solid rgb(229, 231, 235) `[data-ui="log-scroll"]`
    - ul[list] "daemon-01 starteddaemon-02 starteddaemon-03 hea…" | 245,556 1010x232 | block | 16px/400 rgb(17, 24, 39) `body > [data-ui="log-scroll"] > ul:nth-of-type(1)`
      - li[listitem] "daemon-01 started" | 261,564 978x18 | list-item | 16px/400 rgb(17, 24, 39) `body > [data-ui="log-scroll"] > ul:nth-of-type(1) > li:nth-of-type(1)`
      - li[listitem] "daemon-02 started" | 261,582 978x18 | list-item | 16px/400 rgb(17, 24, 39) `body > [data-ui="log-scroll"] > ul:nth-of-type(1) > li:nth-of-type(2)`
      - li[listitem] "daemon-03 health check failed" | 261,600 978x18 | list-item | 16px/400 rgb(17, 24, 39) `body > [data-ui="log-scroll"] > ul:nth-of-type(1) > li:nth-of-type(3)`
      - li[listitem] "daemon-04 started" | 261,618 978x18 | list-item | 16px/400 rgb(17, 24, 39) `body > [data-ui="log-scroll"] > ul:nth-of-type(1) > li:nth-of-type(4)`
      - li[listitem] "daemon-05 started" | 261,636 978x18 | list-item | 16px/400 rgb(17, 24, 39) `body > [data-ui="log-scroll"] > ul:nth-of-type(1) > li:nth-of-type(5)`
      - li[listitem] "daemon-06 stopped" | 261,654 978x18 | list-item | 16px/400 rgb(17, 24, 39) `body > [data-ui="log-scroll"] > ul:nth-of-type(1) > li:nth-of-type(6)`
      - li[listitem] "daemon-07 started" | 261,672 978x18 | list-item | 16px/400 rgb(17, 24, 39) `body > [data-ui="log-scroll"] > ul:nth-of-type(1) > li:nth-of-type(7)`
      - li[listitem] "daemon-08 started" | 261,690 978x18 | list-item | 16px/400 rgb(17, 24, 39) `body > [data-ui="log-scroll"] > ul:nth-of-type(1) > li:nth-of-type(8)`
      - li[listitem] "daemon-09 started" | 261,708 978x18 | list-item | 16px/400 rgb(17, 24, 39) `body > [data-ui="log-scroll"] > ul:nth-of-type(1) > li:nth-of-type(9)`
      - li[listitem] "daemon-10 started" | 261,726 978x18 | hidden:offscreen | list-item | 16px/400 rgb(17, 24, 39) `body > [data-ui="log-scroll"] > ul:nth-of-type(1) > li:nth-of-type(10)`
      - li[listitem] "daemon-11 started" | 261,744 978x18 | hidden:offscreen | list-item | 16px/400 rgb(17, 24, 39) `body > [data-ui="log-scroll"] > ul:nth-of-type(1) > li:nth-of-type(11)`
      - li[listitem] "daemon-12 started" | 261,762 978x18 | hidden:offscreen | list-item | 16px/400 rgb(17, 24, 39) `body > [data-ui="log-scroll"] > ul:nth-of-type(1) > li:nth-of-type(12)`
  - `@e30` table "NameRuntimeStatus daemon-01dockeractive daemon-…" | 244,715 1012x137 | table | 16px/400 rgb(17, 24, 39) bg:rgb(255, 255, 255) border:1px solid rgb(229, 231, 235) `[data-ui="daemons-table"]`
    - thead "NameRuntimeStatus" | 245,715 1011x34 | table-header-group | 16px/400 rgb(17, 24, 39) `body > [data-ui="daemons-table"] > thead:nth-of-type(1)`
      - tr "NameRuntimeStatus" | 245,715 1011x34 | table-row | 16px/400 rgb(17, 24, 39) `body > [data-ui="daemons-table"] > thead:nth-of-type(1) > tr:nth-of-type(1)`
        - th "Name" | 245,715 404x34 | table-cell | 14px/700 rgb(17, 24, 39) `body > [data-ui="daemons-table"] > thead:nth-of-type(1) > tr:nth-of-type(1) > th:nth-of-type(1)`
        - th "Runtime" | 648,715 327x34 | table-cell | 14px/700 rgb(17, 24, 39) `body > [data-ui="daemons-table"] > thead:nth-of-type(1) > tr:nth-of-type(1) > th:nth-of-type(2)`
        - th "Status" | 976,715 280x34 | table-cell | 14px/700 rgb(17, 24, 39) `body > [data-ui="daemons-table"] > thead:nth-of-type(1) > tr:nth-of-type(1) > th:nth-of-type(3)`
    - tbody "daemon-01dockeractive daemon-03dockerfailed dae…" | 245,749 1011x102 | hidden:offscreen | table-row-group | 16px/400 rgb(17, 24, 39) `body > [data-ui="daemons-table"] > tbody:nth-of-type(1)`
      - tr "daemon-01dockeractive" | 245,749 1011x34 | hidden:offscreen | table-row | 16px/400 rgb(17, 24, 39) `body > [data-ui="daemons-table"] > tbody:nth-of-type(1) > tr:nth-of-type(1)`
        - td "daemon-01" | 245,749 404x34 | hidden:offscreen | table-cell | 14px/400 rgb(17, 24, 39) `body > [data-ui="daemons-table"] > tbody:nth-of-type(1) > tr:nth-of-type(1) > td:nth-of-type(1)`
        - td "docker" | 648,749 327x34 | hidden:offscreen | table-cell | 14px/400 rgb(17, 24, 39) `body > [data-ui="daemons-table"] > tbody:nth-of-type(1) > tr:nth-of-type(1) > td:nth-of-type(2)`
        - td "active" | 976,749 280x34 | hidden:offscreen | table-cell | 14px/400 rgb(17, 24, 39) `body > [data-ui="daemons-table"] > tbody:nth-of-type(1) > tr:nth-of-type(1) > td:nth-of-type(3)`
      - tr "daemon-03dockerfailed" | 245,783 1011x34 | hidden:offscreen | table-row | 16px/400 rgb(17, 24, 39) `body > [data-ui="daemons-table"] > tbody:nth-of-type(1) > tr:nth-of-type(2)`
        - td "daemon-03" | 245,783 404x34 | hidden:offscreen | table-cell | 14px/400 rgb(17, 24, 39) `body > [data-ui="daemons-table"] > tbody:nth-of-type(1) > tr:nth-of-type(2) > td:nth-of-type(1)`
        - td "docker" | 648,783 327x34 | hidden:offscreen | table-cell | 14px/400 rgb(17, 24, 39) `body > [data-ui="daemons-table"] > tbody:nth-of-type(1) > tr:nth-of-type(2) > td:nth-of-type(2)`
        - td "failed" | 976,783 280x34 | hidden:offscreen | table-cell | 14px/400 rgb(17, 24, 39) `body > [data-ui="daemons-table"] > tbody:nth-of-type(1) > tr:nth-of-type(2) > td:nth-of-type(3)`
      - tr "daemon-04remoteactive" | 245,817 1011x34 | hidden:offscreen | table-row | 16px/400 rgb(17, 24, 39) `body > [data-ui="daemons-table"] > tbody:nth-of-type(1) > tr:nth-of-type(3)`
        - td "daemon-04" | 245,817 404x34 | hidden:offscreen | table-cell | 14px/400 rgb(17, 24, 39) `body > [data-ui="daemons-table"] > tbody:nth-of-type(1) > tr:nth-of-type(3) > td:nth-of-type(1)`
        - td "remote" | 648,817 327x34 | hidden:offscreen | table-cell | 14px/400 rgb(17, 24, 39) `body > [data-ui="daemons-table"] > tbody:nth-of-type(1) > tr:nth-of-type(3) > td:nth-of-type(2)`
        - td "active" | 976,817 280x34 | hidden:offscreen | table-cell | 14px/400 rgb(17, 24, 39) `body > [data-ui="daemons-table"] > tbody:nth-of-type(1) > tr:nth-of-type(3) > td:nth-of-type(3)`
  - `@e31` div "Offscreen helper text (not visible)" | -9999,0 243x18 | hidden:aria-hidden | block absolute | 16px/400 rgb(17, 24, 39) `[data-ui="offscreen-hint"]`
- `@e32` dialog "Confirm delete" | 426,876 428x126 | hidden:offscreen | block absolute | 16px/400 rgb(0, 0, 0) bg:rgb(255, 255, 255) border:1px solid rgb(229, 231, 235) `[data-ui="confirm-dialog"]`
  - p "Delete the selected daemon? This cannot be undo…" | 447,913 386x18 | hidden:offscreen | block | 16px/400 rgb(0, 0, 0) `body > [data-ui="confirm-dialog"] > p:nth-of-type(1)`
  - `@e33` button "Cancel" | 447,947 74x34 | hidden:offscreen | inline-block | 14px/400 rgb(0, 0, 0) bg:rgb(255, 255, 255) border:1px solid rgb(209, 213, 219) `[data-ui="confirm-cancel"]`
  - `@e34` button "Delete" | 525,947 70x34 | hidden:offscreen | inline-block | 14px/400 rgb(255, 255, 255) bg:rgb(180, 83, 9) border:1px solid rgb(180, 83, 9) `[data-ui="confirm-delete"]`
