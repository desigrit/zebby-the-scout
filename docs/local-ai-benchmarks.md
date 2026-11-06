# Local AI on Apple Silicon

Zebby uses its native ARM64 llama.cpp engine with Metal on Apple Silicon. Model recommendations use available system memory and the GPU's working-memory budget. Unified memory is one shared pool, so CPU and GPU capacities are not added together.

## Downloadable models

| Model | Download | Starting configuration |
|---|---:|---|
| Qwen3 14B, Q4_K_M | 9.00 GB | 32 GB unified memory |
| Qwen3 30B A3B, Q4_K_M | 18.56 GB | 48 GB unified memory |
| Qwen3 32B, Q4_K_M | 19.76 GB | 48 GB unified memory or more |

The 30B model uses a mixture of experts. Fewer parameters are active for each generated token, but the complete weights still need memory. Recommendations depend on what is available when Zebby checks. Selecting a different model remains the user's choice. Models download only when selected, and every download has a pinned upstream revision, size and SHA-256 hash.

## Memory lifetime

- Opening Settings checks hardware but does not load model weights.
- Zebby starts one inference worker and one request slot.
- The native chat template and tokenizer determine the context needed for the complete source, output budget and a small safety margin. An initial estimate may be resized before generation. Oversized requests fail without trimming the resume or job description.
- Qwen memory estimates include weights, FP16 attention cache, runtime overhead, and a system reserve of 10% of physical RAM, bounded between 1 and 4 GiB. Other models retain conservative catalog limits.
- The extra llama.cpp RAM prompt cache and context checkpoints are disabled. The active context can be reused by consecutive requests until the worker is released.
- The worker exits after 30 idle seconds. Settings also offers **Release memory** while the worker is idle. Cancellation, sleep, app exit, and switching away from an idle downloaded model release it.
- Memory pressure is checked every five seconds. Warning pressure evicts an idle worker. Critical pressure stops active inference without saving a partial answer. The next attempt starts a fresh worker.
- CPU fallback preserves the chosen model and thinking level. It never silently chooses a smaller model or an online provider.

Ollama owns its own server process. Zebby requests a 30-second keep-alive, an explicit context and task output budget. Ollama has no public tokenizer endpoint, so its input budget uses a conservative UTF-8 byte bound and checks the model's reported native context limit when available. Zebby does not terminate a shared Ollama server. Active streams use progress-aware timeouts, with a 30-minute overall deadline.

## Benchmark on an M1 Max or a newer Mac

Use Node 22.13 or newer in the Zebby checkout. Download the model through Settings first, then quit Zebby so it does not compete with the benchmark.

```sh
npm ci
npm run desktop:build
npm run desktop:prepare-model-engine
npm run benchmark:local -- --model qwen3-14b --thinking on --require-gpu --idle-check
```

The benchmark uses the installed file in `~/Library/Application Support/Zebby/Models`. Pass `--model-file /path/to/model.gguf` for another location. It verifies the file without copying, changing or downloading it. Results go to `work/local-benchmarks/`, which is excluded from Git.

Run the same command with `qwen3-8b`, `qwen3-30b-a3b`, or `qwen3-32b` to compare installed models. The default is two rounds of Plan, a strongly aligned match, and a match with major qualification gaps. `--repeat 1` runs one round.

The report records hardware, model revision identity, context allocation, actual GPU layer offload, request latency, first-token latency, available system memory, results and release checks. Review the output alongside the timing: factual summary claims, requirement prioritization, score separation and consistency across repeats. System available-memory readings include other apps; they are not isolated GPU-allocation measurements.

## MLX comparison

The shipping engine remains llama.cpp with Metal. An optional benchmark adapter compares a locally installed MLX version of the same model. MLX is not bundled or installed by Zebby.

```sh
python3 -m venv .venv-mlx
.venv-mlx/bin/python -m pip install mlx-lm
npm run benchmark:local -- --backend mlx --mlx-model /path/to/local/mlx-model --python .venv-mlx/bin/python --thinking on
```

The adapter runs with Hugging Face offline mode enabled. It uses the same source prompts and thinking setting, records output and MLX peak allocated memory, and exits after the run. Record the MLX model revision and quantization alongside the native report. The native engine constrains JSON with a schema grammar; this MLX adapter validates JSON after generation. Compare quality and schema reliability as well as speed before choosing a shipping backend.

Primary references: [llama.cpp server options](https://github.com/ggml-org/llama.cpp/blob/b11146/tools/server/README.md), [Qwen3 14B](https://huggingface.co/Qwen/Qwen3-14B-GGUF), [Qwen3 30B A3B](https://huggingface.co/Qwen/Qwen3-30B-A3B-GGUF), [Qwen3 32B](https://huggingface.co/Qwen/Qwen3-32B-GGUF), [MLX-LM](https://github.com/ml-explore/mlx-lm).
