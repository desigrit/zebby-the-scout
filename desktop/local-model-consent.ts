import type { LocalModel } from "./local-model-catalog.ts";

export type AcceptedModelTerms = Record<string, string>;

export function modelTermsAccepted(model: LocalModel, accepted: AcceptedModelTerms = {}): boolean {
  return !model.license || accepted[model.id] === model.license.version;
}

export function acceptModelTerms(model: LocalModel, accepted: AcceptedModelTerms, submittedVersion?: string): AcceptedModelTerms {
  if (modelTermsAccepted(model, accepted)) return accepted;
  if (submittedVersion !== model.license!.version) {
    throw new Error(`Review and accept ${model.name}'s model terms in Settings before downloading or analyzing.`);
  }
  return { ...accepted, [model.id]: model.license!.version };
}
