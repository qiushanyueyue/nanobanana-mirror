import json
import threading
import os
from pathlib import Path

PRICING: dict[str, dict[str, float]] = {
    "gemini-3.1-flash-image-preview": {
        "input_image_usd": 0.0005,
        "output_image_usd": 0.0672,
    },
    "gemini-3-pro-image-preview": {
        "input_image_usd": 0.002,
        "output_image_usd": 0.134,
    },
}

DEFAULT_BALANCE_USD = 185.0

# NOTE: Vercel 文件系统是只读的，唯一可写的是 /tmp
# 我们优先尝试 /tmp，如果不行则回退到当前目录（本地开发环境）
if os.environ.get("VERCEL"):
    STATE_PATH = Path("/tmp/runtime_state.json")
else:
    STATE_PATH = Path(__file__).with_name("runtime_state.json")

STATE_LOCK = threading.Lock()

# 内存中的后备余额（防止文件系统彻底失效时崩溃）
_MEM_CACHE: dict[str, float] = {"current_balance_usd": DEFAULT_BALANCE_USD}


def round_usd(value: float) -> float:
    return round(value, 4)


def ensure_state() -> dict[str, float]:
    global _MEM_CACHE
    
    # 1. 尝试从文件读取
    if STATE_PATH.exists():
        try:
            content = STATE_PATH.read_text(encoding="utf-8")
            data = json.loads(content)
            _MEM_CACHE["current_balance_usd"] = float(data.get("current_balance_usd", DEFAULT_BALANCE_USD))
            return _MEM_CACHE
        except Exception:
            pass

    # 2. 如果文件不存在或读取失败，使用内存缓存
    return _MEM_CACHE


def save_state(state: dict[str, float]):
    global _MEM_CACHE
    _MEM_CACHE.update(state)
    
    try:
        STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        # Vercel 只读环境下写入失败是正常的，记录但不抛出异常
        print(f"Warning: Failed to save state to {STATE_PATH}: {e}")


def get_current_balance() -> float:
    with STATE_LOCK:
        state = ensure_state()
        return round_usd(float(state.get("current_balance_usd", DEFAULT_BALANCE_USD)))


def set_current_balance(balance_usd: float) -> float:
    with STATE_LOCK:
        state = {"current_balance_usd": round_usd(balance_usd)}
        save_state(state)
        return state["current_balance_usd"]


def calculate_generation_cost(model_name: str, input_image_count: int, output_image_count: int = 1) -> float:
    pricing = PRICING.get(model_name, PRICING["gemini-3.1-flash-image-preview"])
    return round_usd(
        pricing["input_image_usd"] * input_image_count + pricing["output_image_usd"] * output_image_count
    )


def apply_generation_costs(model_names: list[str], input_image_count: int) -> dict[str, object]:
    with STATE_LOCK:
        state = ensure_state()
        remaining_balance = round_usd(float(state.get("current_balance_usd", DEFAULT_BALANCE_USD)))
        image_costs: list[dict[str, float]] = []

        for model_name in model_names:
            cost_usd = calculate_generation_cost(model_name, input_image_count, 1)
            remaining_balance = round_usd(remaining_balance - cost_usd)
            image_costs.append(
                {
                    "cost_usd": cost_usd,
                    "remaining_balance_usd": remaining_balance,
                }
            )

        state["current_balance_usd"] = remaining_balance
        save_state(state)

        return {
            "starting_balance_usd": round_usd(
                remaining_balance + sum(item["cost_usd"] for item in image_costs)
            ),
            "remaining_balance_usd": remaining_balance,
            "image_costs": image_costs,
        }
