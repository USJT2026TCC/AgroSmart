const { createRequire } = require("node:module");
const path = require("node:path");
const { expect } = createRequire(path.resolve(__dirname, "../../../blockchain/package.json"))(
  "chai",
);
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * Utilitarios compartilhados pelos testes.
 *
 * Concentrar a montagem dos termos aqui evita que cada arquivo de teste repita
 * dez campos e, principalmente, evita que um teste passe por engano porque
 * montou a apolice com um parametro diferente do que pretendia exercitar.
 */

/** Ciclo de vida da apolice, espelhando o enum do contrato. */
const Situacao = {
  AGUARDANDO_GARANTIA: 0,
  ATIVA: 1,
  LIQUIDADA: 2,
  ENCERRADA: 3,
  CANCELADA: 4,
};

const VALOR_INDENIZACAO = ethers.parseEther("1.0");
const DIA = 24 * 60 * 60;

const b32 = (texto) => ethers.encodeBytes32String(texto);
const hash = (texto) => ethers.keccak256(ethers.toUtf8Bytes(texto));

/**
 * Monta os termos de uma apolice com valores padrao de estiagem em soja.
 *
 * Padrao: aciona com 30 dias consecutivos sem chuva, pagamento integral,
 * cobertura historica de 2020 a 2024.
 */
async function montarTermos(overrides = {}) {
  return {
    produtor: ethers.ZeroAddress,
    registry: ethers.ZeroAddress,
    cultura: b32("soja"),
    talhao: b32("talhao-01"),
    limiarClimatico: 30,
    vigenciaInicio: 1577836800,
    vigenciaFim: 1735689599,
    valorIndenizacao: VALOR_INDENIZACAO,
    hashTermos: hash("termos-da-apolice-v1"),
    ...overrides,
  };
}

/**
 * Cenario base usado pela maioria dos testes: registro implantado, oraculo
 * autorizado e apolice ativa com a garantia ja depositada.
 */
async function cenarioApoliceAtiva(overrides = {}) {
  const [seguradora, produtor, oraculo, estranho] = await ethers.getSigners();

  const registry = await ethers.deployContract("OracleRegistry", [seguradora.address]);
  await registry.connect(seguradora).autorizar(oraculo.address);

  const termos = await montarTermos({
    produtor: produtor.address,
    registry: await registry.getAddress(),
    ...overrides,
  });

  const apolice = await ethers.deployContract("ApoliceHistorica", [seguradora.address, termos]);
  await apolice.connect(seguradora).depositarGarantia({ value: termos.valorIndenizacao });

  return { registry, apolice, termos, seguradora, produtor, oraculo, estranho };
}

/** Publicacao padrao de um periodo com o indice climatico informado. */
function publicar(apolice, oraculo, periodo, indiceClimatico) {
  return apolice.connect(oraculo).publicarIndices(periodo, indiceClimatico);
}

module.exports = {
  expect,
  Situacao,
  VALOR_INDENIZACAO,
  DIA,
  b32,
  hash,
  montarTermos,
  cenarioApoliceAtiva,
  publicar,
};
