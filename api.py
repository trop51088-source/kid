from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import uuid
import asyncio
import importlib.util
import sys

# Добавляем корневую директорию в путь, чтобы импортировать логику
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from chestniy_znak import decode_from_image, get_product_info, STATUS_MAP, LABELS
except ImportError:
    spec = importlib.util.spec_from_file_location("chestniy_znak", "../chestniy_znak.py")
    cz = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cz)
    decode_from_image = cz.decode_from_image
    get_product_info = cz.get_product_info
    STATUS_MAP = cz.STATUS_MAP
    LABELS = cz.LABELS

app = FastAPI()

# CORS: только доверенные origin (было "*")
ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "https://mypillbox.online,https://www.mypillbox.online,http://localhost:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

UPLOAD_DIR = "temp_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 МБ
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}
MAX_TEXT_LEN = 512


@app.post("/scan")
async def scan_product(file: UploadFile = File(...)):
    # Защита от path traversal: имя файла клиента не используем,
    # генерируем своё; расширение — только из белого списка.
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="Недопустимый тип файла")

    file_path = os.path.join(UPLOAD_DIR, f"{uuid.uuid4().hex}{ext}")

    # Ограничение размера загрузки
    size = 0
    with open(file_path, "wb") as buffer:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                buffer.close()
                os.remove(file_path)
                raise HTTPException(status_code=413, detail="Файл слишком большой (макс. 10 МБ)")
            buffer.write(chunk)

    try:
        cis = decode_from_image(file_path)
        data = await get_product_info(cis)
        return {"success": True, "cis": cis, "data": data}
    except Exception:
        # Не раскрываем внутренние детали ошибок клиенту
        return {"success": False, "error": "Не удалось распознать код"}
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)


@app.post("/scan-text")
async def scan_text(payload: dict):
    text = payload.get("text")
    if not text or not isinstance(text, str):
        raise HTTPException(status_code=400, detail="No text provided")
    if len(text) > MAX_TEXT_LEN:
        raise HTTPException(status_code=400, detail="Слишком длинный код")

    try:
        data = await get_product_info(text)
        return {"success": True, "cis": text, "data": data}
    except Exception:
        return {"success": False, "error": "Не удалось получить данные о товаре"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
