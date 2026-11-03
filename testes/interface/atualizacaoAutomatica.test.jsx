/**
 * Atualizacao automatica das telas de acompanhamento, que substitui o botao "Atualizar".
 */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useAtualizacaoAutomatica } from "../../interface/src/api/atualizacaoAutomatica.js";

let visibilidade = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  visibilidade = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibilidade);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("busca de novo a cada intervalo enquanto a aba esta visivel", () => {
  const carregar = vi.fn();
  renderHook(() => useAtualizacaoAutomatica(carregar, 1000));

  vi.advanceTimersByTime(3000);
  expect(carregar).toHaveBeenCalledTimes(3);
});

test("com a aba escondida nao consulta, e volta a consultar ao reaparecer", () => {
  const carregar = vi.fn();
  renderHook(() => useAtualizacaoAutomatica(carregar, 1000));

  visibilidade = "hidden";
  vi.advanceTimersByTime(3000);
  expect(carregar).not.toHaveBeenCalled();

  visibilidade = "visible";
  document.dispatchEvent(new Event("visibilitychange"));
  expect(carregar).toHaveBeenCalledTimes(1);
});

test("para de consultar quando a tela sai", () => {
  const carregar = vi.fn();
  const { unmount } = renderHook(() => useAtualizacaoAutomatica(carregar, 1000));

  unmount();
  vi.advanceTimersByTime(5000);
  expect(carregar).not.toHaveBeenCalled();
});
