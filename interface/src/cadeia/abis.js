/**
 * Interfaces dos contratos, do ponto de vista do aplicativo.
 *
 * Como no servico de oraculo, sao declaradas a mao em vez de lidas dos artefatos
 * de compilacao do Hardhat. O aplicativo passa a depender do contrato, e nao do
 * diretorio de build de outro modulo — e uma assinatura que mudou aparece como
 * erro explicito aqui, nao como um `undefined` silencioso na tela.
 *
 * Qualquer alteracao precisa ser espelhada em blockchain/contracts/.
 */

export const ABI_FACTORY = [
  "function emitirApoliceHistorica((address produtor,address registry,bytes32 cultura,bytes32 talhao,uint32 limiarClimatico,uint64 vigenciaInicio,uint64 vigenciaFim,uint256 valorIndenizacao,bytes32 hashTermos) termos) returns (address)",
  "function seguradora() view returns (address)",
  "error NaoEhSeguradora(address chamador)",
  "error EnderecoInvalido()",
  // Erros do construtor da apolice, que reverte dentro de emitirApoliceHistorica.
  // Sem eles a MetaMask so mostrava "unknown custom error".
  "error ParametroInvalido(string campo)",
  "error PeriodoHistoricoInvalido()",
];

export const ABI_APOLICE = [
  "function seguradora() view returns (address)",
  "function instanteHistorico() view returns (uint64)",
  "function situacao() view returns (uint8)",
  "function valorPago() view returns (uint256)",
  "function periodoAcionador() view returns (uint256)",
  "function garantiaRetida() view returns (uint256)",
  "function totalPeriodos() view returns (uint256)",
  "function periodos(uint256) view returns (uint256)",
  "function verTermos() view returns ((address produtor,address registry,bytes32 cultura,bytes32 talhao,uint32 limiarClimatico,uint64 vigenciaInicio,uint64 vigenciaFim,uint256 valorIndenizacao,bytes32 hashTermos))",
  "function publicacao(uint256 periodo) view returns ((address oraculo,uint32 indiceClimatico,uint32 publicadoEm))",
  "function depositarGarantia() payable",
  "function resgatarGarantia()",
  "function cancelar()",
  "event ApoliceImplantada(address indexed seguradora, address indexed produtor, bytes32 indexed talhao, uint256 valorIndenizacao, bytes32 hashTermos)",
  "event GarantiaDepositada(address indexed seguradora, uint256 valor)",
  "event IndicesPublicados(uint256 indexed periodo, address indexed oraculo, uint32 indiceClimatico)",
  "event CondicaoAvaliada(uint256 indexed periodo, bool atendida)",
  "event PagamentoExecutado(address indexed produtor, uint256 indexed periodo, uint256 valor)",
  "event GarantiaResgatada(address indexed seguradora, uint256 valor)",
  "event ApoliceCancelada(address indexed solicitante, uint256 garantiaDevolvida)",
  "error EnderecoInvalido()",
  "error ParametroInvalido(string campo)",
  "error OrigemNaoAutorizada(address chamador)",
  "error PeriodoJaPublicado(uint256 periodo)",
  "error SituacaoInvalida(uint8 atual, uint8 esperada)",
  "error GarantiaIncorreta(uint256 enviado, uint256 esperado)",
  "error VigenciaEmCurso(uint64 agora, uint64 fim)",
  "error FalhaNaTransferencia(address destino, uint256 valor)",
  "error ReentranciaDetectada()",
  "error SemSaldoParaResgatar()",
  "error DepositoDireto()",
  "error VigenciaIniciada(uint64 agora, uint64 inicio)",
];

export const ABI_REGISTRY = ["function ehAutorizado(address oraculo) view returns (bool)"];
