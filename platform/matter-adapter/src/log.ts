export interface Log {
    info(line: string): void
    warn(line: string): void
    error(line: string): void
}

/** Plain lines on stderr, tagged with a scope. */
export function consoleLog(scope: string): Log {
    const write = (level: string, line: string) =>
        process.stderr.write(
            `${new Date().toISOString()} ${level} ${scope} ${line}\n`
        )
    return {
        info: (line) => write('INFO', line),
        warn: (line) => write('WARN', line),
        error: (line) => write('ERROR', line),
    }
}
