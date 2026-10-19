# Arquitetura

Este documento explica como as peças implementadas se encaixam e, principalmente, **por que a
fronteira entre computação externa e execução em cadeia fica onde fica**. É a decisão que
define o trabalho; tudo o mais decorre dela.

---

## 1. O critério da fronteira

A pergunta de pesquisa do TCC é como projetar uma ponte auditável entre uma computação
externa — não determinística e intensiva em processamento — e uma execução contratual em
cadeia, determinística e cara.

O critério adotado é direto:

> **Fora da cadeia** fica o que é pesado, probabilístico ou muda com frequência.
> **Na cadeia** fica o que precisa ser confiável sem depender de quem executa.

Aplicando:

| Operação | Onde | Por quê |
|---|---|---|
| Ingestão de leituras de sensores | Fora | Volume alto, custo por byte na cadeia é proibitivo |
| Validação de plausibilidade | Fora | Regra que muda conforme o instrumento e a cultura |
| Escore de reputação das fontes | Fora | Precisa de histórico longo; armazená-lo em cadeia seria caríssimo |
| Consolidação do índice | Fora | Depende dos dois itens acima |
| **Assinatura e submissão** | **Ponte** | É o ato que cruza a fronteira |
| Termos da apólice e resumo criptográfico | Na cadeia | Precisam ser imutáveis e verificáveis por terceiros |
| Lista de endereços autorizados | Na cadeia | É o controle de acesso que sustenta tudo |
| Avaliação da condição contratada | Na cadeia | É a decisão que ninguém pode contestar depois |
| Transferência da indenização | Na cadeia | É o ato que move valor |

## 2. O que atravessa a fronteira

Uma única chamada de função, com dois argumentos:

```solidity
publicarIndices(
    uint256 periodo,          // dia de referência, no formato AAAAMMDD
    uint32  indiceClimatico   // dias consecutivos sem chuva
)
```

Repare no que **não** atravessa: nenhuma leitura bruta de sensor, nenhum cálculo de
plausibilidade ou de reputação. Apenas o número consolidado.

Essa é a resposta técnica do trabalho ao problema do oráculo. A consolidação do índice não é
replicada na cadeia — seria caro e, no caso da validação de plausibilidade, nem determinístico
entre nós. O contrato confia na assinatura de quem publicou, não no valor em si.

> A versão anterior do contrato também aceitava um índice de dano por imagem, com confiança,
> hash das evidências e versão do modelo — seis argumentos em `publicarIndices`. O módulo de
> visão computacional que produzia esses números foi removido nesta cópia (ver DECISOES.md), e o
> contrato passou a aceitar só o índice climático.

O contrato não verifica se o índice está correto. Ele verifica se **quem publicou tinha
autorização**. A confiança no valor vem da possibilidade de auditoria posterior, não de uma
checagem em tempo de execução.

## 3. Os componentes implementados

### 3.1 Na cadeia — `contratos/`

```
  OracleRegistry                 ApoliceFactory
  ──────────────                 ──────────────
  lista de endereços             emite e indexa apólices
  autorizados a publicar         (uma por contrato firmado)
         ▲                                │
         │ consultado a cada              │ implanta
         │ publicação                     ▼
         └──────────────────────  ApolicePolicy
                                  ─────────────
                                  termos imutáveis + hash
                                  avaliação da condição
                                  transferência da indenização
```

**Por que o registro é um contrato separado?** Se a lista de oráculos vivesse dentro de cada
apólice, revogar um endereço comprometido exigiria uma transação por apólice. Com dez mil
apólices ativas, isso é inviável — e a meta é suportar dez mil talhões monitorados. Com
o registro compartilhado, a revogação é uma transação só e passa a valer imediatamente para
toda a carteira.

O custo dessa escolha é uma chamada externa de leitura por publicação. Está medido: aparece na
diferença entre os 172 mil de gas de uma publicação comum e o que ela custaria com a lista
embutida. É um trade-off consciente, discutido em [DECISOES.md](DECISOES.md).

### 3.2 Fora da cadeia — `oraculo/`

```
  fonteSimulada ──► consolidador ──► fila ──► publicador ──► registro
   (leituras)       (RF12, RF13,    (RF21)   (RF19, RF22)   (RNF18)
                     RF19)             │
                       ▲               │
                       │               ▼
                   reputacao        disco: a entrada só sai
                    (RF13)          depois da confirmação
```

A ordem importa e não é acidental. **A consolidação grava em disco antes de qualquer tentativa
de publicação.** Entre consolidar um índice e vê-lo confirmado na cadeia existe uma janela em
que tudo pode dar errado: a rede congestiona, o nó RPC cai, o processo morre. Se o índice
existisse apenas na memória do processo, ele se perderia — e o RNF20 diz que indisponibilidade
do oráculo ou da rede não pode causar perda de dados.

Com a fila em disco, reiniciar o serviço retoma exatamente de onde parou, **preservando o
período de referência original**. Isso é o RF21, e está validado por teste e por execução real
contra um nó derrubado de propósito.

### 3.3 Fora da cadeia — `backend/`

API em Node.js + Express sobre PostgreSQL com PostGIS. Guarda o que a cadeia não deve guardar
(cadastro, geometria, leituras, imagens, sessões, texto dos termos) e liga as peças fora da
cadeia entre si. **Não tem chave privada de ninguém**: só confere assinaturas — do produtor ao
vincular carteira, da fonte ao enviar leituras, e da seguradora ao emitir, relendo a transação
na cadeia. Um indexador acompanha os eventos e mantém um espelho consultável, mas a autoridade
continua sendo o contrato. Detalhes em [BACKEND.md](BACKEND.md).

### 3.4 Fora da cadeia — `app/`

Aplicativo React que fala com o backend (sessão, cadastro, propostas) e **diretamente com a
cadeia** para tudo que envolve valor: a carteira da seguradora assina a emissão e o depósito, e
a tela da apólice lê estado, índices e linha do tempo da rede. A conferência dos termos (RF08)
recalcula o resumo no navegador, sem confiar no backend. Detalhes em [APLICATIVO.md](APLICATIVO.md).

## 4. O fluxo completo, do sensor ao pagamento

Correspondente ao diagrama de sequência da documentação de software (Figura 8, UC07 a UC13):

```
 1. estações (INMET)  →  lote de leituras assinado pela chave da fonte,
                         por HTTP ou por MQTT com ponte
    backend           →  confere a assinatura e a plausibilidade; grava
 2. consolidador      →  descarta implausíveis, atualiza reputação,
                         conta dias consecutivos sem chuva
 3. fila              →  grava a publicação em disco
 ─────────────────────── FRONTEIRA ────────────────────────────────
 4. publicador        →  assina e submete em uma única transação
 5. ApolicePolicy     →  confere no OracleRegistry se o remetente pode publicar
 6. ApolicePolicy     →  rejeita se o período já foi publicado
 7. ApolicePolicy     →  grava o índice climático; emite IndicesPublicados
 8. ApolicePolicy     →  avalia a condição; emite CondicaoAvaliada
 9. ApolicePolicy     →  se atendida: marca LIQUIDADA e transfere
10. ApolicePolicy     →  emite PagamentoExecutado
 ───────────────────────────────────────────────────────────────────
11. registro          →  grava txHash, gas, bloco e latência
12. fila              →  marca a entrada como concluída
13. backend           →  recebe o relato do oráculo; o indexador lê os eventos
                         e notifica produtor e seguradora
```

Os passos 5 a 10 acontecem **dentro de uma única transação**. Ou todos completam, ou nenhum
acontece. Não existe estado intermediário em que o índice ficou publicado mas o pagamento
falhou: nesse caso a transação inteira é revertida e o período volta a ficar disponível.

Essa é a garantia de atomicidade do RNF13, e ela é testada com um contrato beneficiário que
rejeita transferências de propósito.

## 5. Onde a intervenção humana entra — e onde não entra

Entra na configuração: a seguradora cadastra o produto, define o limiar, autoriza o oráculo e
deposita a garantia.

**Não entra na decisão de pagar.** A mensagem 9 do fluxo acima é a única que movimenta valor,
e não passa por aprovação. É o principal benefício do sistema e também o seu principal risco —
o que justifica o rigor dos requisitos RNF06 a RNF15 e a cobertura de 100% dos caminhos
condicionais exigida pelo RNF12.

## 6. O que ainda falta

| Peça | Sprint | Nota |
|---|---|---|
| Implantação em Sepolia | 4 | Exige endpoint RPC e ETH de teste; ver COMO-RODAR §7 |

Ingestão e banco (PostgreSQL + PostGIS), o aplicativo React e o simulador de estações já estão
implementados. O simulador envia a série real de uma estação do INMET, assinada — ver
[SIMULADOR.md](SIMULADOR.md) e [DADOS.md](DADOS.md).

A interface com essas peças já está definida. O simulador precisa seguir o contrato de ingestão
de [BACKEND.md §5](BACKEND.md).
