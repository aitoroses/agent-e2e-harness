# Launch v1.0 Images

This folder stores the README launch illustrations plus the prompts used to generate them.

Keep prompts here, not only in `/tmp`, so future image updates can start from the last approved prompt instead of reconstructing context from chat.

## Images

| Image | Source asset | README asset | Aspect | Prompt |
| --- | --- | --- | --- | --- |
| Hero journey | `hero-agent-journey.png` | `hero-agent-journey-readme.png` | 16:9 | `prompts/hero-agent-journey-v7.md` |
| MCP tool surface | `mcp-tool-surface.png` | `mcp-tool-surface-readme.png` | 4:3 | `prompts/mcp-tool-surface-v9.md` |
| Proof loop | `proof-loop.png` | `proof-loop-readme.png` | 16:9 | `prompts/proof-loop-v7.md` |

Older prompt iterations are kept when they explain a useful correction path.

## Regeneration

Use Nano Banana Pro from the local skill:

```sh
PROMPT_FILE=docs/launch/v1.0/prompts/mcp-tool-surface-v9.md
OUT=/tmp/mcp-tool-surface-next.png
PROMPT=$(awk '/^---$/{flag=1; next} flag' "$PROMPT_FILE")

uv run ~/.claude/skills/nano-banana-pro/scripts/generate.py "$PROMPT" \
  -o "$OUT" \
  -a 4:3 \
  -m gemini-3-pro-image-preview \
  -s 4K
```

Use `-a 16:9` for `hero-agent-journey` and `proof-loop`.

The renderer can sometimes write JPEG bytes with a `.png` filename. Normalize the approved candidate before copying it into the repo:

```sh
sips -s format png /tmp/mcp-tool-surface-next.png --out /tmp/mcp-tool-surface-next-real.png
```

## Promote An Approved Render

Replace the source image and regenerate the README-sized derivative:

```sh
cp /tmp/mcp-tool-surface-next-real.png docs/launch/v1.0/mcp-tool-surface.png
sips -Z 1800 docs/launch/v1.0/mcp-tool-surface.png \
  --out docs/launch/v1.0/mcp-tool-surface-readme.png
pngquant --quality=82-95 --speed 1 --force \
  --output docs/launch/v1.0/mcp-tool-surface-readme.png \
  docs/launch/v1.0/mcp-tool-surface-readme.png
oxipng -o 4 --strip safe docs/launch/v1.0/mcp-tool-surface-readme.png
```

For the 16:9 images, replace the filenames with `hero-agent-journey` or `proof-loop`; the README derivative should still be constrained to 1800px wide.

## Validation

Before committing, verify the files are real PNGs, keep the intended dimensions, and do not contain whitespace errors:

```sh
file docs/launch/v1.0/*.png
sips -g pixelWidth -g pixelHeight docs/launch/v1.0/*.png
git diff --check
```

Expected source dimensions:

- `hero-agent-journey.png`: `5504 x 3072`
- `mcp-tool-surface.png`: `4800 x 3584`
- `proof-loop.png`: `5504 x 3072`

Expected README derivatives:

- `hero-agent-journey-readme.png`: `1800 x 1004`
- `mcp-tool-surface-readme.png`: `1800 x 1344`
- `proof-loop-readme.png`: `1800 x 1004`
