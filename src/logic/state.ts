import * as vscode from 'vscode';

export enum StateProp {
    Scanning = 'scanning',
    Connecting = 'connecting',
    Connected = 'connected',
    Uploading = 'uploading',
    Compiling = 'compiling',
    Running = 'running',
    Debugging = 'debugging',
}

export type StateChangeEvent = {
    prop: StateProp;
    value: boolean;
};

const stateChangeEmitter = new vscode.EventEmitter<StateChangeEvent>();
export const onStateChange = stateChangeEmitter.event;
const state: Record<StateProp, boolean> = Object.fromEntries(
    Object.values(StateProp).map((prop) => [prop, false]),
) as Record<StateProp, boolean>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function withState(stateProp: StateProp, fn: Function) {
    return withComplexState({ yes: [stateProp] }, fn);
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function withStateNot(stateProp: StateProp, fn: Function) {
    return withComplexState({ not: [stateProp] }, fn);
}

export function withComplexState(
    { yes = [], not = [] }: { yes?: StateProp[]; not?: StateProp[] },
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    fn: Function,
) {
    return async (...args: unknown[]) => {
        // Check required true states
        if (yes.some((prop) => !state[prop])) return;
        // Check required false states
        if (not.some((prop) => state[prop])) return;

        // Mark all yes as busy
        yes.forEach((prop) => (state[prop] = true));
        try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            await fn(...args);
        } finally {
            yes.forEach((prop) => (state[prop] = false));
        }
    };
}

export function waitForStateWithTimeout(
    stateProp: StateProp,
    value: boolean,
    timeoutMs: number,
) {
    return new Promise((resolve) => {
        const timeoutHandle = setTimeout(() => {
            resolve(false);
        }, timeoutMs);
        const disposable = onStateChange((e) => {
            if (e.prop === stateProp && e.value === value) {
                clearTimeout(timeoutHandle);
                disposable.dispose();
                resolve(true);
            }
        });
    });
}

export function hasState(stateProp: StateProp) {
    return state[stateProp];
}

export function setState(stateProp: StateProp, value: boolean) {
    if (state[stateProp] !== value) {
        state[stateProp] = value;
        stateChangeEmitter.fire({ prop: stateProp, value });
    }
}

export function getStateString() {
    if (hasState(StateProp.Debugging)) return StateProp.Debugging;
    if (hasState(StateProp.Running)) return StateProp.Running;
    if (hasState(StateProp.Compiling)) return StateProp.Compiling;
    if (hasState(StateProp.Uploading)) return StateProp.Uploading;
    if (hasState(StateProp.Connected)) return StateProp.Connected;
    if (hasState(StateProp.Connecting)) return StateProp.Connecting;
    if (hasState(StateProp.Scanning)) return `idle and ${StateProp.Scanning}`;
    return 'idle';
}
