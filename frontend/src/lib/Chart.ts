import {
    ActiveElement,
    Chart as RawChart,
    ChartDataset,
    ChartEvent,
    ChartItem,
    ChartOptions,
    ChartType,
    Color,
    InteractionItem,
    TickOptions,
    TooltipModel,
    TooltipOptions,
    ScriptableLineSegmentContext,
    DefaultDataPoint,
    Tooltip,
    registerables,
} from 'chart.js'
import CrosshairPlugin from 'chartjs-plugin-crosshair'
import { inStorybookTestRunner } from 'lib/utils'

if (registerables) {
    // required for storybook to work, not found in esbuild
    RawChart.register(...registerables)
}
RawChart.register(CrosshairPlugin)
RawChart.defaults.animation['duration'] = 0

class Chart<TType extends ChartType = ChartType, TData = DefaultDataPoint<TType>, TLabel = unknown> extends RawChart<
    TType,
    TData,
    TLabel
> {
    draw(): void {
        if (inStorybookTestRunner()) {
            // Disable Chart.js rendering in Storybook snapshots, as they've proven to be very flaky
            return
        }
        super.draw()
    }
}

// Create positioner to put tooltip at cursor position
Tooltip.positioners.cursor = function (_, coordinates) {
    return coordinates
}

export {
    ActiveElement,
    Chart,
    ChartDataset,
    ChartEvent,
    ChartItem,
    ChartOptions,
    ChartType,
    Color,
    InteractionItem,
    TickOptions,
    TooltipModel,
    TooltipOptions,
    ScriptableLineSegmentContext,
}
