import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { ProvedorCarteira } from "./cadeia/CarteiraContexto";
import { ProvedorSessao } from "./sessao/SessaoContexto";
import "./estilos.css";

/** Interface usa exclusivamente a carteira fornecida pelo navegador. */
function iniciar() {
  createRoot(document.getElementById("raiz")).render(
    <React.StrictMode>
      <BrowserRouter>
        <ProvedorSessao>
          <ProvedorCarteira>
            <App />
          </ProvedorCarteira>
        </ProvedorSessao>
      </BrowserRouter>
    </React.StrictMode>,
  );
}

iniciar();
