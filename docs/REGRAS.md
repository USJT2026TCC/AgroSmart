# Regras do seguro

O projeto demonstra um seguro por estiagem usando a estação A770, São Simão/SP.
O talhão é fictício e considerado coincidente com a estação. A cobertura é
hipotética; o gatilho é experimental, sem validação agronômica ou atuarial comercial.

| Parâmetro | Regra |
|---|---|
| Cobertura | Entre 01/01/2020 e 30/09/2026, com início e fim inclusivos em UTC |
| Dia utilizável | Pelo menos 20 horas válidas de precipitação |
| Dia seco | Total diário inferior a 1 mm |
| Contagem | Dias secos consecutivos, começando em zero no início da cobertura |
| Interrupção | Chuva de 1 mm ou mais, dia ausente ou dia inválido zera a sequência |
| Contratação | Exige carteira vinculada e todos os dias da cobertura utilizáveis |
| Gatilho | Inteiro de 1 a 366 dias, escolhido na contratação e fixado na emissão |
| Garantia | Depósito pela seguradora do valor integral da indenização |
| Indenização | Pagamento único de 100% do valor contratado ao atingir o gatilho |
| Prêmio | Valor informativo apresentado pela aplicação |
| Área | Informada em hectares pela seguradora; a área segurada não pode ultrapassar a cadastrada |

O oráculo publica a primeira data que atinge o gatilho. Se isso não ocorrer,
publica o último dia da cobertura, permitindo à seguradora resgatar a garantia.

Produtor e seguradora podem cancelar a apólice antes da primeira publicação
histórica. A garantia depositada é devolvida à seguradora. O recebimento da
indenização acontece na carteira beneficiária, sem assinatura adicional do produtor.

As datas meteorológicas pertencem à cobertura histórica; a emissão, os blocos e
as transferências têm as datas reais da execução. Os valores movimentados são ETH
de teste da Sepolia.

Os limites compartilhados estão em [`configuracao/historico.json`](../configuracao/historico.json).
Os contratos também aplicam restrições de período e gatilho. O contrato verifica
autorização e condições da apólice; a correção do índice depende do oráculo autorizado.
