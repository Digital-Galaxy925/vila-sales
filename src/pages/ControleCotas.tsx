import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, FileSpreadsheet, Download, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Row = Record<string, any>;

const MESES: Record<string, number> = {
  jan: 1, janeiro: 1,
  fev: 2, fevereiro: 2,
  mar: 3, marco: 3, "março": 3,
  abr: 4, abril: 4,
  mai: 5, maio: 5,
  jun: 6, junho: 6,
  jul: 7, julho: 7,
  ago: 8, agosto: 8,
  set: 9, setembro: 9,
  out: 10, outubro: 10,
  nov: 11, novembro: 11,
  dez: 12, dezembro: 12,
};

const normText = (v: any) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normCode = (v: any) => String(v ?? "").trim().replace(/\.0+$/, "").replace(/^0+/, "").toUpperCase();

const parseNumber = (v: any): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const raw = String(v ?? "").trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/[^\d,.-]/g, "");
  if (!cleaned) return 0;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (lastComma > lastDot) normalized = cleaned.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma && /\.\d{3}$/.test(cleaned) && !cleaned.includes(",")) normalized = cleaned.replace(/\./g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};

/** Normalize month/year into "YYYY-MM" or null */
const parseMonthKey = (mesVal: any, anoVal: any): string | null => {
  if (mesVal == null && anoVal == null) return null;
  const s = normText(mesVal);
  let month: number | null = null;
  let year: number | null = anoVal ? Number(String(anoVal).trim()) : null;

  // Try "Janeiro/2026" or "Jan/2026" or "01/2026" or "2026-01"
  if (s) {
    // ISO YYYY-MM or YYYY-MM-DD
    const iso = s.match(/^(\d{4})-(\d{1,2})/);
    if (iso) {
      year = year ?? Number(iso[1]);
      month = Number(iso[2]);
    } else {
      // name/year or number/year
      const parts = s.split(/[\/\-\s]+/);
      for (const p of parts) {
        if (/^\d{4}$/.test(p)) year = year ?? Number(p);
        else if (/^\d{1,2}$/.test(p)) {
          const n = Number(p);
          if (n >= 1 && n <= 12) month = month ?? n;
        } else {
          const key = p.replace(/\.$/, "");
          if (MESES[key] != null) month = month ?? MESES[key];
        }
      }
    }
  }

  // Se a planilha tiver apenas a coluna Mês, usa o ano atual para manter a chave mês+código.
  if (month && !year) year = new Date().getFullYear();
  if (!month || !year) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
};

const findHeader = (headers: string[], patterns: RegExp[]): string | null => {
  for (const p of patterns) {
    const h = headers.find((x) => p.test(normText(x)));
    if (h) return h;
  }
  return null;
};

const matchingHeaders = (headers: string[], patterns: RegExp[]) =>
  headers.filter((h) => patterns.some((p) => p.test(normText(h))));

const findCodeHeader = (headers: string[]) =>
  findHeader(headers, [/^(cod|codigo)(\b|\s|\.|-|_)/, /cod.*prod/, /^sku\b/, /^produto$/]);

const findMonthHeader = (headers: string[]) =>
  findHeader(headers, [/^mes\b/, /competencia/, /periodo/, /^data$/]);

const findYearHeader = (headers: string[]) => findHeader(headers, [/^ano\b/]);

const findVolumeHeader = (headers: string[]) =>
  headers.find((h) => {
    const n = normText(h);
    return !/consumido|saldo/.test(n) && (/^volume\b/.test(n) || /^quantidade\b/.test(n) || /^qtd\b/.test(n) || /^qtde\b/.test(n) || /^cota\b/.test(n));
  }) ?? null;

const firstRowValue = (r: Row, cols: string[]) => {
  for (const c of cols) {
    const v = r[c];
    if (String(v ?? "").trim() !== "") return v;
  }
  return cols[0] ? r[cols[0]] : undefined;
};

const STORAGE_KEY = "controle-cotas-data-v1";

type ConsumoMeta = { volume: number; descricao: string };

export default function ControleCotas() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [headers, setHeaders] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      return s ? JSON.parse(s).headers ?? [] : [];
    } catch { return []; }
  });
  const [rows, setRows] = useState<Row[]>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      return s ? JSON.parse(s).rows ?? [] : [];
    } catch { return []; }
  });
  const [fileName, setFileName] = useState<string>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      return s ? JSON.parse(s).fileName ?? "" : "";
    } catch { return ""; }
  });
  const [search, setSearch] = useState("");
  const [consumo, setConsumo] = useState<Record<string, ConsumoMeta>>({});
  const [pending, setPending] = useState<{
    newHeaders: string[];
    newRows: Row[];
    fileName: string;
    overlaps: number;
  } | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Row>({});

  // Local cache mirror
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ headers, rows, fileName }));
    } catch {}
  }, [headers, rows, fileName]);

  // Helpers to extract DB-normalized fields from a row
  const extractDbFields = (row: Row, hs: string[]) => {
    const codeCol = findCodeHeader(hs);
    const mesCol = findMonthHeader(hs);
    const anoCol = findYearHeader(hs);
    const volCol = findVolumeHeader(hs);
    const codigo = codeCol ? String(row[codeCol] ?? "").trim() : null;
    const mes_ano = parseMonthKey(mesCol ? row[mesCol] : null, anoCol ? row[anoCol] : null);
    const volume = volCol ? parseNumber(row[volCol]) : null;
    // dados = row minus computed & internal keys
    const dados: Row = {};
    Object.keys(row).forEach((k) => {
      if (!["__id", "Volume Consumido", "Saldo"].includes(k)) dados[k] = row[k];
    });
    return { codigo, mes_ano, volume, dados };
  };

  // Load rows from Supabase (source of truth)
  const loadFromDb = async () => {
    const { data, error } = await supabase
      .from("cotas_data" as any)
      .select("*")
      .order("created_at", { ascending: true });
    if (error) { console.error(error); return; }
    if (!data) return;
    const loaded: Row[] = data.map((r: any) => ({ ...(r.dados ?? {}), __id: r.id }));
    // union of keys as headers
    const keySet = new Set<string>();
    loaded.forEach((r) => Object.keys(r).forEach((k) => { if (k !== "__id") keySet.add(k); }));
    if (loaded.length) {
      setRows(loaded);
      setHeaders((prev) => {
        const merged = [...prev];
        keySet.forEach((k) => { if (!merged.includes(k)) merged.push(k); });
        // if no prev, use inferred order
        return merged.length ? merged : Array.from(keySet);
      });
    }
  };

  // Load propostas with cota='sim' and build (month|codigo) -> {volume, descricao}
  const loadConsumo = async () => {
    const { data, error } = await supabase
      .from("propostas_simulador")
      .select("codigo_produto, descricao_produto, volume_caixas, created_at, cota")
      .ilike("cota", "sim");
    if (error) { console.error(error); return; }
    const map: Record<string, ConsumoMeta> = {};
    (data ?? []).forEach((r: any) => {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}|${normCode(r.codigo_produto)}`;
      if (!map[key]) map[key] = { volume: 0, descricao: r.descricao_produto ?? "" };
      map[key].volume += Number(r.volume_caixas ?? 0);
    });
    setConsumo(map);
  };

  useEffect(() => {
    loadFromDb();
    loadConsumo();
    const iv = setInterval(loadConsumo, 15000);
    return () => clearInterval(iv);
  }, []);

  // DB writers
  const dbInsertRows = async (newRows: Row[], hs: string[]): Promise<Row[]> => {
    if (!newRows.length) return [];
    const payload = newRows.map((r) => {
      const f = extractDbFields(r, hs);
      return { codigo: f.codigo, mes_ano: f.mes_ano, volume: f.volume, dados: f.dados, file_name: fileName || null };
    });
    const { data, error } = await supabase.from("cotas_data" as any).insert(payload).select("id");
    if (error) { toast.error("Erro ao salvar: " + error.message); return newRows; }
    const arr = (data ?? []) as any[];
    return newRows.map((r, i) => ({ ...r, __id: arr[i]?.id }));
  };
  const dbUpdateRow = async (row: Row, hs: string[]) => {
    if (!row.__id) return;
    const f = extractDbFields(row, hs);
    const { error } = await supabase.from("cotas_data" as any)
      .update({ codigo: f.codigo, mes_ano: f.mes_ano, volume: f.volume, dados: f.dados })
      .eq("id", row.__id);
    if (error) toast.error("Erro ao atualizar: " + error.message);
  };
  const dbDeleteRow = async (row: Row) => {
    if (!row.__id) return;
    const { error } = await supabase.from("cotas_data" as any).delete().eq("id", row.__id);
    if (error) toast.error("Erro ao excluir: " + error.message);
  };
  const dbDeleteAll = async () => {
    const { error } = await supabase.from("cotas_data" as any).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) toast.error("Erro ao limpar: " + error.message);
  };

  const clearData = async () => {
    if (!confirm("Limpar tabela e apagar todos os registros salvos?")) return;
    await dbDeleteAll();
    setHeaders([]);
    setRows([]);
    setFileName("");
    localStorage.removeItem(STORAGE_KEY);
    toast.success("Dados removidos");
  };

  const rowKey = (r: Row, hs: string[]): string => {
    const code = normCode(firstRowValue(r, matchingHeaders(hs, [/^(cod|codigo)(\b|\s|\.|-|_)/, /cod.*prod/, /^sku\b/, /^produto$/])));
    const mes = firstRowValue(r, matchingHeaders(hs, [/^mes\b/, /competencia/, /periodo/, /^data$/]));
    const ano = firstRowValue(r, matchingHeaders(hs, [/^ano\b/]));
    const mk = parseMonthKey(mes, ano);
    return `${mk ?? ""}|${code}`;
  };

  const applyMerge = (mode: "replace" | "sum" | "new") => {
    if (!pending) return;
    const { newHeaders, newRows, fileName: fName } = pending;

    if (mode === "new" || rows.length === 0) {
      setHeaders(newHeaders);
      setRows(newRows);
      setFileName(fName);
      setPending(null);
      toast.success(`${newRows.length} itens carregados`);
      return;
    }

    // Merge preserving existing headers + adding any new ones
    const mergedHeaders = [...headers];
    newHeaders.forEach((h) => { if (!mergedHeaders.includes(h)) mergedHeaders.push(h); });

    const volCol = findVolumeHeader(mergedHeaders);

    // Index existing rows by key
    const existing = rows.map((r) => ({ ...r }));
    const idx: Record<string, number> = {};
    existing.forEach((r, i) => { idx[rowKey(r, mergedHeaders)] = i; });

    let updated = 0;
    let appended = 0;
    newRows.forEach((nr) => {
      const key = rowKey(nr, mergedHeaders);
      const codePart = key.split("|")[1];
      const hasCode = codePart && codePart.length > 0;
      if (hasCode && idx[key] != null) {
        const target = existing[idx[key]];
        if (mode === "sum" && volCol) {
          const a = parseNumber(target[volCol]);
          const b = parseNumber(nr[volCol]);
          target[volCol] = a + b;
        } else if (mode === "replace") {
          // Overwrite matched columns with new values
          Object.keys(nr).forEach((k) => { target[k] = nr[k]; });
        }
        updated++;
      } else {
        existing.push(nr);
        appended++;
      }
    });

    setHeaders(mergedHeaders);
    setRows(existing);
    setFileName(fName);
    setPending(null);
    toast.success(
      `${appended} novas linhas • ${updated} ${mode === "sum" ? "somadas" : "substituídas"}`
    );
  };

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Row>(ws, { defval: "" });
      if (!json.length) {
        toast.error("Planilha vazia");
        return;
      }
      const newHeaders = Object.keys(json[0]);

      // No existing data: just load
      if (rows.length === 0) {
        setHeaders(newHeaders);
        setRows(json);
        setFileName(file.name);
        await loadConsumo();
        toast.success(`${json.length} itens carregados`);
        return;
      }

      // Detect overlaps with existing rows (same code + month)
      const mergedHeaders = [...headers];
      newHeaders.forEach((h) => { if (!mergedHeaders.includes(h)) mergedHeaders.push(h); });
      const existingKeys = new Set(
        rows.map((r) => rowKey(r, mergedHeaders)).filter((k) => k.split("|")[1])
      );
      let overlaps = 0;
      json.forEach((nr) => {
        const k = rowKey(nr, mergedHeaders);
        if (k.split("|")[1] && existingKeys.has(k)) overlaps++;
      });

      await loadConsumo();
      if (overlaps > 0) {
        setPending({ newHeaders, newRows: json, fileName: file.name, overlaps });
      } else {
        const mergedHeaders = [...headers];
        newHeaders.forEach((h) => { if (!mergedHeaders.includes(h)) mergedHeaders.push(h); });
        setHeaders(mergedHeaders);
        setRows((prev) => [...prev, ...json]);
        setFileName(file.name);
        toast.success(`${json.length} novas linhas adicionadas`);
      }
    } catch (e: any) {
      toast.error("Erro ao ler planilha: " + e.message);
    }
  };

  const { displayHeaders, codigoCol, mesCol, anoCol, precoCol, volumeCol } = useMemo(() => {
    const codigoCol = findCodeHeader(headers);
    const mesCol = findMonthHeader(headers);
    const anoCol = findYearHeader(headers);
    const precoCol = findHeader(headers, [/^preco/, /valor/]);
    const volumeCol = findVolumeHeader(headers);

    // Insert "Volume Consumido" after preço, then "Saldo" after "Volume Consumido"
    const dh = headers.filter((h) => !["Volume Consumido", "Saldo"].includes(h));
    const insertAfter = (after: string | null, col: string) => {
      if (!after) { dh.push(col); return; }
      const idx = dh.indexOf(after);
      if (idx >= 0) dh.splice(idx + 1, 0, col);
      else dh.push(col);
    };
    insertAfter(precoCol, "Volume Consumido");
    insertAfter("Volume Consumido", "Saldo");
    return { displayHeaders: dh, codigoCol, mesCol, anoCol, precoCol, volumeCol };
  }, [headers]);

  const rowsWithConsumo = useMemo(() => {
    // Aggregate consumo estritamente por mês+código
    const byKey: Record<string, number> = {};
    Object.entries(consumo).forEach(([key, meta]) => {
      byKey[key] = (byKey[key] ?? 0) + meta.volume;
    });

    return rows.map((r, __idx) => {
      const code = codigoCol ? normCode(r[codigoCol]) : "";
      const monthKey = parseMonthKey(mesCol ? r[mesCol] : null, anoCol ? r[anoCol] : null);
      let vol = 0;
      if (code && monthKey) {
        vol = byKey[`${monthKey}|${code}`] ?? 0;
      }
      const volDisp = volumeCol ? parseNumber(r[volumeCol]) : 0;
      const saldo = volDisp - vol;
      return { ...r, __idx, "Volume Consumido": vol, "Saldo": saldo };
    });
  }, [rows, consumo, codigoCol, mesCol, anoCol, volumeCol]);

  const exportXLSX = () => {
    const ws = XLSX.utils.json_to_sheet(rowsWithConsumo, { header: displayHeaders });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cotas");
    XLSX.writeFile(wb, `controle-cotas-${Date.now()}.xlsx`);
  };

  const filtered = search
    ? rowsWithConsumo.filter((r) =>
        Object.values(r).some((v) =>
          String(v ?? "").toLowerCase().includes(search.toLowerCase())
        )
      )
    : rowsWithConsumo;

  const fmtNum = (v: any) => {
    const n = Number(v);
    if (!isFinite(n)) return String(v ?? "");
    return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  };

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditDraft({ ...rows[idx] });
  };
  const cancelEdit = () => { setEditingIdx(null); setEditDraft({}); };
  const saveEdit = () => {
    if (editingIdx == null) return;
    setRows((prev) => prev.map((r, i) => (i === editingIdx ? { ...r, ...editDraft } : r)));
    toast.success("Linha atualizada");
    cancelEdit();
  };
  const deleteRow = (idx: number) => {
    if (!confirm("Excluir esta linha?")) return;
    setRows((prev) => prev.filter((_, i) => i !== idx));
    if (editingIdx === idx) cancelEdit();
    toast.success("Linha excluída");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Controle de Cotas</h1>
          {fileName && (
            <p className="text-xs text-muted-foreground mt-1">
              <FileSpreadsheet className="inline w-3 h-3 mr-1" />
              {fileName} • {rows.length} itens
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <Button
            onClick={() => inputRef.current?.click()}
            className="bg-[#0071e3] hover:bg-[#0077ed] text-white"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Planilha
          </Button>
          {rows.length > 0 && (
            <>
              <Button
                onClick={exportXLSX}
                className="bg-[#107C41] hover:bg-[#0e6b38] text-white"
              >
                <Download className="w-4 h-4 mr-2" />
                Exportar Excel
              </Button>
              <Button variant="outline" onClick={clearData}>
                Limpar
              </Button>
            </>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <Card className="p-12 text-center">
          <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            Faça upload de uma planilha Excel (.xlsx, .xls ou .csv) para visualizar os itens.
          </p>
        </Card>
      ) : (
        <Card className="p-4 space-y-3">
          <Input
            placeholder="Buscar em qualquer coluna..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <div className="overflow-auto max-h-[70vh] border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-[#f5f5f7] sticky top-0 z-10">
                <tr>
                  {displayHeaders.map((h) => (
                    <th
                      key={h}
                      className={`px-3 py-2 text-left font-semibold border-b whitespace-nowrap ${
                        h === "Volume Consumido" ? "text-[#0071e3]" : "text-[#1d1d1f]"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left font-semibold border-b whitespace-nowrap text-[#1d1d1f]">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const origIdx = r.__idx as number;
                  const isEditing = editingIdx === origIdx;
                  return (
                    <tr key={origIdx} className="hover:bg-muted/40 border-b">
                      {displayHeaders.map((h) => {
                        const isComputed = h === "Volume Consumido" || h === "Saldo";
                        return (
                          <td
                            key={h}
                            className={`px-3 py-1.5 whitespace-nowrap ${
                              h === "Volume Consumido"
                                ? "font-semibold text-[#0071e3]"
                                : h === "Saldo"
                                ? `font-semibold ${Number(r[h] ?? 0) < 0 ? "text-red-600" : "text-green-600"}`
                                : ""
                            }`}
                          >
                            {isEditing && !isComputed ? (
                              <Input
                                value={String(editDraft[h] ?? "")}
                                onChange={(e) => setEditDraft((d) => ({ ...d, [h]: e.target.value }))}
                                className="h-7 min-w-[80px]"
                              />
                            ) : isComputed ? (
                              fmtNum(r[h])
                            ) : (
                              String(r[h] ?? "")
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <div className="flex gap-1">
                          {isEditing ? (
                            <>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={saveEdit} title="Salvar">
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit} title="Cancelar">
                                <X className="w-4 h-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-[#0071e3]" onClick={() => startEdit(origIdx)} title="Editar">
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => deleteRow(origIdx)} title="Excluir">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Mostrando {filtered.length} de {rows.length} itens
            {!codigoCol && " • ⚠ Coluna de código não detectada"}
            {!mesCol && " • ⚠ Coluna de mês não detectada"}
          </p>
        </Card>
      )}

      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conflito de dados detectado</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.overlaps
                ? `Foram encontrados ${pending.overlaps} produto(s) no mesmo período já existentes na tabela. Como deseja tratar esses itens? Linhas novas (produto/período diferente) serão sempre adicionadas.`
                : "Nenhum conflito de produto/período. As novas linhas serão adicionadas à tabela."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-wrap gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {pending?.overlaps ? (
              <>
                <Button variant="outline" onClick={() => applyMerge("replace")}>
                  Substituir existentes
                </Button>
                <AlertDialogAction
                  onClick={() => applyMerge("sum")}
                  className="bg-[#0071e3] hover:bg-[#0077ed] text-white"
                >
                  Somar aos existentes
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction
                onClick={() => applyMerge("sum")}
                className="bg-[#0071e3] hover:bg-[#0077ed] text-white"
              >
                Adicionar linhas
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
