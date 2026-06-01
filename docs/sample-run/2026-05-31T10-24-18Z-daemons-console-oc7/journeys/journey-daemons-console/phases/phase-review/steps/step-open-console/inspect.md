# UI Snapshot

URL: fixture://console-app.html
Title: Developer Run Console
Viewport: 1280×720
Stats: 38 nodes · 15 interactive · depth 3
Signals: 0 console errors · 0 network failures

## Headings

- h1 "Daemons" [@h1]
- h2 "Routing hosts for users, sessions, and credentials" [@h2]
- h3 "Active" [@h3]
- h3 "Pending" [@h4]
- h3 "Failed" [@h5]

## By role

- banner: @s1
- link: @e1, @e5, @e6, @e7, @e8
- textbox: @e2, @e9
- button: @e3, @e4, @e11, @e13, @e14, @e15
- navigation: @s2
- main: @s3
- section: @s4
- heading: @h1, @h2, @h3, @h4, @h5
- article: @s6, @s7, @s8
- alert: @s9
- form: @s10
- combobox: @e10
- checkbox: @e12
- list: @s15
- table: @s16
- dialog: @s18

## Interactive (DOM order)

@e1 @e2 @e3 @e4 @e5 @e6 @e7 @e8 @e9 @e10 @e11 @e12 @e13 @e14 @e15

## Tree

[@s1] header role=banner "Terrarium ⌘K Theme" ⊞ 0,0 1280×56 flex-row gap:16 bg:#ffffff f:16/400
  [@e1] a role=link "Terrarium" ⊞ 20,19 76×18 f:16/700
  [@e2] input role=textbox "Search daemons" ⊞ 112,11 168×34 bg:#ffffff p:8,10 r:6 bd:1 f:14/400
  [@e3] button "Open command palette" ⊞ 1117,10 53×35 bg:#ffffff p:8,14 r:6 bd:1 f:14/400
  [@e4] button "Switch theme" ⊞ 1186,11 74×34 disabled bg:#ffffff p:8,14 r:6 bd:1 f:14/400
[@s2] nav role=navigation "Primary" ⊞ 0,56 220×820 bg:#0f172a p:16,12 f:16/400
  [@e5] a role=link "Daemons" ⊞ 12,72 196×34 bg:#1e293b p:8,10 r:6 f:16/400
  [@e6] a role=link "Sessions" ⊞ 12,106 196×34 p:8,10 r:6 f:16/400
  [@e7] a role=link "Credentials" ⊞ 12,140 196×34 p:8,10 r:6 f:16/400
  [@e8] a role=link "Settings" ⊞ 12,174 196×34 p:8,10 r:6 f:16/400
[@s3] main "Daemons Routing hosts for users, sessio…" ⊞ 220,56 1060×820 flex-col gap:20 p:24 f:16/400
  [@s4] section "Daemons Routing hosts for users, sessio…" ⊞ 244,80 1012×129 f:16/400
    [@h1] h1 role=heading "Daemons" ⊞ 244,101 1012×38 f:32/700
    [@h2] h2 role=heading "Routing hosts for users, sessions, and …" ⊞ 244,161 1012×28 f:24/700
  [@s5] div "Active12 Pending3 Failed1" ⊞ 244,229 1012×90 grid gap:16 f:16/400
    [@s6] article "Active12" ⊞ 244,229 327×90 bg:#ffffff p:16 r:10 bd:1 f:16/400
      [@h3] h3 role=heading "Active" ⊞ 261,246 293×17 f:14/600
    [@s7] article "Pending3" ⊞ 587,229 327×90 bg:#ffffff p:16 r:10 bd:1 f:16/400
      [@h4] h3 role=heading "Pending" ⊞ 604,246 293×17 f:14/600
    [@s8] article "Failed1" ⊞ 929,229 327×90 bg:#ffffff p:16 r:10 bd:1 f:16/400
      [@h5] h3 role=heading "Failed" ⊞ 946,246 293×17 f:14/600
  [@s9] div role=alert "Seed warning: one daemon failed its las…" ⊞ 244,339 1012×40 bg:#fef3c7 p:10,14 r:8 bd:1 f:16/400
  [@s10] form "Display name Runtime Local Docker runti…" ⊞ 244,399 1012×136 grid gap:12 bg:#ffffff p:16 r:10 bd:1 f:16/400
    [@s11] label "Display name" ⊞ 261,418 420×54 flex-col gap:4 f:13/400
      [@e9] input role=textbox "Display name" ⊞ 261,438 420×34 bg:#ffffff p:8,10 r:6 bd:1 f:14/400
    [@s12] label "Runtime Local Docker runtime Remote run…" ⊞ 693,416 420×56 flex-col gap:4 f:13/400
      [@e10] select role=combobox "Runtime" ⊞ 693,436 420×36 bg:#ffffff p:8,10 r:6 bd:1 f:14/400
    [@e11] button "Start daemon" ⊞ 1125,438 114×34 bg:#b45309 p:8,14 r:6 bd:1 f:14/400
    [@s13] label "Auto restart" ⊞ 261,499 420×19 flex-row gap:6 f:13/400
      [@e12] input role=checkbox "Auto restart" ⊞ 265,502 13×13 f:14/400
    [@e13] button "Bulk delete" ⊞ 693,484 420×34 disabled bg:#ffffff p:8,14 r:6 bd:1 f:14/400
  [@s14] div "Recent events" ⊞ 244,555 1012×140 scroll-y(0/232) bg:#ffffff r:8 bd:1 f:16/400
    [@s15] ul role=list "daemon-01 starteddaemon-02 starteddaemo…" ⊞ 245,556 1010×232 p:8,16 f:16/400
  [@s16] table "NameRuntimeStatus daemon-01dockeractive…" ⊞ 244,715 1012×137 bg:#ffffff r:8 bd:1 f:16/400
  [@s17] div "Offscreen helper text (not visible)" ⊞ -9999,0 243×18 hidden:aria-hidden absolute f:16/400
[@s18] dialog "Confirm delete" ⊞ 426,876 428×126 hidden:offscreen absolute bg:#ffffff p:20 r:12 bd:1 sh:lg f:16/400
  [@e14] button "Cancel" ⊞ 447,947 74×34 hidden:offscreen bg:#ffffff p:8,14 r:6 bd:1 f:14/400
  [@e15] button "Delete" ⊞ 525,947 70×34 hidden:offscreen bg:#b45309 p:8,14 r:6 bd:1 f:14/400

## Selectors

@s1 → [data-ui="topbar"]
@e1 → [data-ui="brand"]
@e2 → [data-ui="search"]
@e3 → [data-ui="command-palette"]
@e4 → [data-ui="theme-toggle"]
@s2 → [data-ui="sidebar"]
@e5 → [data-ui="nav-daemons"]
@e6 → [data-ui="nav-sessions"]
@e7 → [data-ui="nav-credentials"]
@e8 → [data-ui="nav-settings"]
@s3 → [data-ui="content"]
@s4 → [data-ui="overview"]
@h1 → [data-ui="overview"] > h1:nth-of-type(1)
@h2 → [data-ui="overview"] > h2:nth-of-type(1)
@s5 → [data-ui="metrics"]
@s6 → [data-ui="card-active"]
@h3 → [data-ui="card-active"] > h3:nth-of-type(1)
@s7 → [data-ui="card-pending"]
@h4 → [data-ui="card-pending"] > h3:nth-of-type(1)
@s8 → [data-ui="card-failed"]
@h5 → [data-ui="card-failed"] > h3:nth-of-type(1)
@s9 → [data-ui="seed-alert"]
@s10 → [data-ui="create-form"]
@s11 → [data-ui="create-form"] > label:nth-of-type(1)
@e9 → [data-ui="daemon-name"]
@s12 → [data-ui="create-form"] > label:nth-of-type(2)
@e10 → [data-ui="runtime"]
@e11 → [data-ui="create-daemon"]
@s13 → [data-ui="create-form"] > label:nth-of-type(3)
@e12 → [data-ui="auto-restart"]
@e13 → [data-ui="bulk-delete"]
@s14 → [data-ui="log-scroll"]
@s15 → [data-ui="log-scroll"] > ul:nth-of-type(1)
@s16 → [data-ui="daemons-table"]
@s17 → [data-ui="offscreen-hint"]
@s18 → [data-ui="confirm-dialog"]
@e14 → [data-ui="confirm-cancel"]
@e15 → [data-ui="confirm-delete"]

## Snippet

Terrarium · ⌘K · Theme · Daemons · Sessions · Credentials · Settings · Routing hosts for users, sessions, and credentials · Active · Pending · Failed · Seed warning: one daemon failed its last health check.
