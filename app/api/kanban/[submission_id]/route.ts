import { NemuResponse, StatusCode } from '@/core/responses'
import { KanbanContainerData, KanbanTask } from '@/core/structures'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(req: Request, { params }: { params: { submission_id: string } }) {
    const data = (await req.json()) as { containers: KanbanContainerData[]; tasks: KanbanTask[] }

    try {
        await prisma.formSubmission.update({
            where: {
                id: params.submission_id
            },
            data: {
                kanban: {
                    update: {
                        containers: JSON.stringify(data.containers),
                        tasks: JSON.stringify(data.tasks)
                    }
                }
            }
        })
    } catch (e) {
        return NextResponse.json<NemuResponse>({
            status: StatusCode.InternalError,
            message: 'Unable to save kanban board!'
        })
    }

    return NextResponse.json<NemuResponse>({
        status: StatusCode.Success
    })
}
