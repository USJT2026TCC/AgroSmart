import { useEffect, useRef } from "react";

/** De quanto em quanto tempo as telas de acompanhamento buscam dados novos. */
export const INTERVALO_DE_ATUALIZACAO_MS = 20_000;

/**
 * Chama `carregar` de tempos em tempos e quando a aba volta a ficar visivel.
 *
 * Substitui o botao "Atualizar": o que muda fora da tela (a seguradora emitiu, o
 * oraculo publicou, o contrato pagou) aparece sozinho. Com a aba escondida nao ha
 * consulta, para nao gastar o limite do no publico da Sepolia.
 */
export function useAtualizacaoAutomatica(carregar, intervalo = INTERVALO_DE_ATUALIZACAO_MS) {
  const atual = useRef(carregar);
  atual.current = carregar;

  useEffect(() => {
    const chamar = () => {
      if (document.visibilityState === "visible") atual.current();
    };
    const temporizador = setInterval(chamar, intervalo);
    document.addEventListener("visibilitychange", chamar);

    return () => {
      clearInterval(temporizador);
      document.removeEventListener("visibilitychange", chamar);
    };
  }, [intervalo]);
}
