import os
import sys

# NOTE: 在 Vercel 环境下，需要手动将当前目录加入路径，否则无法 import billing
sys.path.append(os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import billing
import service
import traceback
import concurrent.futures
from typing import Optional

app = FastAPI(title="Nanobanana API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.get("/api/balance")
def get_balance():
    return {"current_balance_usd": billing.get_current_balance()}


import time

from fastapi import FastAPI, HTTPException, Body, Request

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
                print(f"Warning: Model {model_name} failed: {e}")

        # 检查是否已断开连接（中断）
        if await request.is_disconnected():
            print("Client disconnected, skipping billing.")
            return {"cancelled": True}

        # 过滤掉失败的结果进行计费
        successful_results = [r for r in results if r is not None]
        if not successful_results:
            raise HTTPException(status_code=500, detail="生成失败：所有模型均未返回有效数据。")

        elapsed_seconds = round(time.perf_counter() - start_time, 2)
        
        # 仅针对成功的模型进行结算
        successful_model_names = [r["model"] for r in successful_results]
        image_costs = billing.apply_generation_costs(successful_model_names, len(req.images))
        
        # 将扣费信息回填到成功的图片结果中
        for index, result in enumerate(successful_results):
            result["cost_usd"] = image_costs["image_costs"][index]["cost_usd"]
            result["remaining_balance_usd"] = image_costs["image_costs"][index]["remaining_balance_usd"]
            result["elapsed_seconds"] = elapsed_seconds

        return {
            "images": successful_results,
            "current_balance_usd": image_costs["remaining_balance_usd"],
            "elapsed_seconds": elapsed_seconds,
        }
    except concurrent.futures.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="生成超时，请稍后重试。") from exc
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        executor.shutdown(wait=False, cancel_futures=True)
