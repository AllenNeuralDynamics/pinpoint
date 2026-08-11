import * as closedChainIk from "closed-chain-ik/src/core/index.js";

/** A position and orientation frame in the solver's tree. */
interface IkFrame {
  setPosition(x: number, y: number, z: number): void;
  setQuaternion(x: number, y: number, z: number, w: number): void;
}

/** A rigid connection between two joints. */
export interface IkLink extends IkFrame {
  addChild(child: IkJoint): void;
}

/** A frame with solvable degrees of freedom. */
export interface IkJoint extends IkFrame {
  addChild(child: IkLink): void;
  setDoF(...dof: number[]): void;
  setDoFValues(...values: number[]): void;
  setMinLimit(dof: number, value: number): void;
  setMaxLimit(dof: number, value: number): void;
  getDoFValue(dof: number): number;
}

/** A pose a link is solved onto. */
export interface IkGoal extends IkJoint {
  setGoalDoF(...dof: number[]): void;
  makeClosure(child: IkLink): void;
}

/** Damped-least-squares solver over one or more trees. */
export interface IkSolver {
  useSVD: boolean;
  maxIterations: number;
  stallThreshold: number;
  divergeThreshold: number;
  restPoseFactor: number;
  translationConvergeThreshold: number;
  rotationConvergeThreshold: number;
  solve(): number[];
}

interface ClosedChainIkModule {
  DOF: Record<"X" | "Y" | "Z" | "EX" | "EY" | "EZ", number>;
  SOLVE_STATUS: Record<
    "CONVERGED" | "STALLED" | "DIVERGED" | "TIMEOUT",
    number
  >;
  Link: new () => IkLink;
  Joint: new () => IkJoint;
  Goal: new () => IkGoal;
  Solver: new (roots: IkFrame[]) => IkSolver;
}

// `closed-chain-ik` ships `DOF`/`SOLVE_STATUS` as ambient `const enum`s, which `isolatedModules`
// forbids reading, misspells `setMinLimit`/`setMaxLimit`, and types the numeric getters as
// `Number`. Re-declare the surface this feature uses.
const solverModule = closedChainIk as unknown as ClosedChainIkModule;

export const { DOF, SOLVE_STATUS, Link, Joint, Goal, Solver } = solverModule;
