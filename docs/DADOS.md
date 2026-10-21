# Dados do INMET

A demonstracao usa somente Sao Simao/SP, estacao automatica A770, de 01/01/2020
a 30/09/2026. O talhao e ficticio e considerado coincidente com a estacao por
hipotese. Os registros meteorologicos sao reais e mantem suas datas originais.
Nao ha sensores em tempo real nem estimativa de perda agricola.

Fonte oficial: [INMET — dados historicos](https://portal.inmet.gov.br/dadoshistoricos).
Os ZIPs anuais nacionais sao baixados somente para reconstruir o pacote.
O ETL seleciona A770, interpreta o CSV, valida valores, trata duplicatas e agrega
precipitacao diaria. Os CSVs originais, diarios, procedencia e hashes ficam em
`api/recursos/inmet/A770`. Nao e necessario baixar novamente para usar o sistema.

## Qualidade

Ausentes e sentinelas nao viram zero. Valores nao finitos, negativos ou acima de
500 mm/h sao invalidos no preparo. Duplicatas identicas nao sao somadas;
duplicatas conflitantes invalidam a hora. Sao mantidas as contagens de horas
validas, invalidas e ausentes. Dia utilizavel exige pelo menos 20 horas validas:
isso nao comprova ausencia de chuva nas horas sem medicao.

Soma diaria abaixo de 1 mm conta como dia seco. Uma lacuna interrompe a sequencia;
a proposta rejeita coberturas com dias incompletos. A contagem comeca em zero no
inicio da cobertura hipotetica. O gatilho configuravel e experimental, nao um
limite agronomico validado para culturas, solos, fases ou regioes.

## Preparacao e uso

Para reconstruir, veja [ETL](../etl/README.md): `npm run dados:preparar`
prepara e atualiza o pacote publico. Requer o ambiente Python instalado.
Para usar o projeto com o pacote existente, basta configurar a Sepolia, abrir
Docker Desktop e executar `npm start`. Python nao participa desse uso normal.

O backend importa `inmet_arquivos` e `inmet_dias` automaticamente e ignora anos
com hashes identicos. O volume Docker preserva os dados localmente; nao sincroniza
bancos entre computadores. O pacote publico no Git permite reproduzir a carga
em outra instalacao, sem distribuir usuarios, senhas ou carteiras.

O oraculo consulta `/oraculo/serie-historica` com autenticacao de servico. A API
confere o hash da serie congelada na proposta e busca `inmet_dias`; o oraculo
confere termos com a cadeia, confronta os dias recebidos com o pacote publico
e recalcula o primeiro acionamento. A serie meteorologica e consultada somente
em `inmet_dias`, com procedencia registrada em `inmet_arquivos`.

Hashes permitem conferir integridade; nao sao assinaturas digitais do INMET.
O contrato confia no oraculo autorizado para o indice e nao acessa os arquivos
nem consulta o PostgreSQL. Uma consulta de estiagem nao significa pagamento;
a emissao, a garantia, a publicacao e o recibo on-chain sao etapas distintas.
O estado da fabrica publica e registrado em [escopo atual](ESCOPO-ATUAL.md).
