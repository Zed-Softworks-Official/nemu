// Types for Vite's `import.meta.glob`, which convex-test uses to load the
// Convex function modules in tests.
interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>
}
