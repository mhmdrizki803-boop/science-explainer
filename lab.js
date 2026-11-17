// Pure parsing/validation for the falsification lab, split out so it can be
// tested without a browser. app.js owns the DOM; this file owns the rules.

const SHAPES = {
    rising: [10, 26, 40, 52, 44],
    falling: [52, 40, 26, 14, 8],
    peak: [8, 34, 52, 34, 8],
    flat: [28, 30, 29, 31, 28],
    step: [10, 10, 46, 46, 46],
    noise: [24, 44, 18, 40, 22],
};

/** Pull the first balanced JSON object out of a reply that may be fenced. */
function parseJson(raw) {
    let text = String(raw).trim();
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const start = text.indexOf("{");
    if (start === -1) throw new Error("The model did not return JSON.");
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === "\\") escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0) return JSON.parse(text.slice(start, i + 1));
        }
    }
    throw new Error("The model's JSON was cut off — try again.");
}

/** Reject replies that would make the exercise meaningless. */
function normalize(data) {
    const hyps = Array.isArray(data?.hypotheses) ? data.hypotheses : [];
    const exps = Array.isArray(data?.experiments) ? data.experiments : [];
    if (hyps.length < 2 || hyps.length > 4) throw new Error("The model returned the wrong number of explanations.");
    if (exps.length < 2 || exps.length > 4) throw new Error("The model returned the wrong number of experiments.");

    const ids = hyps.map((h) => String(h?.id ?? "").trim());
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
        throw new Error("The model returned duplicate explanation ids.");
    }

    const hypotheses = hyps.map((h, i) => ({
        id: ids[i],
        name: String(h?.name || `Explanation ${i + 1}`).slice(0, 80),
        explanation: String(h?.explanation || "").slice(0, 400),
        prediction: String(h?.prediction || "").slice(0, 300),
        shape: SHAPES[h?.shape] ? h.shape : "flat",
    }));

    const experiments = exps.map((e, i) => {
        const consistent = (Array.isArray(e?.consistent) ? e.consistent : [])
            .map((x) => String(x).trim())
            .filter((x) => ids.includes(x));
        if (!consistent.length) throw new Error(`Experiment ${i + 1} matches no explanation.`);
        return {
            observation: String(e?.observation || "").slice(0, 400),
            consistent: [...new Set(consistent)],
            explanation: String(e?.explanation || "").slice(0, 400),
        };
    });

    // A game where one observation rules out nothing is not a test.
    const everMatched = new Set(experiments.flatMap((e) => e.consistent));
    if (everMatched.size < 2) throw new Error("Every experiment matched the same explanation.");

    // A lab that rules nothing out teaches nothing.
    const rulesSomethingOut = experiments.some((e) => e.consistent.length < ids.length);
    if (!rulesSomethingOut) throw new Error("No observation rules out any explanation.");

    // Falsification is cumulative in the game, so the data does not have to be
    // monotonic: an explanation contradicted by observation 1 may still be
    // listed as a match for observation 3. The renderer filters those out,
    // because a dead explanation predicting a later observation does not
    // revive it. Requiring monotonic data here would reject honest model output.

    return {
        title: String(data?.title || "Falsification lab").slice(0, 90),
        framing: String(data?.framing || "").slice(0, 400),
        hypotheses,
        experiments,
    };
}

/**
 * The live, cumulative state of a run. Falsification is permanent: once an
 * observation contradicts an explanation, no later observation can revive it,
 * even if the model listed it as a match. Returning this from one function
 * keeps the rule in one place instead of spread through the renderer.
 */
function applyObservation(state, experiment) {
    const expected = new Set(
        experiment.consistent.filter((id) => !state.dead.has(id)),
    );
    // Observations can be answered in any order, so a pick set can still hold an
    // explanation that an earlier answer already falsified: the button is removed
    // from the remaining questions, but the pick itself was recorded before that.
    // A dead explanation cannot be part of an answer, so drop those picks instead
    // of counting them against the player.
    const picked = new Set(
        [...state.picked].filter((id) => !state.dead.has(id)),
    );
    const exact =
        expected.size === picked.size && [...expected].every((id) => picked.has(id));
    const nextDead = new Set(state.dead);
    for (const id of state.allIds) {
        if (!experiment.consistent.includes(id)) nextDead.add(id);
    }
    return {
        dead: nextDead,
        exact,
        expected,
        survivors: state.allIds.filter((id) => !nextDead.has(id)),
    };
}

function initialState(lab) {
    return {
        allIds: lab.hypotheses.map((h) => h.id),
        dead: new Set(),
        picked: new Set(),
        solved: 0,
    };
}

// The page loads this file with a plain <script>, so attach the API to window.
// Node tests read it through lab.mjs, which evaluates this file in a VM.
if (typeof window !== "undefined") {
    window.ScienceLab = { SHAPES, parseJson, normalize, applyObservation, initialState };
}
