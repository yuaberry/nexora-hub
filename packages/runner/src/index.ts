/**
 * `@nexora/runner` — interface do runner + implementação local básima.
 */

export * from './types.js';
export { LocalGameRunner } from './local-runner.js';
export {
  resolveLaunchPlan,
  winePrefixPath,
  type CompatLayer,
  type LaunchContext,
  type LaunchPlan,
} from './launch-plan.js';