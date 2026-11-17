// Renders the real app.js against a real DOM and plays the game, so a broken
// selector or a rule that never fires fails here instead of in the browser.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const LAB = {
    title: "Why the sky is blue",
    framing: "Three rival reasons the daytime sky is blue.",
    hypotheses: [
        { id: "h1", name: "Rayleigh scattering", explanation: "Air scatters short waves more.", prediction: "Blue dominates.", shape: "falling" },
        { id: "h2", name: "Ocean reflection", explanation: "The sky mirrors the sea.", prediction: "Blue follows water.", shape: "flat" },
        { id: "h3", name: "Oxygen glow", explanation: "Oxygen re-emits blue.", prediction: "Blue tracks oxygen.", shape: "peak" },
    ],
    experiments: [
        { observation: "At 40 km the sky is black at noon.", consistent: ["h1", "h3"], explanation: "Both need air." },
        { observation: "The sky over a desert is still blue.", consistent: ["h1", "h3"], explanation: "Not the ocean." },
        { observation: "Sunset is red while the zenith stays blue.", consistent: ["h1"], explanation: "Long paths remove blue." },
    ],
};

function boot() {
    const dom = new JSDOM(readFileSync("index.html", "utf8"), {
        runScripts: "outside-only",
        url: "https://science-explainer.test/",
        pretendToBeVisual: true,
    });
    const { window } = dom;
    window.eval(readFileSync("lab.js", "utf8"));
    // app.js expects a key and the client; stub the network boundary only.
    window.PolliClient = {
        chatCompletion: async () => JSON.stringify(LAB),
    };
    window.sessionStorage.setItem("polli_byop_key", "sk_test");
    window.eval(readFileSync("app.js", "utf8"));
    return window;
}

const tick = () => new Promise((r) => setTimeout(r, 20));

test("builds the lab and renders one card per explanation", async () => {
    const w = boot();
    w.document.getElementById("topic").value = "Why is the sky blue";
    w.document.getElementById("go").click();
    await tick();
    assert.equal(w.document.querySelectorAll(".hyp").length, 3);
    assert.equal(w.document.querySelectorAll(".exp").length, 3);
    assert.equal(w.document.getElementById("out").style.display, "block");
});

test("answering every observation reports the survivor", async () => {
    const w = boot();
    w.document.getElementById("go").click();
    await tick();

    const sections = [...w.document.querySelectorAll(".exp")];
    for (const [i, section] of sections.entries()) {
        const expected = LAB.experiments[i].consistent;
        for (const id of expected) {
            const b = section.querySelector(`.choice[data-id="${id}"]`);
            assert.ok(b, `choice ${id} missing in observation ${i + 1}`);
            b.click();
        }
        section.querySelector("button.ghost").click();
        await tick();
    }
    const verdict = w.document.getElementById("verdict").textContent;
    assert.match(verdict, /Rayleigh scattering/);
    assert.doesNotMatch(verdict, /Ocean reflection/);
    assert.match(verdict, /not proof/);
});

test("a falsified explanation disappears from later questions", async () => {
    const w = boot();
    w.document.getElementById("go").click();
    await tick();

    const first = w.document.querySelectorAll(".exp")[0];
    // h2 is contradicted by observation 1: pick only h1/h3.
    for (const id of ["h1", "h3"]) first.querySelector(`.choice[data-id="${id}"]`).click();
    first.querySelector("button.ghost").click();
    await tick();

    const later = [...w.document.querySelectorAll(".exp")].slice(1);
    for (const section of later) {
        assert.equal(section.querySelector('.choice[data-id="h2"]'), null);
    }
});

test("a wrong pick marks the explanation falsified", async () => {
    const w = boot();
    w.document.getElementById("go").click();
    await tick();

    const first = w.document.querySelectorAll(".exp")[0];
    first.querySelector('.choice[data-id="h1"]').click();
    first.querySelector("button.ghost").click();
    await tick();

    // Observation 1 matches h1 and h3, so picking only h1 makes h2 wrong and
    // it must be marked falsified. h3 is still alive at this point.
    const dead = w.document.querySelector('.hyp[data-id="h2"]');
    assert.match(dead.className, /dead/);
    assert.match(dead.querySelector(".tag").textContent, /falsified/);
    const alive = w.document.querySelector('.hyp[data-id="h3"]');
    assert.doesNotMatch(alive.className, /dead/);
});

test("rejects a reply that is not JSON with a readable message", async () => {
    const w = boot();
    w.PolliClient.chatCompletion = async () => "I cannot help with that.";
    w.document.getElementById("go").click();
    await tick();
    assert.match(w.document.getElementById("status").textContent, /did not return JSON/);
    assert.equal(w.document.getElementById("out").style.display, "");
});

test("a pick made before an earlier answer cannot spoil a later question", async () => {
    const w = boot();
    w.document.getElementById("go").click();
    await tick();

    const sections = [...w.document.querySelectorAll(".exp")];
    // Pick h2 for the last question while it is still alive.
    for (const id of ["h1", "h2"])
        sections[2].querySelector(`.choice[data-id="${id}"]`).click();

    // Observation 1 falsifies h2, so the last question loses that choice and
    // the pick recorded before the answer must go with it.
    for (const id of ["h1", "h3"])
        sections[0].querySelector(`.choice[data-id="${id}"]`).click();
    sections[0].querySelector("button.ghost").click();
    await tick();

    assert.equal(sections[2].querySelector('.choice[data-id="h2"]'), null);
    sections[2].querySelector("button.ghost").click();
    await tick();
    // Observation 3 matches only h1; the stale h2 pick must not make it inexact.
    assert.match(sections[2].querySelector(".verdict").textContent, /^Exact\./);
});

test("answering out of order leaves a settled question untouched", async () => {
    const w = boot();
    w.document.getElementById("go").click();
    await tick();

    const sections = [...w.document.querySelectorAll(".exp")];
    // Answer the last question first: only h1 survives, so h2 and h3 die.
    sections[2].querySelector('.choice[data-id="h1"]').click();
    sections[2].querySelector("button.ghost").click();
    await tick();

    // Answer the first question afterwards.
    sections[0].querySelector('.choice[data-id="h1"]').click();
    sections[0].querySelector("button.ghost").click();
    await tick();

    // The settled question keeps what the player saw and answered...
    assert.equal(sections[2].querySelectorAll(".choice").length, 3);
    // ...while the one still open loses the falsified choices.
    assert.equal(sections[1].querySelector('.choice[data-id="h2"]'), null);
    assert.equal(sections[1].querySelector('.choice[data-id="h3"]'), null);
});
