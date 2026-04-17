import json
import threading
import os
from pathlib import Path

try:
    from upstash_redis import Redis
except ImportError:
    Redis = None

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

DEFAULT_BALANCE_USD = 180.0
KV_KEY = "nanobanana:current_balance_usd"

# Vercel KV 配置 (由 Vercel 控制台自动注入)
KV_URL = os.environ.get("KV_REST_API_URL")
KV_TOKEN = os.environ.get("KV_REST_API_TOKEN")

# Vercel 文件系统是只读的，唯一可写的是 /tmp
if os.environ.get("VERCEL"):
    STATE_PATH = Path("/tmp/runtime_state.json")
else:
    STATE_PATH = Path(__file__).with_name("runtime_state.json")

STATE_LOCK = threading.Lock()

# 内存中的后备余额
_MEM_CACHE: dict[str, float] = {"current_balance_usd": DEFAULT_BALANCE_USD}

# 初始化 Redis 客户端
redis_client = None
if Redis and KV_URL and KV_TOKEN:
    try:
        redis_client = Redis(url=KV_URL, token=KV_TOKEN)
    except Exception as e:
        print(f"Warning: Failed to initialize Redis client: {e}")


def round_usd(value: float) -> float:
    return round(value, 4)


def ensure_state() -> dict[str, float]:
    global _MEM_CACHE
    
    # 1. 优先尝试从 Vercel KV (Redis) 读取
    if redis_client:
        try:
            val = redis_client.get(KV_KEY)
            if val is not None:
                balance = float(val)
                _MEM_CACHE["current_balance_usd"] = balance
                return _MEM_CACHE
        except Exception as e:
            print(f"Warning: Failed to read from Redis: {e}")

    # 2. 尝试从本地文件读取 (本地开发或 KV 失效)
    if STATE_PATH.exists():
        try:
            content = STATE_PATH.read_text(encoding="utf-8")
            data = json.loads(content)
            _MEM_CACHE["current_balance_usd"] = float(data.get("current_balance_usd", DEFAULT_BALANCE_USD))
            return _MEM_CACHE
        except Exception:
            pass

    return _MEM_CACHE


def save_state(state: dict[str, float]):
    global _MEM_CACHE
    balance = float(state.get("current_balance_usd", DEFAULT_BALANCE_USD))
    _MEM_CACHE["current_balance_usd"] = balance
    
    # 1. 优先保存到 Vercel KV
    if redis_client:
        try:
            redis_client.set(KV_KEY, str(balance))
        except Exception as e:
            print(f"Warning: Failed to save to Redis: {e}")
    
    # 2. 保存到本地文件 (作为额外备份或开发环境使用)
    try:
        STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        # 记录但不抛出异常，防止 Vercel 只读环境崩溃
        if not os.environ.get("VERCEL"):
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
