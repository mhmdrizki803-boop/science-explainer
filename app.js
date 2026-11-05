(function () {
    const el = (id) => document.getElementById(id);
    const polli = window.PolliClient;

    function getKey() {
        const c = document.querySelector("polli-connect");
        return (c && c.apiKey) || sessionStorage.getItem("polli_byop_key") || "";
    }
    function setStatus(text, cls) {
        const s = el("status");
        s.textContent = text || "";
        s.className = cls || "";
    }

    const SYSTEM = [
        "You build interactive visual explanations of science for a reader who wants to see the idea, not just read it.",
        "",
        "Return exactly two sections, in this order, with these literal delimiter lines:",
        "===NOTES===",
        "Three to six sentences of plain prose. Say what the visual shows, name the quantity that changes, and state the",
        "one relation the reader should take away. Be concrete and correct. No bullet points, no headings.",
        "===HTML===",
        "A complete, self-contained HTML document. Rules:",
        "- Start with <!doctype html>. Inline every bit of CSS and JavaScript. No external requests, no CDN, no imports.",
        "- Draw with inline SVG or <canvas>. The visual must REACT to the reader: at least one range slider or button",
        "  that changes the picture, and a readout of the numbers involved.",
        "- Use a light background, readable type, and label the axes or parts directly in the drawing.",
        "- Keep it under 200 lines. No alert(), no popups, no navigation, no form submission.",
        "- If the topic resists animation, make a diagram with adjustable parameters instead of inventing a fake process.",
        "",
        "Write no text before ===NOTES=== and nothing after the closing </html>.",
    ].join("\n");

    const IDEAS = [
        "Why the sky is blue",
        "How a neuron fires an action potential",
        "Why ice floats on water",
        "How a transformer attends to words",
        "Greenhouse effect and outgoing radiation",
        "Why tides come in twice a day",
    ];

    function renderChips() {
        const box = el("chips");
        box.innerHTML = "";
        for (const idea of IDEAS) {
            const c = document.createElement("div");
            c.className = "chip";
            c.textContent = idea;
            c.addEventListener("click", () => { el("topic").value = idea; });
            box.appendChild(c);
        }
    }

    function harden(html) {
        // The frame is sandboxed already; drop anything that could still navigate it away.
        return String(html)
            .replace(/<base\b[^>]*>/gi, "")
            .replace(/\starget\s*=\s*["']?_blank["']?/gi, "");
    }

    async function build() {
        const apiKey = getKey();
        const topic = el("topic").value.trim();
        const level = el("level").value;
        if (!apiKey) { setStatus("Approve a Pollinations key first — press Connect below.", "err"); return; }
        if (topic.length < 4) { setStatus("Name a topic first.", "err"); return; }

        el("go").disabled = true;
        el("again").disabled = true;
        setStatus("The model is writing the visualisation… this usually takes 30–60 seconds.");
        try {
            const raw = await polli.chatCompletion(
                [
                    { role: "system", content: SYSTEM },
                    { role: "user", content: `Topic: ${topic}\nReader level: ${level}.` },
                ],
                {
                    apiKey,
                    // A reasoning model spends tokens thinking before it writes; this one
                    // produced a complete 94-line document with room to spare.
                    model: "openai/gpt-5-nano",
                    maxTokens: 8000,
                    temperature: 0.4,
                },
            );
            const { notes, html } = polli.splitSections(raw);
            if (!/<\s*(svg|canvas|html)/i.test(html)) {
                throw new Error("The model did not produce a drawing — try again or rephrase the topic.");
            }
            el("notes").textContent = notes;
            el("viz").srcdoc = harden(html);
            el("out").style.display = "block";
            el("again").style.display = "inline-block";
            setStatus("Built — one Pollinations request, billed to your Pollen.", "ok");
            el("out").scrollIntoView({ behavior: "smooth", block: "start" });
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
