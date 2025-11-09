import { Axis, default as uPlot } from 'uplot';
import 'uplot/dist/uPlot.min.css';

const MAX_DATA_POINTS = 200; // max points to keep in chart

const COLORS = [
    '#7EB26D', // 0: pale green
    '#EAB839', // 1: mustard
    '#6ED0E0', // 2: light blue
    '#EF843C', // 3: orange
    '#E24D42', // 4: red
    '#1F78C1', // 5: ocean
    '#BA43A9', // 6: purple
    '#705DA0', // 7: violet
    '#508642', // 8: dark green
    '#CCA300', // 9: dark sand
];

const enum ChartType {
    Line = 'line',
    Bar = 'bar',
}

const DEFAULT_PRECISION = 1;

let chart: uPlot | undefined;
let chartDataByCols: number[][] = [];
let chartSeries: string[] = [];
let _latestDataRow: number[] = [];
let chartMode = ChartType.Line;

// const vscode = acquireVsCodeApi();

import { sanitizeHtml } from './webviewUtils';

type DatalogWebviewMessage =
    | { command: 'setHeaders'; cols: string[]; rows?: number[][] }
    | { command: 'addData'; row: number[] }
    | { command: 'setChartType'; type: ChartType };

window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as DatalogWebviewMessage;
    if (data.command === 'setHeaders') {
        const { cols, rows } = data;
        setHeaders(cols, rows);
    } else if (data.command === 'addData') {
        const { row } = data;
        addData(row);
    } else if (data.command === 'setChartType') {
        if (!data.type) {
            // Toggle mode
            chartMode = chartMode === ChartType.Line ? ChartType.Bar : ChartType.Line;
        } else {
            // Set to specified mode
            chartMode = data.type;
        }

        // Re-render the chart with the current data and new mode
        setHeaders(
            chartSeries,
            chartDataByCols.map((col) => Array.from(col)),
            _latestDataRow,
        );
    }
});

window.addEventListener('resize', (_e) => {
    chart?.setSize(getSize());
});

// function getVsCodeTheme() {
//     return document.body.classList.contains('vscode-dark') ? 'vs-dark' : 'vs-light';
// }
// window.addEventListener('vscode-theme-change', () => {
//     if (chart && chartSeries.length > 0) {
//         setHeaders(chartSeries, chartData);
//     }
// });

function getSize() {
    return {
        width: window.innerWidth,
        height: window.innerHeight,
    };
}

function setVisibility(hasData: boolean) {
    const container = document.getElementById('chart-container');
    const welcome = document.getElementById('welcome-view');
    if (!container || !welcome) return;

    welcome.style.display = hasData ? 'none' : 'block';
    container.style.display = hasData ? 'block' : 'none';
}

function setHeaders(
    names: string[],
    dataByRows: number[][] = [],
    latest: number[] = [],
) {
    chartSeries = names; // first is x-axis

    // transpose dataByRows to dataByCols
    if (dataByRows.length > 0 && dataByRows[0].length === names.length) {
        chartDataByCols = names.map((_, colIdx) =>
            dataByRows.map((row) => row[colIdx]),
        );
    } else {
        chartDataByCols = Array.from({ length: names.length }, () => []);
    }
    _latestDataRow = latest;

    const dataSeriesNames = names.slice(1);

    const container = document.getElementById('chart-container');
    if (!container) return;
    container.innerHTML = ''; // Clear any existing chart

    // auto scale function with min range
    const autoScaleFn: uPlot.Range.Function = (
        _self: uPlot,
        initMin: number,
        initMax: number,
        _scaleKey: string,
    ) => {
        let min = initMin;
        let max = initMax;

        // Ensure a minimum range
        let delta = max - min;
        const MIN_RANGE = 0.5;
        if (delta < MIN_RANGE) {
            let midpoint = (min + max) / 2;
            min = midpoint - MIN_RANGE / 2;
            max = midpoint + MIN_RANGE / 2;
        }

        // For bar charts, ensure the lower bound is 0 unless there are negative values
        if (chartMode === ChartType.Bar) {
            if (max >= 0 && min > 0) {
                // All values are positive or zero, so scale should start at 0
                min = 0;
            } else if (max < 0 && min < 0) {
                // All values are negative, so scale should end at 0
                max = 0;
            }
            // If min is negative and max is positive, 0 is already included, so no change needed.
        }

        return [min, max] as uPlot.Range.MinMax;
    };

    // Chart type is 'line'
    if (chartMode === ChartType.Line) {
        const axeOpts: Axis[] = [
            {
                scale: 'x',
                side: Axis.Side.Bottom,
                stroke: '#7779',
                grid: {
                    show: true,
                    stroke: '#7776',
                    dash: [],
                    width: 2,
                },
                ticks: { show: true, stroke: '#7776' },
                gap: 0,
                size: 25,
                labelSize: 12,
            },
            ...dataSeriesNames.map((name, idx) => ({
                label: sanitizeHtml(name),
                scale: `num${idx}`,
                side: Axis.Side.Left,
                stroke: COLORS[idx % COLORS.length],
                gap: 0,
                size: 30,
                grid: {
                    show: true,
                    stroke: '#7776',
                    dash: [2, 5],
                    width: 1,
                },
                ticks: { show: true, stroke: '#7776' },
                labelSize: 12,
            })),
        ];
        const opts: uPlot.Options = {
            legend: { show: true },
            ...getSize(),
            padding: [null, 0, null, 0],
            series: [
                // x-axis
                {
                    scale: 'x',
                    label: sanitizeHtml(names[0]),
                    width: 2,
                    stroke: '#7774',
                },
                // y-axes
                ...dataSeriesNames.map((name, idx) => ({
                    scale: `num${idx}`,
                    label: sanitizeHtml(name),
                    width: 2,
                    stroke: COLORS[idx % COLORS.length],
                    fill: COLORS[idx % COLORS.length] + '22',
                })),
            ],
            axes: axeOpts,
            scales: {
                x: {
                    time: false,
                },
                ...Object.fromEntries(
                    dataSeriesNames.map((_, idx) => [
                        `num${idx}`,
                        { range: autoScaleFn },
                    ]),
                ),
            },
            plugins: [axisIndicsPlugin(axeOpts)],
        };

        const alignedData = chartDataByCols.map((arr) => new Float64Array(arr));
        try {
            chart = new uPlot(opts, alignedData, container);
        } catch {
            // NOOP
        }
        setVisibility(alignedData?.[0]?.length > 0);
    }

    // Chart type is 'bar'
    else if (chartMode === ChartType.Bar) {
        // Prepare data for bar chart: x-axis will be indices, y-axis will be latest values
        const barXLabels = dataSeriesNames; // These are the labels for the bars
        const barData: number[][] = [];
        if (_latestDataRow.length > 0) {
            barData.push(Array.from({ length: dataSeriesNames.length }, (_, i) => i)); // X-axis: 0, 1, 2...
            dataSeriesNames.forEach((_, idx) => {
                barData.push([_latestDataRow[idx + 1]]); // Y-axis for each series: single latest value
            });
        } else {
            barData.push([]);
            dataSeriesNames.forEach(() => {
                barData.push([]);
            });
        }

        // Initialize barChartPlugin to get the getRangeX function for scales
        const barPluginInstance = barChartPlugin({
            xLabels: barXLabels,
            colors: COLORS.slice(0, dataSeriesNames.length),
        });

        const barOpts: uPlot.Options = {
            legend: { show: false },
            ...getSize(),
            padding: [null, 0, null, 0],
            series: [{}, {}],
            plugins: [barPluginInstance], // Use the plugin instance
        };

        const alignedData = barData.map((arr) => new Float64Array(arr));
        try {
            chart = new uPlot(barOpts, alignedData, container);
        } catch (e) {
            console.error('Error creating bar chart:', e);
            // NOOP
        }
        setVisibility(alignedData?.[0]?.length > 0);
    }
}

function addData(line: number[]) {
    if (!chart || chartSeries.length === 0) {
        setVisibility(false);
        return;
    }
    _latestDataRow = line;

    // Chart type is 'line'
    if (chartMode === ChartType.Line) {
        chartSeries.forEach((_, index) => {
            chartDataByCols[index].push(line[index]);
        });
        // sliding window to keep max data points
        if (chartDataByCols[0].length > MAX_DATA_POINTS) {
            chartDataByCols.forEach((arr) =>
                arr.splice(0, arr.length - MAX_DATA_POINTS),
            );
        }
        chart.setData(chartDataByCols.map((arr) => new Float64Array(arr)));
    }

    // Chart type is 'bar'
    else if (chartMode === ChartType.Bar) {
        const dataSeriesNames = chartSeries.slice(1);
        const barData: number[][] = [];
        if (_latestDataRow.length > 0) {
            barData.push(dataSeriesNames.map((_, i) => i)); // X-axis for bars will be simply indices
            barData.push(_latestDataRow.slice(1)); // Y-axis data for bars will be the latest values
        } else {
            barData.push([]);
            barData.push([]);
        }
        chart.setData(barData.map((arr) => new Float64Array(arr)));
    }

    setVisibility(true);
}

/**
 * uPlot plugin to render bar charts
 */
function barChartPlugin({
    xLabels = [] as string[],
    gap = 0.1,
    colors = [] as string[],
} = {}) {
    // We want X Axis labels to be center aligned to it's barchart group.
    // To achieve this, we increase the visible range then draw each bar 50% to the left.
    const offset = 0.25;

    function getRangeX(
        _u: uPlot,
        dataMin: number,
        dataMax: number,
    ): uPlot.Range.MinMax {
        const min = dataMin - offset;
        const max = dataMax + 1;
        return [min, max];
    }

    function getValueX(_u: uPlot, v: number): string {
        return xLabels[v];
    }

    // function getAxisLabels(_u: uPlot, vals: number[], _space: number): string[] {
    //     return vals.map((v) => xLabels[v] || '');
    // }

    function drawPath(
        u: uPlot,
        sidx: number,
        i0: number,
        i1: number,
    ): uPlot.Series.Paths {
        const s = u.series[sidx];
        const xdata = u.data[0] as number[];
        const ydata = u.data[sidx] as number[];
        const scaleX = 'x';
        const scaleY = s.scale!;
        const yseriesCount = u.series.length - 1;
        const yseriesIdx = sidx - 1;
        const strokePath = new Path2D();
        const barWidth = (1 - gap) / yseriesCount;

        for (let i = i0; i <= i1; i++) {
            const xStartPos = xdata[i] + yseriesIdx * barWidth + gap / 2 - offset / 2;
            const xEndPos = xStartPos + barWidth;
            const x0 = u.valToPos(xStartPos, scaleX, true);
            const x1 = u.valToPos(xEndPos, scaleX, true);
            const y0 = u.valToPos(ydata[i], scaleY, true);
            const y1 = u.valToPos(0, scaleY, true);
            const width = x1 - x0;
            const height = y1 - y0;

            strokePath.rect(x0, y0, width, height);
        }

        const fillPath = new Path2D(strokePath);

        return { stroke: strokePath, fill: fillPath };
    }

    // Custom draw hook to apply different colors per bar
    function drawBars(u: uPlot) {
        const ctx = u.ctx;

        const xdata = u.data[0] as number[];
        const scaleX = 'x';
        const yseriesCount = u.series.length - 1;
        const barWidth = (1 - gap) / yseriesCount;

        u.series.forEach((s, sidx) => {
            if (sidx === 0) return; // Skip x-axis series

            const ydata = u.data[sidx] as number[];
            const scaleY = s.scale!;
            const yseriesIdx = sidx - 1;

            for (let i = 0; i < xdata.length; i++) {
                const xStartPos =
                    xdata[i] + yseriesIdx * barWidth + gap / 2 - offset / 2;
                const xEndPos = xStartPos + barWidth;
                const x0 = u.valToPos(xStartPos, scaleX, true);
                const x1 = u.valToPos(xEndPos, scaleX, true);
                const y0 = u.valToPos(ydata[i], scaleY, true);
                const y1 = u.valToPos(0, scaleY, true);
                const width = x1 - x0;
                const height = y1 - y0;

                // Use color from colors array, or fall back to series fill color
                const targetColor = colors[i % colors.length];
                ctx.fillStyle = targetColor || (s.fill as string) || '#000'; // sidx-1 because colors array is for data series only
                ctx.fillRect(x0, y0, width, height);

                // Optional: Draw stroke
                ctx.lineWidth = 3;
                // Make stroke color slightly darker than fill
                const strokeColor = shadeColor(targetColor, -20);
                ctx.strokeStyle = strokeColor;
                ctx.strokeRect(x0, y0, width, height);

                // Optional: Draw value label on top of bar
                ctx.fillStyle = strokeColor;
                //ctx.font = '12px sans-serif';
                let seriesName = xLabels[i] ?? '';
                const valueText = ydata[i]?.toFixed(DEFAULT_PRECISION) ?? '0';
                const text = `${seriesName}: ${valueText}`;
                ctx.textAlign = 'center';
                let textdim = ctx.measureText(text);
                const height1 =
                    textdim.actualBoundingBoxAscent + textdim.actualBoundingBoxDescent;
                const yoffset = ydata[i] > 0 ? -height1 : +height1;
                ctx.fillText(text, x0 + width / 2, y0 + yoffset);
            }
        });
    }

    return {
        opts: (_u: uPlot, opts: uPlot.Options) => {
            opts.cursor = opts.cursor || {};
            opts.scales = opts.scales || {};
            opts.axes = opts.axes || [];
            opts.series = opts.series || [];

            if (!opts.series[0].value) {
                opts.series[0].value = getValueX;
            }

            opts.series.forEach((series) => {
                series.paths = drawPath; // Restore drawPath for defining bar geometry
            });

            // Ensure opts.cursor.points is set correctly
            opts.cursor.points = { show: false };

            // Ensure opts.scales.x is initialized and then assigned
            opts.scales.x = Object.assign(opts.scales.x || {}, {
                time: false,
                range: getRangeX,
                distr: 2,
            });

            // Ensure opts.axes[0] is initialized and then assigned
            opts.axes[0] = Object.assign(opts.axes[0] || {}, {
                show: false,
                // values: getAxisLabels,
                grid: { show: false },
            });
        },
        hooks: {
            draw: drawBars,
        },
        getRangeX: getRangeX, // Expose getRangeX for external access
    };
}

/**
 * uPlot plugin to show indicators on Y axes
 */
function axisIndicsPlugin(axes: Axis[]): uPlot.Plugin {
    let indicsEls = Array(axes.length) as HTMLDivElement[];
    let valuesEls = Array(axes.length) as (HTMLElement | Text)[];

    const initHook = (u: uPlot) => {
        const axesEls = Array.from(u.root.querySelectorAll('.u-axis'));

        axesEls.forEach((el, idx) => {
            if (idx === 0) return; // don't show for x-axis

            const axisOpt = axes[idx];
            const indic = (indicsEls[idx] = document.createElement('div'));
            indic.classList.add('u-indic-y');
            indic.style.backgroundColor =
                typeof axisOpt.stroke === 'string' ? axisOpt.stroke : '#aaa';
            indic.style.color = '#444';
            indic.style.borderRadius = '3px';
            indic.style.textAlign = 'center';
            indic.style.overflow = 'hidden';

            const value = (valuesEls[idx] = document.createTextNode(''));
            indic.appendChild(value);

            el.appendChild(indic);
        });
    };

    const setLegendHook = (u: uPlot) => {
        u.series.forEach((s, seriesIdx) => {
            if (seriesIdx === 0) return; // skip x-axis
            const el = indicsEls[seriesIdx];
            const valIdx = u.cursor.idxs?.[seriesIdx];

            if (typeof valIdx === 'number') {
                const val = u.data[seriesIdx][valIdx] as number;

                if (val !== null) {
                    valuesEls[seriesIdx].nodeValue = val.toFixed(DEFAULT_PRECISION);

                    const pos = u.valToPos(val, s.scale ?? 'x');

                    el.style.display = 'block';
                    el.style.transform = `translateY(-50%) translateY(${pos}px)`;

                    return;
                }
            }

            el.style.display = 'none';
        });
    };

    return {
        opts: (_u: uPlot, opts: uPlot.Options) =>
            uPlot.assign({}, opts, {
                cursor: {
                    y: false,
                },
            }) as uPlot.Options,
        hooks: {
            init: initHook,
            setLegend: setLegendHook,
            drawAxes: [drawCustomZeroLine],
        },
    };
}

// New hook function to draw a custom horizontal line at y=0
function drawCustomZeroLine(u: uPlot) {
    const ctx = u.ctx;
    const scaleY = 'y'; // Assuming your Y-axis scale is named 'y'

    // Get the pixel position of the 0 value on the Y-axis
    // The 'true' argument means to use the scale's full range, not just visible range
    const y0Pos = u.valToPos(0, scaleY, true);

    // Get the drawing area boundaries
    const plotLft = u.bbox.left;
    const plotRgt = u.bbox.left + u.bbox.width;

    ctx.save();

    // Set custom style for the '0' grid line
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; // Darker color
    ctx.lineWidth = 3; // Thicker line

    // Draw the line
    ctx.beginPath();
    ctx.moveTo(plotLft, y0Pos);
    ctx.lineTo(plotRgt, y0Pos);
    ctx.stroke();

    ctx.restore();
}

/**
 * Accepts hex color, returns a shaded hex color
 */
function shadeColor(targetColor: string, percent: number): string {
    let color = targetColor.replace(/^#/, '');
    if (color.length === 3) {
        color = color
            .split('')
            .map((c) => c + c)
            .join('');
    }
    const num = parseInt(color, 16);
    let r = (num >> 16) & 0xff;
    let g = (num >> 8) & 0xff;
    let b = num & 0xff;

    r = Math.min(255, Math.max(0, r + Math.round((percent / 100) * 255)));
    g = Math.min(255, Math.max(0, g + Math.round((percent / 100) * 255)));
    b = Math.min(255, Math.max(0, b + Math.round((percent / 100) * 255)));

    return (
        '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()
    );
}
