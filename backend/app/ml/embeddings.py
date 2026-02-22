from sentence_transformers import SentenceTransformer
import numpy as np

# Load model once globally
model = SentenceTransformer("all-MiniLM-L6-v2")

def generate_embedding(text: str) -> list[float]:
    """
    Generate embedding vector (length 384) for input text.
    """
    if not text:
        text = ""

    embedding = model.encode(
        text,
        normalize_embeddings=True
    )

    return embedding.tolist()