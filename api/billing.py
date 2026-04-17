import json
import threading
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
STATE_PATH = Path(__file__).with_name("runtime_state.json")
STATE_LOCK = threading.Lock()


def round_usd(value: float) -> float:
    return round(value, 4)


def ensure_state() -> dict[str, float]:
    if not STATE_PATH.exists():
        state = {"current_balance_usd": DEFAULT_BALANCE_USD}
        STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        return state

    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except Exception:
        state = {"current_balance_usd": DEFAULT_BALANCE_USD}
        STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        return state


def get_current_balance() -> float:
    with STATE_LOCK:
        state = ensure_state()
        return round_usd(float(state.get("current_balance_usd", DEFAULT_BALANCE_USD)))


def set_current_balance(balance_usd: float) -> float:
    with STATE_LOCK:
        state = {"current_balance_usd": round_usd(balance_usd)}
        STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        return state["current_balance_usd"]


def calculate_generation_cost(model_name: str, input_image_count: int, output_image_count: int = 1) -> float:
    pricing = PRICING[model_name]
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
        STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

        return {
            "starting_balance_usd": round_usd(
                remaining_balance + sum(item["cost_usd"] for item in image_costs)
            ),
            "remaining_balance_usd": remaining_balance,
            "image_costs": image_costs,
        }
