/**
 * pollinations-client.js — Pollinations text chat (BYOP).
 *
 * The Pollinations model writes the interactive visualisation for a science topic:
 * one completion returns an explanation plus a self-contained HTML document.
 * The visitor approves a scoped key with the official <polli-connect> widget, so
 * every call bills their own Pollen and no secret key is ever pasted into the page.
 *
 * Reference: https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md
 */
(function (root) {
    const API_URL = "https://gen.pollinations.ai/v1/chat/completions";
    const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";

    async function chatCompletion(messages, opts) {
        const { apiKey, model = DEFAULT_MODEL, maxTokens = 3000, temperature } = opts || {};
        if (!apiKey) {
            throw new Error("Missing Pollinations key — approve one with the Connect button first.");
        }
        const body = {
            model,
            messages: messages.map((m) => ({
                role: m.role,
                content: String(m.content).slice(0, 12000),
            })),
            max_tokens: maxTokens,
        };
        if (typeof temperature === "number") body.temperature = temperature;

        const res = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            let detail = "";
            try {
                const j = await res.json();
                detail = (j.error && (j.error.message || j.error)) || "";
            } catch (_err) { /* not JSON */ }
            throw new Error("Pollinations API error " + res.status + (detail ? " — " + detail : ""));
        }
        const data = await res.json();
        const choice = (data.choices && data.choices[0]) || {};
        const text = choice.message && choice.message.content;
        if (text === undefined || text === null || text === "") {
            throw new Error("Pollinations returned an empty reply.");
        }
        return String(text).trim();
    }

    /** Strip a wrapping markdown fence, if the model added one. */
    function stripFence(text) {
        return String(text)
            .replace(/^\s*```(?:html|markdown|md)?\s*\n?/i, "")
            .replace(/\n?```\s*$/, "")
            .trim();
    }

    /**
     * Split a delimited reply into its parts.
     * The prompt asks for `===NOTES===` … `===HTML===` … so a large HTML blob never
     * has to survive JSON string escaping.
     */
    function splitSections(text) {
        const t = String(text);
        const htmlAt = t.search(/===+\s*HTML\s*===+/i);
        if (htmlAt === -1) throw new Error("The model did not return an HTML section.");
        const head = t.slice(0, htmlAt);
        const html = t.slice(htmlAt).replace(/^===+\s*HTML\s*===+\s*/i, "");
        const notesAt = head.search(/===+\s*NOTES\s*===+/i);
        const notes = notesAt === -1 ? head : head.slice(notesAt).replace(/^===+\s*NOTES\s*===+\s*/i, "");
        return { notes: stripFence(notes), html: stripFence(html) };
    }

    root.PolliClient = { API_URL, DEFAULT_MODEL, chatCompletion, stripFence, splitSections };
})(typeof self !== "undefined" ? self : globalThis);
