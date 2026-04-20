import math
import os
from typing import Any, Optional

import httpx

# 优先尝试从环境变量读取，如果失败（本地开发环境）则尝试读取测试文件
api_key = os.getenv("GEMINI_API_KEY")


def _resolve_generation_timeout_seconds() -> int:
    """
    Gemini REST 调用的读取超时时间，单位为秒。
    兼容旧的 GENERATION_TIMEOUT_MS 配置，避免把毫秒误当成秒继续使用。
    """
    seconds_raw = os.getenv("GENERATION_TIMEOUT_SECONDS")
    legacy_ms_raw = os.getenv("GENERATION_TIMEOUT_MS")

    if seconds_raw:
        return max(15, int(seconds_raw))

    if legacy_ms_raw:
        return max(15, math.ceil(int(legacy_ms_raw) / 1000))

    return 180


GENERATION_TIMEOUT_SECONDS = _resolve_generation_timeout_seconds()
GEMINI_API_BASE_URL = os.getenv("GEMINI_API_BASE_URL", "https://generativelanguage.googleapis.com")

if not api_key:
    # 尝试当前目录 (api/) 或上级目录 (项目根目录)
    for path in ["gemini api key", "../gemini api key"]:
        try:
            if os.path.exists(path):
                with open(path, "r") as f:
                    api_key = f.read().strip()
                break
        except Exception:
            pass

if not api_key:
    raise ValueError("未找到 Gemini API Key。请设置环境变量 GEMINI_API_KEY 或在后端目录/根目录提供 'gemini api key' 文件。")

http_client = httpx.Client(
    timeout=httpx.Timeout(
        connect=10.0,
        read=float(GENERATION_TIMEOUT_SECONDS),
        write=30.0,
        pool=30.0,
    ),
    follow_redirects=True,
)

# 分辨率提示词，引导模型输出对应精细度
RESOLUTION_HINTS: dict[str, str] = {
    "1k": "",  # 1K 为默认，不额外添加描述
    "2k": "high definition 2K resolution, fine details",
    "4k": "ultra high resolution 4K, extremely detailed, sharp",
}

IMAGE_SIZE_LABELS: dict[str, str] = {
    "1k": "1K",
    "2k": "2K",
    "4k": "4K",
}


import re

def _sanitize_prompt(prompt: str) -> str:
    """
    自动清理 Midjourney 风格的后缀（如 --ar 16:9, --stylize 等），这些后缀会导致 Gemini 解析错误或拦截。
    """
    # 匹配 --[指令] 及其后的参数（直到下一个 -- 或结尾）
    cleaned = re.sub(r'\s?--[a-z0-9]+(\s+[^\s-]+)?', '', prompt, flags=re.IGNORECASE)
    # 移除末尾可能残留的连字符
    cleaned = re.sub(r'\s-+$', '', cleaned)
    return cleaned.strip()


def _build_generation_payload(
    prompt: str,
    aspect_ratio: str,
    resolution: str,
    images: Optional[list] = None,
) -> dict[str, Any]:
    # 预先清理提示词
    safe_prompt = _sanitize_prompt(prompt)
    
    resolution_hint = RESOLUTION_HINTS.get(resolution, "")
    full_prompt = f"{safe_prompt}, {resolution_hint}".rstrip(", ") if resolution_hint else safe_prompt

    parts: list[dict[str, Any]] = []

    if images:
        for image in images:
            parts.append(
                {
                    "inlineData": {
                        "mimeType": image.mime_type,
                        "data": image.data,
                    }
                }
            )

    parts.append({"text": full_prompt})

    image_config: dict[str, Any] = {}
    if aspect_ratio and aspect_ratio != "auto":
        image_config["aspectRatio"] = aspect_ratio

    image_size = IMAGE_SIZE_LABELS.get(resolution)
    if image_size:
        image_config["imageSize"] = image_size

    generation_config: dict[str, Any] = {
        "responseModalities": ["TEXT", "IMAGE"],
    }
    if image_config:
        generation_config["imageConfig"] = image_config

    return {
        "contents": [{"parts": parts}],
        "generationConfig": generation_config,
    }


def _extract_error_message(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return response.text[:400] or f"HTTP {response.status_code}"

    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and error.get("message"):
            return str(error["message"])

    return response.text[:400] or f"HTTP {response.status_code}"


def generate_image_sync(
    prompt: str,
    aspect_ratio: str,
    resolution: str,
    model_name: str,
    images: Optional[list] = None,
) -> dict[str, str]:
    """
    通过 Gemini REST 接口生成图片。直接走 httpx，规避当前环境下 google-genai SDK 的 TLS 握手超时问题。
    """
    payload = _build_generation_payload(prompt, aspect_ratio, resolution, images)
    endpoint = f"{GEMINI_API_BASE_URL.rstrip('/')}/v1beta/models/{model_name}:generateContent"

    try:
        response = http_client.post(
            endpoint,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": api_key,
            },
            json=payload,
        )
    except httpx.TimeoutException as exc:
        raise ValueError(f"模型 {model_name} 生成超时，请稍后重试。") from exc
    except httpx.HTTPError as exc:
        raise ValueError(f"模型 {model_name} 请求失败：{exc}") from exc

    if response.status_code >= 400:
        raise ValueError(f"模型 {model_name} 返回错误：{_extract_error_message(response)}")

    payload = response.json()
    
    # 1. 检查 Prompt 是否触发安全限制
    prompt_feedback = payload.get("promptFeedback") or {}
    if prompt_feedback.get("blockReason") == "SAFETY":
        raise ValueError("提示词已触发安全策略被拦截，请尝试修改描述词并重试。")

    candidates = payload.get("candidates") or []
    if not candidates:
        raise ValueError(f"模型 {model_name} 未返回任何内容，可能因为触发了安全策略或解析错误。")

    for candidate in candidates:
        finish_reason = candidate.get("finishReason")
        if finish_reason == "SAFETY":
            raise ValueError("生成的内容已触发安全策略被拦截。")

        content = candidate.get("content") or {}
        for part in content.get("parts") or []:
            inline_data = part.get("inlineData")
            if inline_data and inline_data.get("data"):
                return {
                    "data": inline_data["data"],
                    "mime_type": inline_data.get("mimeType", "image/png"),
                }

    raise ValueError(f"模型 {model_name} 未能生成图片，请尝试更换关键词。")
