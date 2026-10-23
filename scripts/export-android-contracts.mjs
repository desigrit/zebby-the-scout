// Android consumes the same prompt, response schema and catalog as desktop.
// Run with Node 22.18+ after changing shared analysis contracts.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { planInstructions, planSchema, matchInstructions, matchSchema } from '../desktop/analysis-contracts.ts';
import { ONLINE_MODELS, CREDIT_MODELS, CREDIT_PACKS, onlineThinking, outputLimit, CREDIT_ESTIMATE_DESCRIPTION, estimatedAnalyses } from '../shared/online-models.ts';
const path = fileURLToPath(new URL('../android/app/src/main/assets/contracts.json', import.meta.url));
const contracts = { plan: { instructions: planInstructions, schema: planSchema }, match: { instructions: matchInstructions, schema: matchSchema },
  models: ONLINE_MODELS.map(m => ({ id: m.id, name: m.name, provider: m.provider, paid: CREDIT_MODELS.some(c => c.id === m.id), ...onlineThinking(m) })),
  outputLimits: Object.fromEntries(['plan', 'match'].map(kind => [kind, Object.fromEntries(['off', 'on', 'low', 'medium', 'high', 'xhigh', 'max'].map(e => [e, outputLimit(kind, e)]))])),
  packs: CREDIT_PACKS.map(p => ({ ...p, lunaAnalyses: estimatedAnalyses(p.credits, 'gpt-6-luna') })), estimateDescription: CREDIT_ESTIMATE_DESCRIPTION };
const value = JSON.stringify(contracts, null, 2) + '\n';
if (process.argv.includes('--check')) { if (readFileSync(path, 'utf8') !== value) throw new Error('Regenerate Android contracts: node scripts/export-android-contracts.mjs'); }
else writeFileSync(path, value);
