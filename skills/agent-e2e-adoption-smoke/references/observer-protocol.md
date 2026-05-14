# Observer Protocol

Observe the worker as a user would observe a dev-tool adoption task. Do not help unless the experiment would otherwise stop producing signal.

## AOE Checks

After spawn:

```sh
aoe list --json
aoe session show --json <title-or-id>
aoe session capture --strip-ansi <title-or-id> -n 80
```

For non-Claude agents, `aoe send` deposits text but does not always press Enter. Use the actual tmux session name from:

```sh
tmux list-sessions
tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index} #{pane_current_path} #{pane_title}'
```

Then send Enter to the actual target when required:

```sh
tmux send-keys -t <actual-session-name> Enter
```

## Progress Checks

Use these without interrupting:

```sh
aoe session capture --strip-ansi <title-or-id> -n 160
find <repo> -maxdepth 3 -type f -not -path '*/.git/*' -print | sort | sed -n '1,160p'
git -C <repo> status --short
du -sh <repo>
```

## Stall Definition

Call it stalled when all are true for several minutes:

- capture shows only `Working` or no new output;
- no new files outside `.git`;
- no visible terminal command is running;
- no prompt asks for user input.

Record the stall before intervening. The stall itself is a learning about the orchestration harness, not Agent E2E.

## Minimal Intervention Ladder

1. Wait and recapture.
2. Check filesystem and session status.
3. If input was deposited but not submitted, press Enter once.
4. If trust/hooks/update prompts block the worker, surface the prompt to the human.
5. If still stuck, remove the session and restart with a shorter title or cleaner launch settings.

## Closeout Hygiene

Before declaring the smoke closed:

```sh
lsof -nP -iTCP:<app-port> -sTCP:LISTEN || true
lsof -nP -iTCP:3766 -sTCP:LISTEN || true
```

If listeners remain, ask the worker to stop them or stop them directly.
