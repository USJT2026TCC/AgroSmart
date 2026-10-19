# Revisão do fluxo climático integral

Data: 16/10/2026. Protocolo `clima-integral-v1`. Rede da demonstração: Hardhat, chainId 31337.

## Escopo e resultado

Sem módulo de imagens, IA, índice de dano, perícia ou retificação. Índice de estiagem
experimental, pagamento de 100% do limite em parcela única. Não há validação agronômica
nem cobertura de excesso de chuva. Fonte sintética nesta demonstração de contratos;
o simulador INMET é testado separadamente. Dados reais de chuva e talhão fictício
devem ser declarados quando se utiliza esse segundo roteiro.

| Verificação | Resultado |
|---|---|
| Contratos | 90 testes; 100% instruções, ramos, funções e linhas nos três contratos de produção |
| API | 108 testes aprovados; inclui rejeição de proposta parcial legada e proteção do banco |
| Indexador com blockchain local | 5 testes aprovados |
| Oráculo | 68 unitários + 7 de integração aprovados |
| Aplicativo | 60 testes; 80,58% linhas; 74,45% ramos; build aprovado |
| Simulador | 45 testes aprovados |
| Slither | 1 alerta novo triado e aceito; zero resultados finais com supressões justificadas |
| Pagamento demonstrado | 1 ETH contratado; 1 ETH recebido; saldo final zero |
| Falhas demonstradas | Origem não autorizada e segundo pagamento recusados |
| Cancelamento | Estado CANCELADA e saldo zero após devolução da garantia |

As supressões preexistentes permanecem no código. O alerta novo `arbitrary-send-eth`
não foi corrigido como uma vulnerabilidade: foi aceito por se tratar do destino fixo
contratado. [Triagem](triagem-slither.json). Testes e análise não provam ausência de falhas.

## Gas local

| Operação | Gas |
|---|---:|
| Emissão | 1301916 |
| Garantia | 47132 |
| Primeira publicação sem pagamento | 129027 |
| Publicação que paga | 174942 |
| Cancelamento com garantia | 44252 |

[Registro verificável](gas-e-fluxo.json). Gerado por
`npx hardhat run scripts/avaliar-integral.js`, dentro de `contratos/`.
O script exige a rede efêmera Hardhat e valida os saldos e as rejeições.

## Custo hipotético RNF08

180 publicações, pagamento na última: 24619823 gas estimados usando conservadoramente
o gas da primeira publicação sem pagamento para as demais. Limite de 1,08 ETH e
prêmio de 4,5% (0,0486 ETH). A **hipótese** de 0,5 gwei resulta em 25.33% do prêmio:
a meta de 1% não é atendida neste cenário. Isso não é medição de mercado ou da
rede principal. Reproduzir com `node scripts/custo-por-apolice.js`.

## Reprodução e limites

Executar `npm run testar` em contratos, backend e app; `npm run testar:tudo` em
oraculo; `npm run testar:integracao` em backend; pytest no ambiente do simulador.
Cobertura: `npx hardhat coverage` em contratos e `npm run cobertura` nos módulos JS.
Slither recompila/limpa artefatos: não executar em paralelo às integrações.

As evidências públicas de 07 e 08/10 pertencem a contratos antigos. A implantação e
a verificação pública de **clima-integral-v1** na Sepolia continuam pendentes.
As medições de carga, latência e navegadores de versões anteriores precisam de
revalidação; não se presume cumprimento de todos os RNFs. O Word foi editado com
base no documento em revisão interrompida, incorporando as correções anteriores.


Cobertura de linhas: API 79,52%; oráculo 90,75%; aplicativo 80,58%. O simulador foi
testado, mas sua cobertura não foi medida nesta rodada. Total: 383 testes aprovados,
somando 90 de contratos, 108 de API, 5 do indexador, 68 do oráculo, 7 de integração
do oráculo, 60 do aplicativo e 45 do simulador. As saídas completas correspondentes
estão nesta pasta. Os hashes SHA-256 dos contratos finais estão em fontes-sha256.json.

O banco antigo foi copiado antes da auditoria: continha só a migração 001 e uma
conta do papel retirado. Na cópia, todas as migrações concluíram, preservando a
conta bloqueada e desativando duas ofertas parciais. O banco original foi preservado.
