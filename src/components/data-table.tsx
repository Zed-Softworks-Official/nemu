'use client'

import { useMemo } from 'react'
import { AgGridReact, type AgGridReactProps } from 'ag-grid-react'
import {
    themeQuartz,
    ModuleRegistry,
    AllCommunityModule,
    type ColDef
} from 'ag-grid-community'
import Link from 'next/link'

import { Button } from '~/components/ui/button'

ModuleRegistry.registerModules([AllCommunityModule])

interface DataTableProps<TData> extends AgGridReactProps<TData> {
    /**
     * @prop {string} url - The BASE url to navigate to when the action is clicked
     * @prop {string} field - The FIELD to used for the KEY in the url
     * @prop {string} actionText - The text to display on the action button
     */
    columnActionData?: {
        url: string
        field: string
        actionText: string
    }
}

export function DataTable<TData>(props: DataTableProps<TData>) {
    const myTheme = useMemo(
        () =>
            themeQuartz.withParams({
                backgroundColor: '#0A0A0A',
                browserColorScheme: 'dark',
                chromeBackgroundColor: {
                    ref: 'foregroundColor',
                    mix: 0.07,
                    onto: 'backgroundColor'
                },
                foregroundColor: '#FFFFFF',
                headerFontSize: 14
            }),
        []
    )

    const columnDefs = useMemo(() => {
        if (!props.columnActionData || !props.columnDefs) {
            return props.columnDefs
        }

        return [
            ...props.columnDefs,
            {
                headerName: 'Actions',
                field: props.columnActionData.field,
                flex: 1,
                cellRenderer: ({ data }: { data: Record<string, unknown> }) => {
                    if (!props.columnActionData) return null

                    return (
                        <Button asChild>
                            <Link
                                href={`${props.columnActionData.url}/${data[props.columnActionData.field] as string}`}
                            >
                                {props.columnActionData.actionText}
                            </Link>
                        </Button>
                    )
                }
            }
        ]
    }, [props.columnDefs, props.columnActionData])

    return (
        <div className="h-[500px]">
            <AgGridReact
                {...props}
                theme={myTheme}
                columnDefs={columnDefs as ColDef<TData>[]}
            />
        </div>
    )
}
