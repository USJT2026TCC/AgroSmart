import { semear } from "../../../api/src/banco/semente.js";
// Vinculo predefinido existe apenas na montagem dos testes, nunca na API de uso.
export async function semearParaTeste(banco) {
  const criada = await semear(banco);
  await banco.query(
    "UPDATE usuarios SET carteira = $1, carteira_vinculada_em = now() WHERE identificador = 'produtor'",
    ["0x70997970c51812dc3a010c7d01b50e0d17dc79c8"],
  );
  return criada;
}
