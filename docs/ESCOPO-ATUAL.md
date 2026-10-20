# Escopo atual e regra de indenização

Protocolo `clima-integral-v1`, revisão de 16/10/2026.

O cenário principal é a estiagem. Cada dia com chuva consolidada inferior a 1 mm é
seco; um dia sem medição válida interrompe a sequência. O oráculo publica a sequência
de dias secos terminada no período. Ela pode incluir dias anteriores à vigência.
O limiar é configurável e **experimental**: não representa tolerância universal de
uma cultura e não mede perda real de produção. Excesso de chuva não é coberto.

Em apólice ativa e durante a vigência: índice abaixo do limiar implica zero;
índice igual ou superior implica **100% do limite, em parcela única**. O pagamento
usa a garantia que a seguradora depositou. Depois da liquidação, nenhuma publicação
é aceita. O produtor não precisa assinar uma transação para receber.

Não há envio ou processamento de fotos, modelo de IA, índice de dano, perito ou
contestação de laudo. O código do subsistema retirado saiu da árvore ativa; os
arquivos locais foram preservados fora desta cópia. Migrações históricas e Git
mantêm o registro do que existiu; não são funcionalidades ativas.

## Responsabilidades e carteira

| Etapa | Responsável | MetaMask |
|---|---|---|
| Login e cadastros | API e banco | Não |
| Vincular carteira | Produtor e API | Assinatura de mensagem, sem transferência |
| Cotar e enviar proposta | Aplicativo, API e banco | Não há emissão nesta etapa |
| Emitir contrato | Seguradora e fábrica | Transação da seguradora |
| Depositar garantia | Seguradora e apólice | Outra transação da seguradora |
| Receber leituras | Fonte, API e banco | Não |
| Calcular e publicar índice | Oráculo | Chave própria do serviço |
| Pagar | Apólice em Solidity | Produtor recebe sem assinar |
| Mostrar pagamento | Indexador e aplicativo | Conferir recibo e saldo na rede correta |
| Cancelar antes da vigência | Produtor ou seguradora | Transação; garantia retorna à seguradora |

O banco guarda cadastros, propostas, leituras e eventos indexados. Ele não move a
garantia. A assinatura autentica uma origem; não comprova que o sensor mediu a
realidade. O oráculo de nó único continua sendo uma fronteira de confiança.

## Compatibilidade e migração

Os campos `modoPagamento` e `limiarClimaticoIntegral` permanecem no formato da ABI,
mas só aceitam 0 e 0. O valor de enum legado 1 existe apenas para rejeição explícita;
não há interpolação na implementação. A migração 008 desativa ofertas antigas
incompatíveis e impede produtos ativos com pagamento parcial. Propostas antigas
são preservadas e têm a preparação recusada: é necessária nova cotação.

Contratos já implantados são imutáveis. A implantação atual de 19/10/2026, em
`contratos/implantacoes/sepolia.json`, usa `versaoProtocolo: clima-integral-v1`.
O registro e a fábrica têm código verificado no Etherscan. As implantações
antigas saíram da operação e estão em testes/evidencias/legado. A confirmação
pela MetaMask real é distinta da compilação, dos testes e da verificação do fonte.

## Fundamentação e contribuição

O recorte implementa e avalia um fluxo de seguro climático automatizado, da recepção
de leituras autenticadas à liquidação em contrato inteligente, com rastreabilidade,
controle de acesso e tratamento de falhas. Cancelamento com devolução da garantia,
cobertura e análise estática fazem parte da avaliação. O registro e a fábrica atuais foram implantados
e verificados na Sepolia em 19/10/2026; isso não substitui o aceite pela MetaMask.

A comparação deve demonstrar etapas, falhas testadas e evidências disponíveis,
sem presumir novidade pela ausência de descrição em outro artigo. A referência
[Manoj T. et al. (2025)](https://www.frontiersin.org/journals/blockchain/articles/10.3389/fbloc.2024.1481339/full)
inclui oráculo descentralizado e experimentos em Ganache e Sepolia; o AgroSmart usa
nó único e não reivindica superioridade nesse aspecto.

Indenização escalonada é trabalho futuro, dependente de fundamentação e dados por
solo, cultura, região, fase de desenvolvimento, época do ano e risco coberto,
com validação agronômica e atuarial. Não basta escolher faixas arbitrárias.

Veja [resultados desta revisão](../testes/evidencias/clima-integral-2026-10-16/README.md).


### Migração de contas do papel retirado

`006_z_arquivar_perfil.sql` é aplicada antes de 007 e preserva as contas antigas e
suas referências, registra o papel em `perfil_legado`, bloqueia o acesso e revoga
sessões. O valor técnico de perfil é normalizado para satisfazer o esquema atual,
mas a conta bloqueada não é um produtor ativo: fica excluída de cadastros e do login.
Isso evita que o banco inicial falhe na remoção do perfil antigo. A migração foi
conferida sobre uma cópia do banco local; o banco original não foi modificado.
O oráculo agora bloqueia o preparo de publicação com menos de duas fontes válidas,
em vez de apenas exibir o alerta herdado; não há alternativa por imagem.
