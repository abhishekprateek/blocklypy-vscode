// https://microsoft.github.io/debug-adapter-protocol/overview

import { EventEmitter } from 'events';
import * as path from 'path';
import { checkLineForBreakpoint } from './compile-helper';
import { DebugTunnel } from './debug-tunnel';

export interface FileAccessor {
    isWindows: boolean;
    readFile(path: string): Promise<Uint8Array>;
    writeFile(path: string, contents: Uint8Array): Promise<void>;
}

export interface IRuntimeBreakpoint {
    id: number;
    line: number;
    verified: boolean;
}

interface IRuntimeStackFrame {
    index: number;
    name: string;
    file: string;
    line: number;
    column?: number;
}

interface IRuntimeStack {
    count: number;
    frames: IRuntimeStackFrame[];
}

export type IRuntimeVariableType = number | boolean | string | null | RuntimeVariable[];

export class RuntimeVariable {
    private _memory?: Uint8Array;

    public reference?: number;

    public get value() {
        return this._value;
    }

    public set value(value: IRuntimeVariableType) {
        void DebugTunnel.performSetVariable(this.name, value);
        this._value = value;
        this._memory = undefined;
    }

    public get memory() {
        //?? //!!
        if (this._memory === undefined && typeof this._value === 'string') {
            this._memory = new TextEncoder().encode(this._value);
        }
        return this._memory;
    }

    constructor(public readonly name: string, private _value: IRuntimeVariableType) {}

    public setMemory(data: Uint8Array, offset = 0) {
        //!! //??
        const memory = this.memory;
        if (!memory) {
            return;
        }

        memory.set(data, offset);
        this._memory = memory;
        this._value = new TextDecoder().decode(memory);
    }
}

export function timeout(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PybricksTunnelDebugRuntime extends EventEmitter {
    // the initial (and one and only) file we are 'debugging' //!!
    private _sourceFile: string = '';
    public get sourceFile() {
        return this._sourceFile;
    }

    public getFilePath(filename: string) {
        //!! todo use and alter sourceFile / sourceLines
        // receives filename only, with not path
        return [...this.breakPoints.keys()].find((f) => {
            return path.basename(f) === path.basename(filename);
        });
    }

    private variables = new Map<string, RuntimeVariable>();

    // the contents (= lines) of the one and only file //!! one and only
    private sourceLines: string[] = [];

    // This is the next line that will be 'executed'
    private _currentLine = 0;
    private get currentLine() {
        return this._currentLine;
    }
    private set currentLine(x) {
        this._currentLine = x;
    }
    private currentColumn: number | undefined;

    // maps from sourceFile to array of IRuntimeBreakpoint
    private breakPoints = new Map<string, IRuntimeBreakpoint[]>();

    // // all instruction breakpoint addresses
    // private instructionBreakpoints = new Set<number>();

    // all possible traps / breakpoint addresses
    private linesWithTraps = new Set<number>();

    // resume mode: 'continue' => only stop on dedicated breakpoints
    // 'step' => stop on any trap
    private resumeMode: 'continue' | 'step' = 'continue';

    // since we want to send breakpoint events, we will assign an id to every event
    // so that the frontend can match events with breakpoints.
    private breakpointId = 1;

    private breakAddresses = new Map<string, string>();

    // private namedException: string | undefined;
    // private otherExceptions = false;

    constructor(private fileAccessor: FileAccessor) {
        super();
    }

    /**
     * Start executing the given program.
     */
    public async start(
        program: string,
        stopOnEntry: boolean,
        _debug: boolean,
    ): Promise<void> {
        await this.loadSource(this.normalizePathAndCasing(program));
        await this.verifyBreakpoints(this._sourceFile);

        //-- Compile+upload is already performed via command outside
        //-- Start will be done once the debugger is attached
        DebugTunnel.registerRuntime(this);
        this.on('end', () => {
            void DebugTunnel.deregisterRuntime();
        });

        //-- stopOnEntry means that we should stop as soon as we start executing the program, so we stop on any trap
        if (stopOnEntry) {
            await this.step();
        } else {
            await this.continue();
        }
    }

    public async continue() {
        this.resumeMode = 'continue';
        await DebugTunnel.performContinueAfterTrap(false);
    }

    public async step() {
        this.resumeMode = 'step';
        await DebugTunnel.performContinueAfterTrap(true);
    }

    public stack(_startFrame: number, _endFrame: number): IRuntimeStack {
        const frames: IRuntimeStackFrame[] = [];

        frames.push({
            index: 0,
            name: `line ${this.currentLine}`,
            file: this._sourceFile,
            line: this.currentLine,
            column: undefined,
        });

        return {
            frames: frames,
            count: frames.length,
        };
    }

    public getBreakpoints(_path: string, line: number): number[] {
        if (checkLineForBreakpoint(_path, line, this.getLine(line))) {
            return [0];
        }
        return [];
    }

    public async setBreakPoint(
        path: string,
        line: number,
    ): Promise<IRuntimeBreakpoint> {
        path = this.normalizePathAndCasing(path);

        const bp: IRuntimeBreakpoint = {
            verified: false,
            line,
            id: this.breakpointId++,
        };
        let bps = this.breakPoints.get(path);
        if (!bps) {
            bps = new Array<IRuntimeBreakpoint>();
            this.breakPoints.set(path, bps);
        }
        bps.push(bp);

        await this.verifyBreakpoints(path);

        // TODO: later allow moving the breakpoint to a line that can have a breakpoint
        return bp;
    }

    public clearBreakPoint(path: string, line: number): IRuntimeBreakpoint | undefined {
        const bps = this.breakPoints.get(this.normalizePathAndCasing(path));
        if (bps) {
            const index = bps.findIndex((bp) => bp.line === line);
            if (index >= 0) {
                const bp = bps[index];
                bps.splice(index, 1);
                return bp;
            }
        }
        return undefined;
    }

    public clearBreakpoints(path: string): void {
        this.breakPoints.delete(this.normalizePathAndCasing(path));
    }

    // public setDataBreakpoint(
    //     address: string,
    //     accessType: 'read' | 'write' | 'readWrite',
    // ): boolean {
    //     const x = accessType === 'readWrite' ? 'read write' : accessType;

    //     const t = this.breakAddresses.get(address);
    //     if (t) {
    //         if (t !== x) {
    //             this.breakAddresses.set(address, 'read write');
    //         }
    //     } else {
    //         this.breakAddresses.set(address, x);
    //     }
    //     return true;
    // }

    // public clearAllDataBreakpoints(): void {
    //     this.breakAddresses.clear();
    // }

    // public setExceptionsFilters(
    //     namedException: string | undefined,
    //     otherExceptions: boolean,
    // ): void {
    //     this.namedException = namedException;
    //     this.otherExceptions = otherExceptions;
    // }

    public getLocalVariables(): RuntimeVariable[] {
        return Array.from(this.variables, ([_name, value]) => value);
    }

    public getLocalVariable(name: string): RuntimeVariable | undefined {
        return this.variables.get(name);
    }

    public canStopOnLocation(filename: string, line: number): boolean {
        // receives filename only, with not path
        const filepath = [...this.breakPoints.keys()].find((f) => {
            return path.basename(f) === path.basename(filename);
        });

        const bps = this.breakPoints.get(filepath ?? '');
        if (bps) {
            const matched = bps.filter((bp) => bp.line === line);
            return matched.length > 0;
        }
        return false;
    }

    public onHubTrapped(line?: number): void {
        // logDebug(`onHubTrapped: line=${line}`);
        if (typeof line === 'number') {
            this.currentLine = line;
            //-- if last action was "continue" only stop when a dedicated breakpoint exists
            if (this.resumeMode === 'continue') {
                const bps = this.breakPoints.get(this._sourceFile) || [];
                const matched = bps.filter((bp) => bp.line === this.currentLine);
                if (matched.length > 0) {
                    // ensure breakpoint is verified and notify
                    if (!matched[0].verified) {
                        matched[0].verified = true;
                        this.sendEvent('breakpointValidated', matched[0]);
                    }
                    this.sendEvent('stopOnBreakpoint');
                }

                if (this.canStopOnLocation(this._sourceFile, this.currentLine)) {
                    this.sendEvent('stopOnBreakpoint');
                } else {
                    // no dedicated breakpoint -> ignore trap during continue, step to next trap
                    void DebugTunnel.performContinueAfterTrap(true);
                }
            } else {
                // step mode: stop on any trap
                this.sendEvent('stopOnBreakpoint'); //stopOnStep
            }
        }
    }

    public onHubUpdateVariables(vars: Map<string, IRuntimeVariableType>): void {
        this.variables.clear();
        vars?.forEach((value, name) => {
            this.variables.set(name, new RuntimeVariable(name, value));
        });
    }

    public output(
        text: string,
        type: string | undefined,
        filepath?: string,
        line?: number,
        nolinebreak = false,
    ): void {
        this.sendEvent(
            'output',

            type, // type: 'out', 'err', 'prio' // output, extension, input
            text,
            filepath ?? '',
            line !== undefined ? line + 1 : 0,
            0,
            nolinebreak,
        );
    }

    public setResumeMode(step: boolean): void {
        this.resumeMode = step ? 'step' : 'continue';
    }

    public endSession(): void {
        this.sendEvent('end');
    }

    private getLine(line?: number): string {
        return this.sourceLines[
            (line === undefined ? this.currentLine : line) - 1
        ].trim();
    }

    private async loadSource(file: string): Promise<void> {
        if (this._sourceFile !== file) {
            // this._sourceFile = this.normalizePathAndCasing(file);
            this._sourceFile = file;
            const contents = await this.fileAccessor.readFile(file);
            this.initializeContents(file, contents);
        }
    }

    private initializeContents(path: string, memory: Uint8Array) {
        this.sourceLines = new TextDecoder().decode(memory).split(/\r?\n/);

        for (let l = 0; l < this.sourceLines.length; l++) {
            if (checkLineForBreakpoint(path, l, this.sourceLines[l])) {
                this.linesWithTraps.add(l);
            }
        }
    }

    private async verifyBreakpoints(path: string): Promise<void> {
        const bps = this.breakPoints.get(path);
        if (bps) {
            await this.loadSource(path);
            bps.forEach((bp) => {
                if (!bp.verified && bp.line < this.sourceLines.length) {
                    const srcLine = this.getLine(bp.line);

                    // we only allow specific lines for breakpoints:
                    if (checkLineForBreakpoint(path, bp.line, srcLine)) {
                        bp.verified = true;
                        this.sendEvent('breakpointValidated', bp);
                    }
                }
            });
        }
    }

    private sendEvent(event: string, ...args: unknown[]): void {
        setTimeout(() => {
            this.emit(event, ...args);
        }, 0);
    }

    private normalizePathAndCasing(path: string) {
        if (this.fileAccessor.isWindows) {
            return path.replace(/\//g, '\\').toLowerCase();
        } else {
            return path.replace(/\\/g, '/');
        }
    }

    // public evaluate(expression: string): IRuntimeVariableType {
    //     // async ??
    //     void DebugTunnel.performEval(expression);

    //     return null;
    // }
}
