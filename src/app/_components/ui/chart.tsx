'use client'

import { AgCharts, type AgChartProps } from 'ag-charts-react'
import { type AgChartOptions } from 'ag-charts-community'

import { useState } from 'react'

type ChartProps = {} & AgChartProps

export function Chart(props: ChartProps) {
    const [options] = useState<AgChartOptions>(props.options)

    return (
        <AgCharts
            {...props}
            options={{
                theme: 'ag-default-dark',
                ...options
            }}
        />
    )
}
