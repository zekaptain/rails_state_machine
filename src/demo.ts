// Usage: bun run demo [scenario-id]
import { runScenario } from './harness';
import { SCENARIOS } from './scenarios';
import { initialSnapshot, runWorkflow } from './workflow';

const scenarioIdFilter = process.argv[2];
const scenarios = SCENARIOS.filter((scenario) => scenarioIdFilter === undefined || scenario.id === scenarioIdFilter);

for (const scenario of scenarios) {
  console.log(`\n${scenario.id}: ${scenario.title}`);
  try {
    const { snapshot, effects, transitions } = runWorkflow(scenario.events, initialSnapshot(scenario.initialContext));
    for (const transition of transitions) {
      console.log(`  ${transition.causeEventId.padEnd(4)} ${transition.region.padEnd(10)} ${transition.from} -> ${transition.to}`);
    }
    for (const effect of effects) console.log(`  effect ${JSON.stringify(effect)}`);
    console.log(`  final: loan ${snapshot.loanState}, collateral ${snapshot.collateralState}`);
  } catch (err) {
    console.log(`  run: ${err}`);
  }
  try {
    console.log(`  row ${JSON.stringify(runScenario(scenario).row)}`);
  } catch (err) {
    console.log(`  row: ${err}`);
  }
}
