import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import bcrypt from "bcryptjs";

/**
 * Primitivas criptograficas do backend, reunidas em um lugar so.
 *
 * Nenhuma delas e inventada aqui: bcrypt para senha e SHA-256 para resumo. O
 * codigo so escolhe os parametros e documenta por que.
 */

// ------------------------------------------------------------------ senhas

/**
 * Custo do bcrypt. Cada incremento dobra o tempo de calculo.
 *
 * 12 custa algumas centenas de milissegundos por login — imperceptivel para quem
 * entra, caro para quem tenta adivinhar milhoes de senhas a partir de um banco
 * vazado.
 */
const CUSTO_BCRYPT = 12;

/** HU13, criterio 1: senha guardada com hash e sal. O bcrypt gera e embute o sal. */
export function gerarHashDeSenha(senha) {
  return bcrypt.hash(senha, CUSTO_BCRYPT);
}

export function conferirSenha(senha, hash) {
  return bcrypt.compare(senha, hash);
}

/**
 * Hash usado quando o usuario nao existe.
 *
 * Sem ele, o login responderia rapido para usuario inexistente e devagar para
 * usuario existente com senha errada — e a diferenca de tempo revelaria quais
 * identificadores estao cadastrados.
 */
export const HASH_FICTICIO = bcrypt.hashSync("senha-que-ninguem-tem", CUSTO_BCRYPT);

// ------------------------------------------------------------------ resumos

export function sha256Hex(dados) {
  return createHash("sha256").update(dados).digest("hex");
}

/** Token aleatorio de sessao: 32 bytes, suficiente para nao ser adivinhavel. */
export function gerarToken() {
  return randomBytes(32).toString("base64url");
}

/** Comparacao em tempo constante, para chaves de servico. */
export function iguaisEmTempoConstante(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));

  if (bufA.length !== bufB.length) return false;

  return timingSafeEqual(bufA, bufB);
}
