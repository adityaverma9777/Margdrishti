import os
os.environ["GRADIO_SSR_MODE"] = "false"
import uvicorn
from src.server import app
@app.get("/")
def root():
    return {"status": "online", "service": "StreetIQ Gov API"}
if __name__ == "__main__":
    port = int(os.getenv("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)