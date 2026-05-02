import { supabase } from "@/integrations/supabase/client";

/**
 * Sincronização da tabela `livros_data` no Supabase.
 *
 * Estratégia: 1 registro por filial (UNIQUE em `filial`). Cada upload
 * substitui o anterior daquela filial via upsert. Mesmo padrão usado pela
 * tabela `st_data`.
 *
 * O localStorage continua sendo o cache espelho — ver AppDataContext.
 */

export interface FilialDataMap {
  [filial: string]: any[];
}

/** Grava todas as filiais com produtos no Supabase (upsert por filial). */
export async function saveLivrosToSupabase(data: FilialDataMap): Promise<void> {
  const rows = Object.entries(data)
    .filter(([, produtos]) => Array.isArray(produtos) && produtos.length > 0)
    .map(([filial, produtos]) => ({
      filial,
      produtos,
      file_name: `livro_${filial}`,
      row_count: produtos.length,
      data_upload: new Date().toISOString(),
    }));

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("livros_data")
    .upsert(rows, { onConflict: "filial" });

  if (error) throw error;
}

/** Lê todas as filiais do Supabase e remonta o mapa { filial: produtos[] }. */
export async function loadLivrosFromSupabase(): Promise<FilialDataMap | null> {
  const { data, error } = await supabase
    .from("livros_data")
    .select("filial, produtos, data_upload")
    .order("data_upload", { ascending: false });

  if (error) {
    console.warn("[livrosSync] erro ao carregar:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  const out: FilialDataMap = {};
  for (const row of data as any[]) {
    if (!row?.filial) continue;
    const produtos = Array.isArray(row.produtos) ? row.produtos : [];
    if (produtos.length > 0) out[row.filial] = produtos;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Apaga todos os registros (usado pelo botão "Novo Upload"). */
export async function clearLivrosFromSupabase(): Promise<void> {
  // Filtro inócuo apenas para satisfazer a exigência de cláusula no delete.
  const { error } = await supabase
    .from("livros_data")
    .delete()
    .not("filial", "is", null);

  if (error) console.warn("[livrosSync] erro ao limpar:", error.message);
}
