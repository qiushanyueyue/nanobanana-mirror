import os
import sys

# Vercel 打包 Python 函数时不会自动把当前 api 目录加入 import 路径。
# 保持显式注入，避免 `import service` 在远端构建阶段失败。
sys.path.append(os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import service
import traceback
import concurrent.futures
from typing import Optional


class InputImage(BaseModel):
    data: str = Field(..., min_length=1)
    mime_type: str = Field(default="image/jpeg")
    file_name: Optional[str] = None


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    aspect_ratio: str = Field(default="auto")    # auto / 1:1 / 9:16 / 16:9 / 3:4 / 4:3 / 3:2 / 2:3 / 5:4 / 4:5 / 21:9
    resolution: str = Field(default="1k")        # 1k / 2k / 4k
    models: list[str] = Field(..., min_items=1)
    images: list[InputImage] = Field(default_factory=list)


import time
from fastapi import Request

app = FastAPI(title="Nanobanana API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _build_generation_failure_response(errors: list[str]) -> HTTPException:
    error_details = " | ".join(errors) if errors else "上游模型暂时不可用，请稍后重试。"
    retryable_markers = (
        "high demand",
        "try again later",
        "temporarily",
        "service unavailable",
        "rate limit",
        "resource exhausted",
        "生成超时",
    )
    status_code = 503 if any(marker in error_details.lower() for marker in retryable_markers) else 500
    return HTTPException(status_code=status_code, detail=f"生成失败：所有模型均未返回有效数据。详情：{error_details}")

@app.post("/api/generate")
async def generate(request: Request, req: GenerateRequest = Body(...)):
    start_time = time.perf_counter()
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=max(len(req.models), 1))
    try:
        results = [None] * len(req.models)
        future_to_model = {
            executor.submit(
                service.generate_image_sync,
                req.prompt,
                req.aspect_ratio,
                req.resolution,
                model_name,
                req.images,
            ): index
            for index, model_name in enumerate(req.models)
        }

        errors = []
        for future in concurrent.futures.as_completed(
            future_to_model,
            timeout=service.GENERATION_TIMEOUT_SECONDS + 10,
        ):
            model_index = future_to_model[future]
            model_name = req.models[model_index]
            try:
                image_payload = future.result()
                results[model_index] = {
                    "model": model_name,
                    "data": image_payload["data"],
                    "mime_type": image_payload["mime_type"],
                }
            except Exception as e:
                err_msg = str(e)
                print(f"Warning: Model {model_name} failed: {err_msg}")
                errors.append(f"[{model_name}]: {err_msg}")

        # 检查是否已断开连接（中断）
        if await request.is_disconnected():
            print("Client disconnected, skipping billing.")
            return {"cancelled": True}

        # 过滤掉失败的结果进行计费
        successful_results = [r for r in results if r is not None]
        if not successful_results:
            raise _build_generation_failure_response(errors)

        elapsed_seconds = round(time.perf_counter() - start_time, 2)
        
        for index, result in enumerate(successful_results):
            result["elapsed_seconds"] = elapsed_seconds

        return {
            "images": successful_results,
            "elapsed_seconds": elapsed_seconds,
        }
    except concurrent.futures.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="生成超时，请稍后重试。") from exc
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        executor.shutdown(wait=False, cancel_futures=True)
