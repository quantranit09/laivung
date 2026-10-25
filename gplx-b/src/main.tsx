import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.tsx"

// Xin trình duyệt giữ dữ liệu lâu dài, tránh bị dọn khi thiếu dung lượng.
navigator.storage?.persist?.().catch(() => {})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
