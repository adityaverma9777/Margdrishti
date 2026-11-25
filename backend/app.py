import os
os.environ["GRADIO_SSR_MODE"] = "false"
try:
    import spaces
    gpu_decorator = spaces.GPU
except ImportError:
    def gpu_decorator(fn):
        return fn
import gradio as gr
import uvicorn
from src.server import app
@gpu_decorator
def check_gpu_status(prompt: str = "ping"):
    return f"StreetIQ Gov API active: {prompt}"
demo = gr.Interface(fn=check_gpu_status, inputs="text", outputs="text", title="StreetIQ Gov API")
@app.get("/")
def root():
    return {"status": "online", "service": "StreetIQ Gov API"}
app = gr.mount_gradio_app(app, demo, path="/gradio")
if __name__ == "__main__":
    port = int(os.getenv("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)