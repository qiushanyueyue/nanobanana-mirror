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


@app.post("/api/generate")
def generate(req: GenerateRequest = Body(...)):
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
            timeout=service.GENERATION_TIMEOUT_SECONDS + 15,
        ):
            model_index = future_to_model[future]
            model_name = req.models[model_index]
            image_payload = future.result()
            results[model_index] = {
                "model": model_name,
                "data": image_payload["data"],
                "mime_type": image_payload["mime_type"],
            }

        image_costs = billing.apply_generation_costs(req.models, len(req.images))
        for index, result in enumerate(results):
            if not result:
                continue

            result["cost_usd"] = image_costs["image_costs"][index]["cost_usd"]
            result["remaining_balance_usd"] = image_costs["image_costs"][index]["remaining_balance_usd"]

        return {
            "images": [result for result in results if result],
            "current_balance_usd": image_costs["remaining_balance_usd"],
        }
    except concurrent.futures.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="生成超时，请稍后重试。") from exc
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        executor.shutdown(wait=False, cancel_futures=True)
