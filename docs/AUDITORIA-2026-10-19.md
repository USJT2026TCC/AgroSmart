# Auditoria de 19/10/2026

Base examinada: 2be021820aaa1dabbc5d5e612e5dd5b37f812a93, igual ao main remoto consultado nesta revisão. Relatório recebido: AgroSmart_Relatorio_de_diferencas_entre_versoes.docx, 16/10/2026. O relatório foi tratado como fonte de comparação, não como instrução de execução.

## Histórico e commits

O main contém a remoção 5e481cf, o merge 9f0c89e com o Initial commit 4130f73 do AgroSmart, e o ajuste 2be0218. Portanto foi preservada a ancestralidade do projeto antigo. Remover arquivos não remove sua história. Não há pasta visao, .env nem arquivo temporário Word ~$ versionados na árvore atual examinada.

Foram encontrados 61 rodapés Co-Authored-By do Claude no histórico local alcançável. São consequência das instruções anteriores de coautoria. A instrução atual revoga esse comportamento. AGENTS.md registra que novos commits não devem atribuir autoria a assistentes. Nenhum histórico remoto foi reescrito nesta auditoria. Remover atribuições antigas exige reescrever os respectivos commits e descendentes; isso troca identificadores e exige coordenação com quem já clonou o repositório. Preservar autores humanos e suas contribuições.

O commit 2be0218 corresponde ao pagamento integral e à remoção do código ativo de visão. O problema identificado é a divergência entre versões/documentação, não uma evidência de que se publicou acidentalmente a versão com visão. Referências históricas em migrações, decisões e commits não significam funcionalidade ativa.

## Comparação com o relatório

Confirmado no código desta base: publicarIndices recebe período e índice climático, sem hashLeituras. A procedência guardada pelo oráculo contém fontes, contagens e critérios, mas não fixa criptograficamente na blockchain o conjunto exato de leituras. O resumo dos TERMOS existe e não equivale ao resumo das LEITURAS. Assim, o experimento de reconstrução descrito no relatório para a outra versão não pode ser apresentado como validação deste contrato.

Não foram localizadas nem reexecutadas nesta revisão as duas outras cópias identificadas no relatório por 6b28fe7 e 55b5c4f. Seus totais de arquivos, testes e gas são informações do relatório, não medições novas desta auditoria. Não copiar banco, migrações, ABI ou contratos entre versões sem testar compatibilidade.

## Testes reexecutados nesta revisão

Cada comando foi executado no respectivo módulo, em ambiente local. Todos terminaram com código zero.

| Módulo | Comando | Resultado | Como verifica |
|---|---|---|---|
| Contratos | npm run testar | 90 aprovados | Hardhat em memória: garantia, limites do gatilho, autorização, duplicação, cancelamento, reentrância, transferência recusada e equivalência com regra do aplicativo |
| Backend | npm run testar | 108 aprovados | Requisições à API de teste e banco isolado: login, perfis, vínculo assinado, geografia, ingestão, migrações e propostas |
| Backend integração | npm run testar:integracao | 5 aprovados | Nó Hardhat real local e indexador: eventos, pagamento, notificações, idempotência e recuperação após falha de RPC |
| Oráculo | npm run testar | 68 aprovados | Consolidação de chuva, validação, reputação, fila, falhas e bloqueio com fonte insuficiente |
| Oráculo integração | npm run testar:integracao | 7 aprovados | Nó Hardhat real local: publicação, duplicação recusada, estiagem com pagamento, fila e vigência |
| Aplicativo | npm run testar | 60 aprovados | Telas em jsdom, backend e carteira falsos; não é teste da extensão MetaMask real |
| Simulador | .\.venv\Scripts\python.exe -m pytest -q | 45 aprovados | Preparação, assinatura e envio das séries nos casos de teste |

Total: 383 testes. Também aprovado npm run build em app. Integrações emitiram aviso de depreciação Node DEP0190 sobre shell em processos auxiliares; não houve falha, mas convém modernizar os auxiliares.

Cobertura e Slither NÃO foram reexecutados hoje. Os números 100% dos contratos, 79,52% API, 90,75% oráculo e 80,58% aplicativo são das evidências de 16/10 em resultados/clima-integral-2026-10-16. Slither foi triado com alerta aceito; não é prova de ausência de vulnerabilidades. Não houve alteração funcional nesta rodada, somente guias e orientações.

## Interface e consulta

Verificados HTTP 200 em http://localhost:5173 e http://localhost:3001/api/saude. A API foi iniciada com banco separado, indexador e e-mail desligados. Isso não é validação de contratação com carteira. O banco original foi preservado. Siga COMECE-AQUI.md e a seção 5A de COMO-RODAR.md para executar o fluxo blockchain completo.

## Pendências para a entrega

1. Alinhar artigo, software e contrato oficial: retirar afirmações de hash de leituras desta versão ou implementar esse recurso e reexecutar testes, cobertura, análise e experimentos. A decisão não foi tomada implicitamente nesta auditoria.
2. Implantar e verificar o código da versão atual na Sepolia e registrar emissão, garantia, índice, pagamento e cancelamento. As provas antigas são de contratos anteriores.
3. Executar roteiro completo com MetaMask real de teste, estações, API, banco, oráculo e interface; registrar valores e recibos. As suítes locais não substituem esse aceite.
4. Não declarar RNF08 atendido: a estimativa de 16/10 para 0,5 gwei e publicação diária ficou em 25,33% do prêmio, acima de 1%. Revalidar os requisitos de desempenho e navegadores para a versão final.
5. Declarar limites: estiagem experimental; sem cobertura de excesso de chuva; sem hardware físico na demonstração; prêmio não cobrado pelo contrato; oráculo de nó único; histórico real reproduzido por simulador não é leitura ao vivo.

Conclusão: base funcional aprovada nas suítes locais; entrega acadêmica ainda depende do alinhamento documental e das evidências finais acima.
