# Development Guide

This is a collection of notes and guidelines to help developers work on _Pinpoint V_.

::: tip
Docs are still being built. Come back later!
:::

## Tooling

_Pinpoint V_ is a Single Page Application (SPA) web app. Its intended infrastructure is client-side web browsers, so the tooling is focused on this kind of application.

- **Quasar**: The main framework is [Quasar](https://quasar.dev/), which is an open source framework built on top of [Vue.js](https://vuejs.org/). It provides a component library and several helper features, including cross-platform deployment. Standard Vue tooling is included, such as [Pinia](https://pinia.vuejs.org/) for global state management and [Vitest](https://vitest.dev/) for unit testing.
- **BabylonJS**: The 3D engine used for rendering the atlases and probes is [Babylon.js](https://www.babylonjs.com/). It provides a web-native graphics engine with plenty of game engine features.
- **BrainGlobe**: Atlas information and format are from the [BrainGlobe Atlas API](https://brainglobe.info/). We use the v3 API.
- **SpikeInterface ProbeInterface Library**: Probe information and format are from [SpikeInterface's ProbeInterface Library](https://github.com/SpikeInterface/probeinterface_library) public GitHub repo host. We fetch data directly from the repo's main branch at runtime.
- **pnpm + Node.js LTS**: For development runtimes, we use [pnpm](https://pnpm.io/) and the latest [LTS version of Node.js](https://nodejs.org/en).
- **lefthook**: Git commit hooks are installed by [lefthook](https://lefthook.dev/). It runs the formatter on commit.
- **Agent Skills**: For coding agents, a collection of relevant development [skills by Anthony Fu](https://github.com/antfu/skills) has been added in `.agents/skills`. An `AGENTS.md` file also provides extra details.

## Organization

The code roughly follows _feature-based organization_.

- Source code is listed under `/src`.
- Globally shared elements are in `/src`-level folders.
- Everything else is placed inside scoped `/feature` folders.

::: tip
A good way to figure out what a feature covers is to look at the components in there. The components are the user-facing results of a feature.
:::

Each feature folder contains the components, models, and business logic concerning that one feature.

- `/api`: pure-ish functions (they don't host state and only operate on inputs and sometimes return an output) that enable behavior for the feature. Called by other scripts in the feature.
- `/components`: Vue Single Component File (SCF) style files using the Composition API. These primarily define the UI of that component and include reactive interfaces that call out to the API to drive functionality.
- `/composables`: Reactive elements that either get reused or encapsulate some local logic used by components. It's sort of a blend between pure functions and UI and is used when the state is tightly coupled with reactive state.
- `/models`: Non-behavior code like interfaces and constants.

Test scripts use the `.spec.ts` extension and are co-located with the script they are testing.

### Accessing code

All script files are modules. Meaning members are private to the outside and must be exported. Exported members can be used through **relative imports** within the same feature. However, to be used outside the feature, they must be re-exported in the feature barrel file `index.ts`. This is the feature's public API.

Other features can use a feature by importing the re-exported members exposed by the barrel file. They should **import the feature folder** as a module.

### Script organization

Follow the rules in `AGENTS.md` for how to organize code within a script file.
