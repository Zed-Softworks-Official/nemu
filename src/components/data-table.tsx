'use client'

import { AgGridReact, type AgGridReactProps } from 'ag-grid-react'
import { themeQuartz, ModuleRegistry, AllCommunityModule } from 'ag-grid-community'

ModuleRegistry.registerModules([AllCommunityModule])

export function DataTable<TData>(props: AgGridReactProps<TData>) {
    const myTheme = themeQuartz.withParams({
        backgroundColor: '#0A0A0A',
        browserColorScheme: 'dark',
        chromeBackgroundColor: {
            ref: 'foregroundColor',
            mix: 0.07,
            onto: 'backgroundColor'
        },
        foregroundColor: '#FFFFFF',
        headerFontSize: 14
    })

    return (
        <div className="h-[500px]">
            <AgGridReact {...props} theme={myTheme} />
        </div>
    )
}
