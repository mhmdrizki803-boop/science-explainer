# Science Explainer

[![Made with pollinations.ai](https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg)](https://pollinations.ai/?ref=badge)

Name a science topic. A Pollinations model writes an **interactive visualisation** for it —
sliders, animation, live readouts — and it runs in the page. Underneath the drawing you get a
short plain-prose explanation of what to look at.

Built for quest [#19181](https://github.com/pollinations/pollinations/issues/19181)
(an app that turns a science topic into an interactive visual explanation).

## How it works

One chat completion per build. The model is asked for two delimited sections:

```
===NOTES===
3–6 sentences: what the visual shows, which quantity changes, the relation to take away.
===HTML===
A complete, self-contained HTML document — inline CSS and JS, no external requests.
```

`===HTML===` is used instead of JSON on purpose: a 100-line document does not have to survive
JSON string escaping, and a truncated response still yields a usable document up to the cut.

The document is then loaded into an iframe with `sandbox="allow-scripts"`. The generated code
can draw and animate, but it gets an opaque origin: it cannot read this page, the visitor's key,
cookies, or storage, and it cannot navigate the top frame. `<base>` tags and `target="_blank"`
attributes are stripped before insertion as well.

## Choosing the model

The model matters here, and the constraints are worth recording:

| Model | Result |
|---|---|
| `deepseek/deepseek-v4-flash` | Never finished — it reasons first, and the reasoning exhausted the output budget before any document was written, even at a 16k cap. |
| `qwen/qwen3-coder-30b-a3b-instruct` | Paid Pollen only, so on a Quest-Pollen key it returns a billing message instead of code. |
| **`openai/gpt-5-nano`** | **Works**: a complete 94-line document, drawing and controls intact, ~7.4k tokens. |

## Verification

The generated document was rendered and inspected, not just eyeballed:

- `<canvas>` 640×320 with **204,800 painted pixels** — the full canvas, so it actually draws.
- **2 range sliders** (wavelength, air density) wired to the drawing.
- Live readout: `λ=450 nm, density=0.80 → scattered fraction ≈ 0%`.

## What it is not

The explanation is generated on request by a language model. The app says so in the interface:
treat it as an illustration, not a source. It is a way to see an idea, not a citation.

## Bring Your Own Pollen (BYOP)

Visitors do not paste a secret key. The page uses the official `<polli-connect>` widget:

1. Press **Connect** and approve a scoped key on the Pollinations consent screen
   (`text` models, budget **5 Pollen**, expires after **7 days**).
2. Each build is one chat completion billed to the visitor's own Pollen.
3. The grant is revocable any time from the Pollinations dashboard.

Reference: [BRING_YOUR_OWN_POLLEN.md](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)

## Run locally

Static files, no build step:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```
