# Science Explainer — a falsification lab

[![Made with pollinations.ai](https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg)](https://pollinations.ai/?ref=badge)

Name a science topic. A Pollinations model writes **competing explanations**, each with a
prediction. Then you run observations: pick the explanations whose prediction matches what was
measured, and the ones that don't are **falsified**. A survivor is not a proof — it is an
explanation that has not failed yet.

Built for quest [#19181](https://github.com/pollinations/pollinations/issues/19181).

**Live:** https://science-explainer.pollinations.app

## Why this shape

The first version generated a one-shot interactive page. It was closed with a clear reason: that
shape is already covered by Glassbox Lab, Unfold and Phenomena Lab, and what would stand out is
letting the reader **test** the explanation rather than watch it.

So v2 does not render generated code at all. The model's job is narrower and more useful: produce
a small structure of rival hypotheses and the observations that separate them. The page owns the
interaction, which means:

- nothing generated is executed — the only thing rendered is text plus a fixed set of sparklines;
- the exercise cannot be won by being impressed, only by predicting correctly;
- a wrong pick is the interesting outcome, because it kills an explanation.

## How it works

One chat completion per build, with system instructions that demand a single JSON object:

```json
{
  "title": "...",
  "framing": "...",
  "hypotheses": [{ "id": "h1", "name": "...", "prediction": "...", "shape": "rising" }],
  "experiments": [{ "observation": "...", "consistent": ["h1"], "explanation": "..." }]
}
```

`lab.js` validates the reply before anything is rendered. It rejects:

- fewer than two explanations or experiments;
- duplicate or dangling ids;
- an observation that matches nothing;
- a lab where no observation rules anything out;
- every observation matching the same explanation.

Falsification is **cumulative**. `applyObservation` owns that rule:

```js
applyObservation(state, experiment) // -> { dead, exact, expected, survivors }
```

Once an explanation fails an observation it stays dead, even if a later observation lists it as a
match. A dead explanation is also removed from the choices of questions not answered yet, so it
cannot be picked back into the game. This is the one rule that makes the exercise coherent, so it
lives in one function instead of being spread through the renderer.

## Model choice, measured

`openai/gpt-5-nano` spends most of its budget reasoning before it writes. On this prompt, with a
6k cap, it failed on 2 of 4 topics with `output_token_limit_exceeded`. `reasoning_effort: "low"`
fixed it and made it faster:

| Effort | Cap | Topics finished | Time |
|---|---|---|---|
| default | 6k | 2 / 4 | 36–64 s |
| default | 16k | 2 / 4 | 37–64 s |
| **low** | **12k** | **4 / 4** | **7–16 s** |

The prompt and these numbers are pinned in `prompt.test.js`, which runs the real API when
`POLLI_KEY` is set.

## Tests

```bash
npm test          # 14 unit tests on parsing and validation, no network
npm run test:ui   # 5 tests that render app.js in jsdom and play the game
POLLI_KEY=... npm run test:prompt   # 3 real topics against the real API
```

The UI tests are the ones that matter for regressions: they click real buttons and assert that a
falsified explanation disappears from later questions.

## Bring Your Own Pollen (BYOP)

Visitors do not paste a secret. The page uses the official `<polli-connect>` widget:

1. Press **Connect** and approve a scoped key (`text` models, 5 Pollen, 7 days).
2. Each build is one chat completion billed to the visitor's own Pollen.
3. The grant is revocable from the Pollinations dashboard.

Reference: [BRING_YOUR_OWN_POLLEN.md](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)

## What it is not

The explanations and observations are generated on request by a language model. The page says so
where it matters. A surviving explanation has merely not been contradicted by the three
observations the model chose; that is a real but narrow result, and the interface says that too.

## Run locally

Static files, no build step:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```
