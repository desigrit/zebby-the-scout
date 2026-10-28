export interface OllamaModel {
  name: string;
  parameterSize?: string | null;
  quantizationLevel?: string | null;
}

export function ollamaModelLabel(model: OllamaModel): string {
  const separator = model.name.lastIndexOf(':');
  const path = separator < 0 ? model.name : model.name.slice(0, separator);
  const tag = separator < 0 ? '' : model.name.slice(separator + 1);
  const slash = path.lastIndexOf('/');
  const family = path.slice(slash + 1).match(/^qwen(\d+(?:\.\d+)*)([-\w.]*)$/i);
  if (!family) return model.name;

  const size = tag.match(/^(\d+(?:\.\d+)?[bm])(?:-|$)/i)?.[1];
  const taggedQuant = tag.match(/(?:^|-)(i?q\d+(?:_[a-z0-9]+)*|bf16|f16|f32)$/i)?.[1];
  const quant = model.quantizationLevel?.trim() || taggedQuant;
  const bits = quant?.match(/^i?q(\d+)(?:_|$)/i)?.[1];
  const precision = bits ? `${bits}-bit quant` : quant;
  const parameters = size?.toUpperCase() || model.parameterSize?.replace(/\.0(?=[BM]$)/i, '');
  const variant = family[2].split('-').filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
  let extra = tag === 'latest' ? '' : tag.slice(size?.length ?? 0);
  if (taggedQuant) extra = extra.slice(0, -taggedQuant.length);
  extra = extra.split('-').filter(part => part && part.toLowerCase() !== 'mtp').join(' ');
  const namespace = slash < 0 || path.slice(0, slash) === 'library' ? '' : path.slice(0, slash) + '/';
  const label = [namespace + 'Qwen ' + family[1], variant, parameters, extra].filter(Boolean).join(' ');
  return precision ? `${label} (${precision})` : label;
}
