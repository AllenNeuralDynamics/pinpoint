# Pinpoint V

![GitHub Release](https://img.shields.io/github/v/release/kennethjyang/pinpoint-v?label=Stable)
![GitHub Release](https://img.shields.io/github/v/release/kennethjyang/pinpoint-v?include_prereleases&label=Latest)

Next-generation in vivo electrophysiology planning and automation tool.

> [!WARNING]
> Under active and early development. Feel free to poke around and contribute, but this is not a finished product yet.

## Install for development.

1. Install Node.js LTS (currently on 24).
2. Install `pnpm` (currently on 11).
3. Install the Quasar CLI: `pnpm add -g @quasar/cli`
4. Clone and install dependencies using `pnpm install`
5. Run the dev server using `quasar dev`

Additional things:

- Lefthook has enabled pre-commit hooks that run the formatter, linter, and type checker.
- Skills was used to install agent skills. Symlink them for your agent (i.e. `pnpx skills add antfu/skills -a claude-code`)
