"""Compare an already installed MLX model against Zebby's benchmark requests."""
import argparse
import gc
import json
import time
from pathlib import Path

import mlx.core as mx
from mlx_lm import load, stream_generate
from mlx_lm.sample_utils import make_sampler

parser = argparse.ArgumentParser()
parser.add_argument("--model", required=True)
parser.add_argument("--requests", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--thinking", choices=["on", "off"], default="off")
parser.add_argument("--repeat", type=int, default=2)
args = parser.parse_args()
started = time.monotonic()
model, tokenizer = load(args.model)
report = {"loadMs": round((time.monotonic() - started) * 1000), "runs": []}
requests = json.loads(Path(args.requests).read_text())
try:
    for repeat in range(1, args.repeat + 1):
        for task in requests:
            mx.random.seed(0)
            mx.reset_peak_memory()
            messages = [{"role": "system", "content": task["instructions"]},
                        {"role": "user", "content": json.dumps(task["input"], ensure_ascii=False)}]
            # MLX-LM has no equivalent to llama.cpp's JSON-schema grammar here.
            # Use the same source prompt and validate the returned JSON in Node.
            prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True,
                                                   enable_thinking=args.thinking == "on")
            start = time.monotonic()
            first = None
            pieces = []
            tokens = 0
            for response in stream_generate(model, tokenizer, prompt=prompt, max_tokens=task["maxTokens"],
                                            sampler=make_sampler(temp=0.6 if args.thinking == "on" else 0.0,
                                                                 top_p=0.95 if args.thinking == "on" else 1.0,
                                                                 top_k=20 if args.thinking == "on" else 0)):
                if first is None:
                    first = time.monotonic()
                pieces.append(response.text)
                tokens += 1
            elapsed = time.monotonic() - start
            text = "".join(pieces).split("</think>")[-1].strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            report["runs"].append({"task": task["id"], "repeat": repeat, "elapsedMs": round(elapsed * 1000) + (report["loadMs"] if not report["runs"] else 0),
                                   "firstTokenFromRequestMs": round((first - start) * 1000) + (report["loadMs"] if not report["runs"] else 0) if first else None,
                                   "generatedTokens": tokens, "tokensPerSecond": tokens / elapsed,
                                   "mlxPeakAllocatedBytes": mx.get_peak_memory(), "result": json.loads(text)})
            del pieces
            gc.collect()
            mx.clear_cache()
finally:
    del model, tokenizer
    gc.collect()
    mx.clear_cache()
    Path(args.output).write_text(json.dumps(report, indent=2))
