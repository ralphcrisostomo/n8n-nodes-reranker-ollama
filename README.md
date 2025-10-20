![Banner image](https://user-images.githubusercontent.com/10284570/173569848-c624317f-42b1-45a6-ab09-f0ea3c247648.png)

# n8n-nodes-reranker-ollama

Use **Ollama Reranker** to reorder retrieved documents by their relevance to a given query.  
This node leverages locally served reranker models (via [Ollama](https://ollama.com)) to perform *cross-encoder–style* relevance scoring.

> Built on the official **n8n Community Node Starter**, so you can develop, lint, and ship confidently.

---

## ✨ Supported Models

This node currently supports **Qwen3 Rerankers** by [@dengcao](https://ollama.com/dengcao?q=reranker&sort=popular):

- `dengcao/Qwen3-Reranker-8B`
- `dengcao/Qwen3-Reranker-4B`
- `dengcao/Qwen3-Reranker-0.6B`

All variants and quantizations (e.g., `:Q5_K_M`, `:Q8_0`) are automatically detected.

If you’d like to request support for **other reranker models**, please open a **GitHub issue or feature request** so it can be added to the whitelist.

---

## 📦 Installation

### 🧩 Community Nodes (recommended)
You can install this node directly from the n8n **Community Nodes** interface:

1. Go to **Settings → Community Nodes** in your n8n instance.
2. Enable *Community Nodes* if you haven’t already.
3. Enter the package name:
4. Confirm and install.

---

## ⚙️ Usage

1. Add the **Reranker Ollama** node to your workflow.
2. Connect it after a **retriever** or **vector search** node (e.g., Qdrant, Pinecone, Weaviate, etc.).
3. Provide:
- **Query text** – the user query or search question.
- **Documents array** – the list of retrieved text chunks.
4. Choose a supported **Qwen3 Reranker model**.
5. The node outputs documents reordered by their **relevance scores** (0–1 scale).

---

## 🧠 Example

| Query | Documents | Output (ranked) |
|--------|------------|----------------|
| *"What is the capital of China?"* | 1️⃣ "Beijing is the capital of China." <br>2️⃣ "Gravity is a force that attracts masses." | ✅ **1️⃣ Relevant** <br>🚫 **2️⃣ Irrelevant** |

---

## 🤝 Contributing

Contributions and new model requests are welcome!  
If you’d like to see support for another **reranker model**, please:

- Open a **GitHub issue**, or
- Submit a **pull request** with your proposed model configuration.
