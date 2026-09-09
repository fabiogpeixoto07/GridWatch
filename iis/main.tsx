import { createRoot } from "react-dom/client";
import Game from "../app/page";
import "../app/globals.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Elemento principal do jogo não foi encontrado.");
}

createRoot(container).render(<Game />);
