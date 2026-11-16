import assert from "node:assert/strict";
import test from "node:test";
import { normalize, parseJson } from "./lab.mjs";

const good = {
    title: "Why the sky is blue",
    framing: "Three rival reasons the daytime sky is blue.",
    hypotheses: [
        { id: "h1", name: "Rayleigh scattering", explanation: "Air scatters short wavelengths more.", prediction: "Violet end dominates the sky's spectrum.", shape: "falling" },
        { id: "h2", name: "Reflection of the ocean", explanation: "The sky mirrors the sea.", prediction: "Blue follows water, not air.", shape: "flat" },
        { id: "h3", name: "Oxygen absorption", explanation: "Oxygen absorbs red and re-emits blue.", prediction: "Blue tracks oxygen density.", shape: "peak" },
    ],
    experiments: [
        { observation: "At 40 km the sky is nearly black even at noon.", consistent: ["h1", "h3"], explanation: "Both need air." },
        { observation: "Over a desert the sky is still blue.", consistent: ["h1", "h3"], explanation: "Not the ocean." },
        { observation: "Sunset is red while the zenith stays blue.", consistent: ["h1"], explanation: "Long paths remove blue." },
    ],
};

test("accepts a well-formed lab and keeps the fields", () => {
    const lab = normalize(good);
    assert.equal(lab.hypotheses.length, 3);
    assert.equal(lab.experiments.length, 3);
    assert.equal(lab.hypotheses[0].shape, "falling");
});

test("strips a markdown fence and surrounding prose", () => {
    const raw = "Here you go:\n```json\n" + JSON.stringify(good) + "\n```\nHope that helps.";
    const lab = normalize(parseJson(raw));
    assert.equal(lab.title, "Why the sky is blue");
});

test("parses an object with braces inside strings", () => {
    const raw = 'prefix {"a":"} not the end {","b":{"c":1}} suffix';
    assert.deepEqual(parseJson(raw), { a: "} not the end {", b: { c: 1 } });
});

test("reports a truncated reply instead of throwing a JSON error", () => {
    assert.throws(() => parseJson('{"hypotheses":[{"id":"h1"'), /cut off/);
});

test("keeps a survivor and a hypothesis falsified by the first observation", () => {
    const lab = normalize(structuredClone(good));
    const ruledOut = new Set(
        lab.experiments.flatMap((e) =>
            lab.hypotheses.map((h) => h.id).filter((id) => !e.consistent.includes(id)),
        ),
    );
    // h1 survives every observation; h2 is contradicted by all of them.
    assert.equal(ruledOut.has("h1"), false);
    assert.equal(ruledOut.has("h2"), true);
});

test("rejects a lab where no observation rules anything out", () => {
    const bad = structuredClone(good);
    const all = bad.hypotheses.map((h) => h.id);
    bad.experiments.forEach((e) => { e.consistent = [...all]; });
    assert.throws(() => normalize(bad), /rules out any explanation/);
});

test("rejects an observation that matches nothing", () => {
    const bad = structuredClone(good);
    bad.experiments[0].consistent = ["nope"];
    assert.throws(() => normalize(bad), /matches no explanation/);
    bad.hypotheses[0].id = "h1";
});

test("allows a contradicted explanation to be listed again; the game filters it", () => {
    const plausible = normalize(structuredClone(good));
    // Falsification is applied by the renderer, not by the data, so a later
    // match for h2 must survive validation rather than throw.
    plausible.experiments[2].consistent.push("h2");
    const again = normalize(plausible);
    assert.equal(again.experiments[2].consistent.includes("h2"), true);
});

test("rejects duplicate ids", () => {
    const bad = structuredClone(good);
    bad.hypotheses[1].id = "h1";
    assert.throws(() => normalize(bad), /duplicate/);
});

test("rejects a lab where every observation matches the same explanation", () => {
    const bad = { ...structuredClone(good), hypotheses: good.hypotheses.slice(0, 2),
        experiments: [
            { observation: "a", consistent: ["h1"], explanation: "a" },
            { observation: "b", consistent: ["h1"], explanation: "b" },
        ] };
    assert.throws(() => normalize(bad), /matched the same/);
});

test("falls back to a flat shape for an unknown shape", () => {
    const lab = normalize(structuredClone(good));
    assert.equal(lab.hypotheses.every((h) => h.shape), true);
    const odd = structuredClone(good);
    odd.hypotheses[0].shape = "spiral";
    assert.equal(normalize(odd).hypotheses[0].shape, "flat");
});

test("clamps long text so a runaway model cannot blow up the page", () => {
    const long = structuredClone(good);
    long.hypotheses[0].explanation = "x".repeat(5000);
    long.experiments[0].observation = "y".repeat(5000);
    const lab = normalize(long);
    assert.equal(lab.hypotheses[0].explanation.length, 400);
    assert.equal(lab.experiments[0].observation.length, 400);
});

test("falsification is cumulative and does not revive", async () => {
    const { applyObservation, initialState } = await import("./lab.mjs");
    const lab = normalize(structuredClone(good));
    let state = initialState(lab);
    // h2 is contradicted by observation 1. Make the data list it again for
    // observation 3; it must stay dead anyway.
    lab.experiments[2].consistent.push("h2");
    assert.equal(lab.experiments[2].consistent.includes("h2"), true);
    state = { ...state, picked: new Set(lab.experiments[0].consistent) };
    const after = applyObservation(state, lab.experiments[0]);
    assert.equal(after.dead.has("h2"), true);
    assert.equal(after.survivors.includes("h2"), false);
    // A later match does not bring it back.
    state = { ...state, dead: after.dead, picked: new Set(["h2"]) };
    const later = applyObservation(state, lab.experiments[2]);
    assert.equal(later.dead.has("h2"), true);
});

test("an exact pick counts only the explanations still alive", async () => {
    const { applyObservation, initialState } = await import("./lab.mjs");
    const lab = normalize(structuredClone(good));
    let state = initialState(lab);
    state = { ...state, picked: new Set(lab.experiments[0].consistent) };
    const after = applyObservation(state, lab.experiments[0]);
    assert.equal(after.exact, true);
});
