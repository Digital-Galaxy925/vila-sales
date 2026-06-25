## Objetivo

Tornar a tela **Upload de Livros** a única fonte de dados da aplicação. As telas listadas deixam de ter upload próprio e passam a ler diretamente os dados já enviados naquela tela. Se o usuário abrir uma análise sem ter feito upload, aparece um aviso com botão "Ir para Upload de Livros".

## Telas impactadas

1. Análise Gerencial (`/gerencial`)
2. Análise DDV (`/ddv`)
3. Comparativo de Livros (`/comparativo`)
4. Simulador Massivo (`/simulador-massivo`)
5. Transferência (`/transferencia`)
6. Upload ST (`/upload-st`)

## O que será feito em cada tela

- **Remover** o bloco de upload (input de arquivo, botões "Selecionar arquivo", parsers locais de XLSX/CSV específicos da tela e estados como `uploadedFile`).
- **Substituir** a leitura por `useAppData()` (cache global) + `loadLivrosFromSupabase()` como fallback. Esses dados já são os mesmos gerados em `Upload de Livros`.
- **Adicionar** um componente compartilhado `NoDataNotice` (`src/components/NoDataNotice.tsx`) que mostra:
  - ícone de alerta
  - mensagem: "Nenhum dado encontrado. Faça o upload dos arquivos em Upload de Livros para visualizar esta análise."
  - botão azul Apple "Ir para Upload de Livros" → navega para `/upload-livros`.
- **Mantém-se intacto**: filtros, KPIs, tabelas, exportação, lógica de cálculo. Só muda a origem dos dados.

## Observações importantes (riscos)

- **Upload ST** e **Transferência** hoje trabalham com arquivos *diferentes* dos livros (planilha de ST/MG×SP e planilha de transferência entre filiais). Como você pediu para incluí-las, elas passarão a ler apenas o que existe em `livros_data`. **Os recursos específicos dessas planilhas (ex.: cálculo ST MG vs SP, sugestões de transferência baseadas em arquivo externo) deixarão de funcionar** até que esses dados também sejam carregados no Upload de Livros ou em outro fluxo unificado. Posso, em vez disso, manter o upload nessas duas só, se preferir — me avise antes de eu aplicar.
- **Simulador Massivo**: hoje aceita uma planilha com lista de SKUs/preços para simular em lote. Sem upload, ele passará a operar sobre **todos os produtos já carregados em Upload de Livros** com filtros (BU, filial, família). Funcionalidade de "colar lista personalizada" será removida.
- **Comparativo de Livros** e **Análise DDV / Gerencial**: já consomem `livros_data` em boa parte. O upload local será removido sem perda funcional perceptível.

## Detalhes técnicos

```text
src/components/NoDataNotice.tsx       (novo, ~40 linhas)
src/pages/AnaliseGerencial.tsx        remover bloco upload, ler de useAppData
src/pages/AnaliseDDV.tsx              idem
src/pages/ComparativoLivros.tsx       idem
src/pages/SimuladorMassivo.tsx        idem + remover parser local
src/pages/Transferencia.tsx           idem + remover parser local
src/pages/UploadST.tsx                vira tela somente-leitura sobre livros_data,
                                      ou pode ser removida do menu (me confirme)
```

Nenhuma migração de banco. Nenhuma alteração na tela `Upload de Livros`. Nenhuma mudança no `AppSidebar` (exceto possível remoção do item "Upload ST" se você confirmar).

## Pergunta antes de aplicar

1. Confirma que **Upload ST** e **Transferência** devem perder o upload próprio mesmo sabendo que algumas funções específicas vão parar de funcionar?
2. A tela **Upload ST** deve ser **removida do menu** ou mantida apenas como visualização?

Assim que você confirmar, aplico em todas as telas de uma vez.