# `@nemu/biome-config`

Shared Biome configuration for the monorepo.

## Exports

- `@nemu/biome-config/base` — formatter, linter, and assist defaults for all packages
- `@nemu/biome-config/next-js` — Next.js overlay (next/react lint domains, build-dir ignores)
- `@nemu/biome-config/react-internal` — React library overlay (react lint domain, dist ignores)

## Usage

The overlays do not chain to `base` themselves (Biome does not resolve
transitive `extends` through package configs), so list `base` first:

```jsonc
// apps/<app>/biome.jsonc
{
	"root": false,
	"extends": ["@nemu/biome-config/base", "@nemu/biome-config/next-js"]
}
```

```jsonc
// packages/<lib>/biome.jsonc
{
	"root": false,
	"extends": ["@nemu/biome-config/base", "@nemu/biome-config/react-internal"]
}
```

Add the package as a devDependency: `"@nemu/biome-config": "workspace:*"`.
