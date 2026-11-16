// Runs the real prompt against the real API. Skipped unless POLLI_KEY is set,
// because it spends Pollen and takes ~1 minute per topic.
import assert from "node:assert/strict";
import test from "node:test";
import { normalize, parseJson } from "./lab.mjs";

const KEY = process.env.POLLI_KEY || "";
const SYSTEM = [
    "You design a falsification exercise about a science topic.",
    "",
    "Return ONE JSON object, no markdown fence, no commentary, with this shape:",
    "{",
    '  "title": "short title, max 60 chars",',
    '  "framing": "1-2 sentences naming the question being tested",',
    '  "hypotheses": [',
    '    {"id":"h1","name":"3-5 word name","explanation":"one sentence, the mechanism",',
    '     "prediction":"what this mechanism predicts an observer would see","shape":"rising|falling|peak|flat|step|noise"}',
    "  ],",
    '  "experiments": [',
    '    {"observation":"what an observer actually measured, one sentence, concrete numbers where possible",',
    '     "consistent":["h1"],',
    '     "explanation":"one sentence on why that observation separates the explanations"}',
    "  ]",
    "}",
    "",
    "Rules:",
    "- 3 hypotheses. At least two must be genuinely plausible to a beginner; do not make the wrong ones strawmen.",
    "- Exactly 3 experiments. Each names the hypotheses whose prediction the observation MATCHES (the `consistent` list).",
    "- Once an observation contradicts a hypothesis, it must NOT appear in the `consistent` list of any later observation. Falsification is permanent; a dead explanation never comes back.",
    "- `consistent` must list at least one id and must not list every hypothesis in more than one experiment.",
    "- Every id in `consistent` must exist in `hypotheses`.",
    "- The observations must be real, checkable physics/biology/chemistry, not invented numbers that look precise.",
    "- No text before { and none after }.",
].join("\n");

const TOPICS = [
    ["Why is the sky blue", "school student"],
    ["Why ice floats on water", "undergraduate"],
    ["How a neuron fires an action potential", "curious adult, no maths"],
];

test("prompt returns a usable lab for every topic", { skip: !KEY, timeout: 300_000 }, async () => {
    for (const [topic, level] of TOPICS) {
        const res = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
            body: JSON.stringify({
                model: "openai/gpt-5-nano",
                messages: [
                    { role: "system", content: SYSTEM },
                    { role: "user", content: `Topic: ${topic}\nReader level: ${level}.` },
                ],
                max_tokens: 12000,
                reasoning_effort: "low",
            }),
        });
        if (res.status !== 200) {
            assert.fail(`${topic}: HTTP ${res.status} ${await res.text()}`);
        }
        const data = await res.json();
        const lab = normalize(parseJson(data.choices[0].message.content));
        assert.equal(lab.hypotheses.length, 3, `${topic}: hypotheses`);
        assert.equal(lab.experiments.length, 3, `${topic}: experiments`);
        console.log(`  ${topic}: "${lab.title}"`);
    }
});
