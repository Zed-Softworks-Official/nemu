'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts'
import { SalesData } from '~/core/structures'

export default function SalesChart(props: { sales_data: SalesData[] }) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart width={150} height={40} data={props.sales_data}>
                <XAxis dataKey="month" className="bg-text-base-content/80" />
                <YAxis dataKey="total_sales" className="bg-text-base-content/80" />
                <Bar
                    dataKey="total_sales"
                    className="rounded-md fill-primary"
                    radius={[10, 10, 0, 0]}
                />
            </BarChart>
        </ResponsiveContainer>
    )
}
