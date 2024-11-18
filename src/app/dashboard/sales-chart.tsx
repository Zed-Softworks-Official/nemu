'use client'

import { Bar, BarChart, XAxis, YAxis } from 'recharts'
import { type SalesData } from '~/core/structures'
import { type ChartConfig, ChartContainer } from '~/components/ui/chart'

const chartConfig = {
    total_sales: {
        label: 'Total Sales',
        color: '#2185d5'
    }
} satisfies ChartConfig

export function SalesChart(props: { sales_data: SalesData[] }) {
    return (
        <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
            <BarChart accessibilityLayer data={props.sales_data}>
                <XAxis
                    dataKey="month"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                />
                <YAxis
                    dataKey="total_sales"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                />
                <Bar dataKey="total_sales" fill="var(--color-total_sales)" radius={4} />
            </BarChart>
        </ChartContainer>
    )
}
