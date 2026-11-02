// Usage: bun run demo [scenario-id]
import { runScenario } from './harness';
import { SCENARIOS } from './scenarios';
import { initialSnapshot, run } from './workflow';

const only = process.argv[2];

for (const scn of SCENARIOS.filter((s) => only === undefined || s.id === only)) {
  console.log(`\n${scn.id}: ${scn.title}`);
  try {
    const { snapshot, effects, log } = run(scn.events, initialSnapshot(scn.ctx));
    for (const l of log) console.log(`  ${l.cause.padEnd(4)} ${l.region.padEnd(10)} ${l.from} -> ${l.to}`);
    for (const e of effects) console.log(`  effect ${JSON.stringify(e)}`);
    console.log(`  final: loan ${snapshot.loan}, collateral ${snapshot.collateral}`);
  } catch (err) {
    console.log(`  run: ${err}`);
  }
  try {
    console.log(`  row ${JSON.stringify(runScenario(scn).row)}`);
  } catch (err) {
    console.log(`  row: ${err}`);
  }
}
