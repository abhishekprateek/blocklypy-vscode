// import { parseDebugTunnelCommand } from '../debug-tunnel/stdout-debugtunnel-helper';
import Config, { FeatureFlags } from '../extension/config';
import { reportPythonError } from '../extension/diagnostics';
import { plotManager } from '../plot/plot';
import { parsePlotCommand } from '../plot/stdout-plot-helper';
import {
    resetPythonErrorParser as clearPythonErrorParser,
    parsePythonError,
} from './stdout-python-error-helper';

export async function handleStdOutDataHelpers(line: string) {
    // starts with "plot: "
    if (Config.FeatureFlag.get(FeatureFlags.PlotDataFromStdout)) {
        await parsePlotCommand(line, plotManager);
    }

    // // starts with "debug: "
    // if (Config.FeatureFlag.get(FeatureFlags.PybricksDebugFromStdout)) {
    //     await parseDebugTunnelCommand(line);
    // }

    // equal to  "Traceback (most recent call last):"
    parsePythonError(line, handleReportPythonError);
}

export function clearStdOutDataHelpers() {
    clearPythonErrorParser();
    plotManager.resetPlotParser().catch(console.error);
}

export function handleReportPythonError(
    filename: string,
    line: number,
    message: string,
) {
    // onReport callback
    setTimeout(() => {
        reportPythonError(filename, line, message).catch(console.error);
    }, 0);
}
