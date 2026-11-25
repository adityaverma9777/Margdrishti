import os
import gradio as gr
import uvicorn
from src.server import app
with gr.Blocks(title="StreetIQ Gov API") as demo:
    gr.Markdown("## StreetIQ Gov API")
    gr.Markdown("FastAPI & Road Survey Vision Service is running.")
app = gr.mount_gradio_app(app, demo, path="/")
if __name__ == "__main__":
    port = int(os.getenv("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)
