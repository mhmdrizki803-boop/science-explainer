(function () {
    const el = (id) => document.getElementById(id);
    const polli = window.PolliClient;
    // parseJson/normalize/SHAPES/applyObservation live in lab.js so they can be
    // tested in Node without a browser.
    const { normalize, parseJson, applyObservation, initialState, SHAPES } =
        window.ScienceLab;

    function getKey() {
        const c = document.querySelector("polli-connect");
        return (c && c.apiKey) || sessionStorage.getItem("polli_byop_key") || "";
    }
    function setStatus(text, cls) {
        const s = el("status");
        s.textContent = text || "";
        s.className = cls || "";
    }

    // v2 asks for a small machine-readable structure rather than a page of
    // prose: rival explanations, each with a prediction, plus observations that
    // separate them. The reader's job is to falsify, not to admire.
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
        "- Every id in `consistent` must exist in `hypotheses`, and each list needs at least one id.",
        "- At least one experiment must contradict at least one hypothesis, or the exercise tests nothing.",
        "- The observations must be real, checkable physics/biology/chemistry, not invented numbers that look precise.",
        "- No text before { and none after }.",
    ].join("\n");

    const IDEAS = [
        "Why is the sky blue",
        "Why ice floats on water",
        "Why tides come in twice a day",
        "How a neuron fires an action potential",
        "Why leaves are green",
        "Why the greenhouse effect warms the surface",
    ];

    function renderChips() {
        const box = el("chips");
        box.innerHTML = "";
        for (const idea of IDEAS) {
            const chip = document.createElement("div");
            chip.className = "chip";
            chip.textContent = idea;
            chip.addEventListener("click", () => { el("topic").value = idea; });
            box.appendChild(chip);
        }
    }

    function sparkline(shape) {
        const pts = SHAPES[shape] || SHAPES.flat;
        const w = 240;
        const h = 56;
        const step = w / (pts.length - 1);
        const path = pts
            .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - v).toFixed(1)}`)
            .join(" ");
        return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
            <line x1="0" y1="${h - 1}" x2="${w}" y2="${h - 1}" stroke="#232842" stroke-width="1"/>
            <path d="${path}" fill="none" stroke="#6ee7ff" stroke-width="2" stroke-linejoin="round"/>
        </svg>`;
    }

    let lab = null;
    let state = null;

    function renderHypotheses() {
        const box = el("hyps");
        box.innerHTML = "";
        for (const h of lab.hypotheses) {
            const card = document.createElement("div");
            card.className = "hyp";
            card.dataset.id = h.id;
            card.innerHTML = `
                <h3></h3>
                ${sparkline(h.shape)}
                <p class="why"></p>
                <p class="pred"></p>
                <span class="tag">untested</span>`;
            card.querySelector("h3").textContent = h.name;
            card.querySelector(".why").textContent = h.explanation;
            card.querySelector(".pred").textContent = "Predicts: " + h.prediction;
            box.appendChild(card);
        }
    }

    function paintHypotheses() {
        for (const card of document.querySelectorAll(".hyp")) {
            const id = card.dataset.id;
            const tag = card.querySelector(".tag");
            if (state.dead.has(id)) {
                card.classList.add("dead");
                card.classList.remove("survivor");
                tag.className = "tag dead";
                tag.textContent = "falsified";
            } else {
                card.classList.remove("dead");
                tag.className = "tag ok";
                tag.textContent = "not ruled out yet";
            }
            if (state.dead.size && !state.dead.has(id)) card.classList.add("survivor");
        }
    }

    function updateScore(answered) {
        const survivors = lab.hypotheses.filter((h) => !state.dead.has(h.id));
        el("score").innerHTML = "";
        const bits = [
            `Observations answered: <b>${answered}/${lab.experiments.length}</b>`,
            `Exact: <b>${state.solved}</b>`,
            `Still standing: <b>${survivors.length}</b>`,
        ];
        for (const bit of bits) {
            const span = document.createElement("span");
            span.innerHTML = bit;
            el("score").appendChild(span);
        }
        if (answered < lab.experiments.length) return;

        const verdict = el("verdict");
        verdict.className = "verdict good";
        verdict.textContent = survivors.length
            ? `Done. ${survivors.map((h) => h.name).join(", ")} survived every observation. Surviving is not proof — it means these explanations have not failed yet.`
            : "Done. Every explanation here was falsified. That is a real result, and a reason to look for one you were not offered.";
    }

    function renderExperiments() {
        const box = el("exps");
        box.innerHTML = "";
        let answered = 0;

        lab.experiments.forEach((exp, index) => {
            const section = document.createElement("section");
            section.className = "exp";

            const q = document.createElement("p");
            q.className = "q";
            q.textContent = `Observation ${index + 1}: ${exp.observation}`;

            const setup = document.createElement("p");
            setup.className = "setup";
            setup.textContent = "Which explanations predict this observation?";

            const choices = document.createElement("div");
            choices.className = "choices";

            // Only explanations still alive are selectable, so a falsified one
            // cannot be picked back into the game.
            const picked = new Set();
            const live = lab.hypotheses.filter((h) => !state.dead.has(h.id));
            for (const h of live) {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "choice";
                b.dataset.id = h.id;
                b.textContent = h.name;
                b.addEventListener("click", () => {
                    if (b.disabled) return;
                    if (picked.has(h.id)) {
                        picked.delete(h.id);
                        b.style.outline = "";
                    } else {
                        picked.add(h.id);
                        b.style.outline = "2px solid #6366f1";
                    }
                });
                choices.appendChild(b);
            }

            const submit = document.createElement("button");
            submit.type = "button";
            submit.className = "ghost";
            submit.textContent = "Record observation";
            submit.style.marginTop = "10px";

            const verdict = document.createElement("div");
            verdict.className = "verdict";

            submit.addEventListener("click", () => {
                const result = applyObservation(
                    { ...state, picked },
                    exp,
                );
                state = { ...state, dead: result.dead, solved: state.solved + (result.exact ? 1 : 0) };
                answered++;

                for (const b of choices.querySelectorAll("button")) {
                    const id = b.dataset.id;
                    b.disabled = true;
                    b.style.outline = "";
                    if (exp.consistent.includes(id)) b.classList.add("picked-right");
                    else if (picked.has(id)) b.classList.add("picked-wrong");
                }
                submit.disabled = true;

                verdict.className = "verdict " + (result.exact ? "good" : "bad");
                verdict.textContent = (result.exact ? "Exact. " : "Not quite. ") + exp.explanation;

                paintHypotheses();
                updateScore(answered);

                if (answered < lab.experiments.length) {
                    // Rebuild the remaining experiments so falsified choices
                    // disappear from the ones not answered yet.
                    rebuildRemaining(answered);
                }
            });

            section.append(q, setup, choices, submit, verdict);
            box.appendChild(section);
        });
    }

    /** After an observation lands, hide dead explanations from later questions. */
    function rebuildRemaining(answered) {
        const sections = [...el("exps").querySelectorAll(".exp")];
        sections.forEach((section, index) => {
            if (index < answered) return;
            for (const b of section.querySelectorAll(".choice")) {
                if (state.dead.has(b.dataset.id)) b.remove();
            }
        });
    }

    function renderLab() {
        el("labTitle").textContent = lab.title;
        el("labLede").textContent = lab.framing;
        state = initialState(lab);
        el("verdict").textContent = "";
        el("verdict").className = "verdict";
        renderHypotheses();
        renderExperiments();
        updateScore(0);
    }

    async function build() {
        const apiKey = getKey();
        const topic = el("topic").value.trim();
        const level = el("level").value;
        if (!apiKey) { setStatus("Approve a Pollinations key first — press Connect below.", "err"); return; }
        if (topic.length < 4) { setStatus("Name a topic first.", "err"); return; }

        el("go").disabled = true;
        el("again").disabled = true;
        setStatus("The model is writing rival explanations and the observations that separate them…");
        try {
            const raw = await polli.chatCompletion(
                [
                    { role: "system", content: SYSTEM },
                    { role: "user", content: `Topic: ${topic}\nReader level: ${level}.` },
                ],
                // gpt-5-nano spends its budget reasoning before it writes.
                // Measured on this prompt: a 6k cap failed on 2 of 4 topics,
                // and `low` effort finished all four in 7-16s instead of 36-64s.
                { apiKey, model: "openai/gpt-5-nano", maxTokens: 12000, reasoningEffort: "low" },
            );
            lab = normalize(parseJson(raw));
            renderLab();
            el("out").style.display = "block";
            el("again").style.display = "inline-block";
            setStatus("Built — one Pollinations request, billed to your Pollen.", "ok");
            // Not every embedding context has layout (and jsdom has none),
            // so a failed scroll must not turn a successful build into an error.
            el("out").scrollIntoView?.({ behavior: "smooth", block: "start" });
        } catch (err) {
            setStatus(err.message, "err");
        } finally {
            el("go").disabled = false;
            el("again").disabled = false;
        }
    }

    el("go").addEventListener("click", build);
    el("again").addEventListener("click", build);
    renderChips();
})();
