# Pinpoint V

![GitHub Release](https://img.shields.io/github/v/release/kennethjyang/pinpoint-v?include_prereleases&label=Latest)

Next-generation in vivo electrophysiology planning and automation tool.

> [!IMPORTANT]
> This is the original base repository for _Pinpoint V_. The live/production fork is deployed and maintained by the Allen Institute [here](https://github.com/AllenNeuralDynamics/pinpoint).
>
> This repo is kept for archival purposes.

## Install for development.

1. Install Node.js LTS (currently on 24).
2. Install `pnpm` (currently on 11).
3. Install the Quasar CLI: `pnpm add -g @quasar/cli`
4. Clone and install dependencies using `pnpm install`
5. Run the dev server using `quasar dev`

Additional things:

- Lefthook has enabled pre-commit hooks that run the formatter, linter, and type checker.
- Skills was used to install agent skills. Symlink them for your agent (i.e. `pnpx skills update` or `pnpx skills add antfu/skills -a claude-code`)
- A Nix dev shell is available in `.nix/` that installs `pnpm` and Node.js 24. Update it using `nix flake update` in the `.nix/` directory
