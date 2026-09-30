export type LocalModelLicense = {
  name: string;
  version: string;
  url: string;
  policyUrl?: string;
  summary: string;
  files: readonly { source: string; filename: string }[];
};

export type LocalModel = {
  id: string;
  name: string;
  tier: string;
  description: string;
  bytes: number;
  filename: string;
  sha256: string;
  url: string;
  sourceUrl: string;
  context: number;
  minimumFreeMemory: number;
  memoryHint: string;
  basic: boolean;
  supportsSystemRole?: boolean;
  sampling?: { temperature: number; top_k: number; top_p: number; min_p: number; repeat_penalty: number };
  license?: LocalModelLicense;
};

const GiB = 1024 ** 3;

// Pin both revisions and file hashes. The renderer cannot supply download URLs or paths.
export const LOCAL_MODELS: readonly LocalModel[] = [
  {
    id: "smollm2-360m", name: "SmolLM2 360M", tier: "Compact", basic: true,
    description: "Basic keyword coverage and short overview suggestions. Less detailed assessment.",
    bytes: 270590880, filename: "SmolLM2-360M-Instruct-Q4_K_M.gguf",
    sha256: "2fa3f013dcdd7b99f9b237717fa0b12d75bbb89984cc1274be1471a465bac9c2",
    url: "https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/7be6f65f1db715fe5dc5a4634c0d459b4eed42ec/SmolLM2-360M-Instruct-Q4_K_M.gguf",
    sourceUrl: "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct",
    context: 8192, minimumFreeMemory: 1.5 * GiB, memoryHint: "4 GB RAM or more",
  },
  {
    id: "lfm25-350m", name: "LFM2.5 350M", tier: "Small", basic: false,
    description: "A small instruction model for extraction, role analysis, and resume suggestions. Quality varies with the task.",
    bytes: 229312224, filename: "LFM2.5-350M-Q4_K_M.gguf",
    sha256: "7e6f72643caafc9a68256686638c4d7916f2cec76d1df478d4c3ddcd95a6aed4",
    url: "https://huggingface.co/LiquidAI/LFM2.5-350M-GGUF/resolve/657e078c94084481950a2d555a941481f715536b/LFM2.5-350M-Q4_K_M.gguf",
    sourceUrl: "https://huggingface.co/LiquidAI/LFM2.5-350M",
    context: 16384, minimumFreeMemory: 1.5 * GiB, memoryHint: "4 GB RAM or more",
    license: {
      name: "LFM Open License v1.0", version: "5188f2b355da20647257a3156db5834c794e5fb5e6d8dc4d4cdbb3180e75b85b",
      url: "https://huggingface.co/LiquidAI/LFM2.5-350M-GGUF/blob/657e078c94084481950a2d555a941481f715536b/LICENSE",
      summary: "Liquid AI's license includes conditions for commercial use.",
      files: [{ source: "LICENSE-LFM-1.0.txt", filename: "lfm25-350m-LICENSE.txt" }],
    },
  },
  {
    id: "gemma3-270m", name: "Gemma 3 270M", tier: "Small", basic: false, supportsSystemRole: false,
    sampling: { temperature: 1, top_k: 64, top_p: 0.95, min_p: 0, repeat_penalty: 1.1 },
    description: "A small instruction model for role analysis and short overview edits. Quality varies with the task.",
    bytes: 241410624, filename: "gemma-3-270m-it-qat-Q4_0.gguf",
    sha256: "3626e245220ca4a1c5911eb4010b3ecb7bdbf5bc53c79403c21355354d1e2dc6",
    url: "https://huggingface.co/ggml-org/gemma-3-270m-it-qat-GGUF/resolve/7dba9faa7cdb58c7dc44b238c7dbb00e391fbf65/gemma-3-270m-it-qat-Q4_0.gguf",
    sourceUrl: "https://huggingface.co/google/gemma-3-270m-it-qat-q4_0-unquantized",
    context: 16384, minimumFreeMemory: 1.5 * GiB, memoryHint: "4 GB RAM or more",
    license: {
      name: "Gemma Terms of Use", version: "de7b03d137cbcb0d07d6a24254cdc0ca5bda24ea96121d587875b7448946502d",
      url: "https://ai.google.dev/gemma/terms", policyUrl: "https://ai.google.dev/gemma/prohibited_use_policy",
      summary: "Use is subject to Google's model terms and use restrictions.",
      files: [{ source: "LICENSE-Gemma.txt", filename: "gemma3-270m-LICENSE.txt" },
        { source: "Gemma-Prohibited-Use-Policy.txt", filename: "gemma3-270m-USE-POLICY.txt" },
        { source: "NOTICE-Gemma.txt", filename: "gemma3-270m-NOTICE.txt" }],
    },
  },
  {
    id: "qwen3-06b", name: "Qwen3 0.6B", tier: "Small", basic: false,
    description: "A small general model for role analysis and resume suggestions. Quality varies with the task.",
    bytes: 639446688, filename: "Qwen3-0.6B-Q8_0.gguf",
    sha256: "9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031",
    url: "https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/23749fefcc72300e3a2ad315e1317431b06b590a/Qwen3-0.6B-Q8_0.gguf",
    sourceUrl: "https://huggingface.co/Qwen/Qwen3-0.6B-GGUF",
    context: 16384, minimumFreeMemory: 2 * GiB, memoryHint: "8 GB RAM or more",
  },
  {
    id: "qwen3-4b", name: "Qwen3 4B", tier: "Medium", basic: false,
    description: "More capacity for detailed role assessment and overview edits. Slower on CPU.",
    bytes: 2497280256, filename: "Qwen3-4B-Q4_K_M.gguf",
    sha256: "7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5",
    url: "https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/bc640142c66e1fdd12af0bd68f40445458f3869b/Qwen3-4B-Q4_K_M.gguf",
    sourceUrl: "https://huggingface.co/Qwen/Qwen3-4B-GGUF",
    context: 32768, minimumFreeMemory: 6 * GiB, memoryHint: "16 GB RAM or more",
  },
  {
    id: "qwen3-8b", name: "Qwen3 8B", tier: "Larger", basic: false,
    description: "The largest built-in option for detailed analysis. Allow more time on CPU.",
    bytes: 5027783488, filename: "Qwen3-8B-Q4_K_M.gguf",
    sha256: "d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785",
    url: "https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/7c41481f57cb95916b40956ab2f0b139b296d974/Qwen3-8B-Q4_K_M.gguf",
    sourceUrl: "https://huggingface.co/Qwen/Qwen3-8B-GGUF",
    context: 32768, minimumFreeMemory: 9 * GiB, memoryHint: "24 GB RAM or more",
  },
];

export function getLocalModel(id: string): LocalModel {
  const model = LOCAL_MODELS.find((item) => item.id === id);
  if (!model) throw new Error("Choose a built-in model from Settings.");
  return model;
}

export function formatModelBytes(bytes: number): string {
  return bytes >= 1_000_000_000 ? `${(bytes / 1_000_000_000).toFixed(2)} GB`
    : `${Math.round(bytes / 1_000_000)} MB`;
}

export type LocalModelStatus = {
  id: string;
  status: "not-installed" | "downloading" | "paused" | "verifying" | "ready" | "error";
  downloadedBytes: number;
  error: string;
};
