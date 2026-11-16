// Test-facing ES module wrapper. lab.js stays a classic script so the browser
// can load it with a plain <script> tag; Node imports this file instead.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./lab.js", import.meta.url), "utf8");
const context = vm.createContext({ window: {} });
vm.runInContext(source, context);
const lab = context.window.ScienceLab;

// Objects created inside the VM belong to another realm, so assert.deepEqual
// rejects them even when structurally identical. Copy everything into this
// realm at the boundary.
const clone = (value) => JSON.parse(JSON.stringify(value));

export const SHAPES = lab.SHAPES;
export const parseJson = (raw) => clone(lab.parseJson(raw));
export const normalize = (data) => clone(lab.normalize(data));
export const applyObservation = (state, experiment) => {
    const result = lab.applyObservation(
        { ...state, dead: new Set(state.dead) },
        experiment,
    );
    return { ...result, dead: new Set(result.dead), expected: new Set(result.expected) };
};
export const initialState = (labData) => {
    const state = lab.initialState(labData);
    return { ...state, dead: new Set(state.dead), picked: new Set(state.picked) };
};
