import type { Scenario } from "voltgrid-sim-core";

export type AutomaticDailyProfile = Readonly<{
  dayKey: string;
  scenario: Scenario;
  seed: string;
}>;

const DAILY_SCENARIOS: readonly Scenario[] = ["sunny", "rainy", "heatwave"];

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}

/** Picks one reproducible model profile per browser-local calendar day. */
export function automaticDailyProfile(date: Date): AutomaticDailyProfile {
  const dayKey = localDayKey(date);
  const scenario = DAILY_SCENARIOS[stableHash(`voltgrid-weather-v1:${dayKey}`) % DAILY_SCENARIOS.length];
  return Object.freeze({ dayKey, scenario, seed: `voltgrid-model-v1-${dayKey}` });
}

export function dailyScenarioLabel(scenario: Scenario): string {
  switch (scenario) {
    case "sunny": return "Clear-sky profile";
    case "rainy": return "Rain profile";
    case "heatwave": return "Heatwave profile";
  }
}
