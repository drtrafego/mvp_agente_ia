'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { Textarea } from "@/components/shadcn/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/avatar";
import { updateLeadContent, getLeadHistory } from "@/server/actions/leads";
import { Lead } from "@/server/db/schema";
import { User, Phone, Mail, Building2, FileText, Save, X, DollarSign, Trash2, History, Clock, Globe, Search, Copy, Check } from "lucide-react";
import { deleteLead } from "@/server/actions/leads";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getWhatsAppLink, cn } from "@/lib/utils";
import { getLeadSource } from "@/lib/leads-helper";

import { CRMActionOverrides } from "@/types/crm-actions";

interface EditLeadDialogProps {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  overrides?: CRMActionOverrides;
}

// Deixa legível um texto vindo do formulário do Meta (snake_case -> frase).
// Ex.: "qual_é_a_sua_situação_atual?" -> "Qual é a sua situação atual?"
function prettifyFormText(s: string): string {
  const t = (s || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

// Normaliza valor monetário digitado em pt-BR para número com ponto decimal.
// Aceita "250", "250,00", "1.234,56" e também "250.00" (ponto decimal).
// No celular o teclado costuma usar vírgula, que um input type=number rejeita.
function parseDecimalInput(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  // tem vírgula: trata vírgula como decimal e remove pontos de milhar
  if (s.includes(",")) return s.replace(/\./g, "").replace(",", ".");
  return s;
}

// Botão de copiar ao lado dos campos de contato (email/whatsapp).
// Usa a Clipboard API e cai para o método legado (execCommand) quando ela
// não está disponível (contexto não seguro ou navegador mobile antigo).
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = (value || "").trim();
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement("textarea");
        el.value = text;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silencioso: sem clipboard não há o que fazer além de manter a seleção manual
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copiar ${label}`}
      aria-label={`Copiar ${label}`}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium rounded-md px-1.5 py-0.5 transition-colors",
        copied
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400"
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

export function EditLeadDialog({ lead, open, onOpenChange, orgId, overrides }: EditLeadDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'form' | 'timeline'>('details');
  const formEntries = lead.formData ? Object.entries(lead.formData as Record<string, string>) : [];
  const hasFormData = formEntries.length > 0;
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const router = useRouter();

  // Action overrides with fallbacks
  const updateLeadContentAction = overrides?.updateLeadContent || updateLeadContent;
  const deleteLeadAction = overrides?.deleteLead || deleteLead;

  useEffect(() => {
    if (open && activeTab === 'timeline') {
      setIsLoadingHistory(true);

      const fetchHistory = overrides?.getHistory || getLeadHistory;

      fetchHistory(lead.id, orgId)
        .then(data => setHistory(data))
        .catch(err => console.error("Failed to load history:", err))
        .finally(() => setIsLoadingHistory(false));
    }
  }, [open, activeTab, lead.id, overrides]);

  async function handleSubmit(formData: FormData) {
    setErrorMsg(null);
    setSaving(true);
    const followUpDateStr = formData.get("followUpDate") as string;
    const data = {
      name: formData.get("name") as string,
      whatsapp: formData.get("whatsapp") as string,
      email: formData.get("email") as string,
      company: formData.get("company") as string,
      notes: formData.get("notes") as string,
      value: parseDecimalInput(formData.get("value") as string),
      campaignSource: formData.get("campaignSource") as string,
      pagePath: formData.get("pagePath") as string,
      utmTerm: formData.get("utmTerm") as string,
      followUpDate: followUpDateStr ? new Date(followUpDateStr) : null,
      followUpNote: formData.get("followUpNote") as string,
      columnId: lead.columnId,
      position: lead.position,
    };

    try {
      const res = (await updateLeadContentAction(lead.id, data, orgId)) as
        | { ok: boolean; reason?: string }
        | void;

      if (res && res.ok === false) {
        const messages: Record<string, string> = {
          unauthorized: "Sua sessão expirou. Saia e entre novamente na conta para salvar.",
          not_member: "Esta conta não tem acesso a esta empresa. Entre com o email que foi cadastrado no CRM.",
          denied: "Sua conta é somente leitura nesta empresa. Peça para liberarem a edição.",
          not_found: "Este lead não foi encontrado nesta empresa. Recarregue a página e tente de novo.",
          error: "Não foi possível salvar agora. Tente novamente em instantes.",
        };
        setErrorMsg(messages[res.reason || "error"] || messages.error);
        return;
      }

      onOpenChange(false);
      router.refresh();
    } catch (err) {
      console.error("Erro ao salvar lead:", err);
      setErrorMsg(
        "Não foi possível salvar. Tente novamente. Se persistir, saia e entre de novo na conta (a sessão pode ter expirado)."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await deleteLeadAction(lead.id, orgId);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-white dark:bg-slate-950 p-0 gap-0 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 pb-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <DialogTitle className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <User className="h-5 w-5" />
            </div>
            Editar Lead
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400 ml-10">
            Gerencie as informações e histórico do lead {lead.name}.
          </DialogDescription>
        </DialogHeader>

        {/* Tabs Navigation */}
        <div className="flex items-center border-b border-slate-200 dark:border-slate-800 px-6 shrink-0 bg-white dark:bg-slate-950">
          <button
            onClick={() => setActiveTab('details')}
            className={cn(
              "pb-3 pt-4 text-sm font-medium border-b-2 px-4 transition-colors focus:outline-none",
              activeTab === 'details'
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            )}
          >
            Detalhes
          </button>
          {hasFormData && (
            <button
              onClick={() => setActiveTab('form')}
              className={cn(
                "pb-3 pt-4 text-sm font-medium border-b-2 px-4 transition-colors focus:outline-none",
                activeTab === 'form'
                  ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              Formulário
            </button>
          )}
          <button
            onClick={() => setActiveTab('timeline')}
            className={cn(
              "pb-3 pt-4 text-sm font-medium border-b-2 px-4 transition-colors focus:outline-none",
              activeTab === 'timeline'
                ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            )}
          >
            Histórico
          </button>
        </div>

        {activeTab === 'details' ? (
          <form action={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 p-6 overflow-y-auto min-h-0">
              <div className="space-y-5 pb-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <User className="h-4 w-4 text-slate-400" /> Nome
                    </Label>
                    <Input
                      id="name"
                      name="name"
                      defaultValue={lead.name}
                      required
                      className="bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:bg-white dark:focus:bg-slate-950 transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="whatsapp" className="text-slate-700 dark:text-slate-300 flex items-center gap-2">
                        <Phone className="h-4 w-4 text-slate-400" /> Whatsapp
                      </Label>
                      {lead.whatsapp && <CopyButton value={lead.whatsapp} label="whatsapp" />}
                    </div>
                    <Input
                      id="whatsapp"
                      name="whatsapp"
                      defaultValue={lead.whatsapp || ""}
                      required
                      placeholder="(11) 99999-9999"
                      className="bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:bg-white dark:focus:bg-slate-950 transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="email" className="text-slate-700 dark:text-slate-300 flex items-center gap-2">
                        <Mail className="h-4 w-4 text-slate-400" /> Email
                      </Label>
                      {lead.email && <CopyButton value={lead.email} label="email" />}
                    </div>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      defaultValue={lead.email || ""}
                      className="bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:bg-white dark:focus:bg-slate-950 transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company" className="text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-slate-400" /> Empresa
                    </Label>
                    <Input
                      id="company"
                      name="company"
                      defaultValue={lead.company || ""}
                      className="bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:bg-white dark:focus:bg-slate-950 transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="value" className="text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-slate-400" /> Valor (R$)
                    </Label>
                    <Input
                      id="value"
                      name="value"
                      type="text"
                      inputMode="decimal"
                      defaultValue={lead.value || ""}
                      placeholder="0,00"
                      className="bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:bg-white dark:focus:bg-slate-950 transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="campaignSource" className="text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      Origem
                    </Label>
                    <select
                      id="campaignSource"
                      name="campaignSource"
                      defaultValue={getLeadSource(lead) || ""}
                      className="flex h-9 w-full rounded-md border border-slate-200 bg-white dark:bg-slate-950 dark:border-slate-800 px-3 py-1 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 dark:text-slate-300"
                    >
                      <option value="" className="bg-white dark:bg-slate-950">Selecione...</option>
                      <option value="Google" className="bg-white dark:bg-slate-950">Google Ads</option>
                      <option value="Meta" className="bg-white dark:bg-slate-950">Meta Ads</option>
                      <option value="WhatsApp" className="bg-white dark:bg-slate-950">WhatsApp</option>
                      <option value="Direct" className="bg-white dark:bg-slate-950">Instagram Direct</option>
                      <option value="Captação Ativa" className="bg-white dark:bg-slate-950">Captação Ativa</option>
                      <option value="Indicação" className="bg-white dark:bg-slate-950">Indicação</option>
                      <option value="Orgânicos" className="bg-white dark:bg-slate-950">Orgânicos</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="pagePath" className="text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Globe className="h-4 w-4 text-slate-400" /> Página
                    </Label>
                    <Input
                      id="pagePath"
                      name="pagePath"
                      defaultValue={lead.pagePath || ""}
                      placeholder="/contato"
                      className="bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:bg-white dark:focus:bg-slate-950 transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="utmTerm" className="text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Search className="h-4 w-4 text-slate-400" /> Palavra-Chave / Anúncio
                    </Label>
                    <Input
                      id="utmTerm"
                      name="utmTerm"
                      defaultValue={lead.utmTerm || ""}
                      placeholder="termo-de-busca"
                      className="bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:bg-white dark:focus:bg-slate-950 transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-800/50">
                  <div className="space-y-2">
                    <Label htmlFor="followUpDate" className="text-blue-900 dark:text-blue-300 flex items-center gap-2 font-medium">
                      📅 Data de Retorno
                    </Label>
                    <Input
                      id="followUpDate"
                      name="followUpDate"
                      type="date"
                      defaultValue={lead.followUpDate ? new Date(lead.followUpDate).toISOString().split('T')[0] : ""}
                      className="bg-white dark:bg-slate-950 border-blue-200 dark:border-blue-800/50 focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="followUpNote" className="text-blue-900 dark:text-blue-300 flex items-center gap-2 font-medium">
                      Motivo do Retorno
                    </Label>
                    <Input
                      id="followUpNote"
                      name="followUpNote"
                      defaultValue={lead.followUpNote || ""}
                      placeholder="Ex: Ligar para confirmar proposta"
                      className="bg-white dark:bg-slate-950 border-blue-200 dark:border-blue-800/50 focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes" className="text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-400" /> Observações
                  </Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    defaultValue={lead.notes || ""}
                    className="bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:bg-white dark:focus:bg-slate-950 transition-colors min-h-[100px] resize-none"
                  />
                </div>
              </div>
            </div>

            {errorMsg && (
              <div className="mx-6 mb-2 rounded-md border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                {errorMsg}
              </div>
            )}
            <DialogFooter className="p-6 pt-4 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                {isDeleting ? (
                  <>
                    <span className="text-sm text-red-600 font-medium">Tem certeza?</span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={handleDelete}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Sim, excluir
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsDeleting(false)}
                      className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsDeleting(true)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir Lead
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">
                  <X className="mr-2 h-4 w-4" /> Cancelar
                </Button>
                <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-200 dark:shadow-none">
                  <Save className="mr-2 h-4 w-4" /> {saving ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        ) : activeTab === 'form' ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 p-6 overflow-y-auto min-h-0">
              {hasFormData ? (
                <div className="space-y-3">
                  {formEntries.map(([q, a]) => (
                    <div key={q} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-3">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{prettifyFormText(q)}</p>
                      <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{prettifyFormText(a)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">Nenhuma resposta de formulário registrada.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 p-6 overflow-y-auto min-h-0">
              <div className="space-y-6">
                {isLoadingHistory ? (
                  <div className="text-center py-8 text-slate-500">Carregando histórico...</div>
                ) : history.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">Nenhum histórico registrado.</div>
                ) : (
                  history.map((item) => (
                    <div key={item.id} className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-800 pb-6 last:pb-0">
                      <div className={cn(
                        "absolute -left-[9px] top-0 h-4 w-4 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center",
                        item.action === 'create' ? "bg-green-500" :
                          item.action === 'move' ? "bg-blue-500" :
                            "bg-amber-500"
                      )}>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(item.createdAt), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                          </span>

                          {item.userName && (
                            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded-full">
                              <Avatar className="h-4 w-4">
                                <AvatarImage src={item.userImage || undefined} />
                                <AvatarFallback className="text-[9px]">{item.userName.charAt(0).toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 max-w-[80px] truncate">
                                {item.userName}
                              </span>
                            </div>
                          )}
                        </div>

                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                          {item.action === 'create' && "Lead Criado"}
                          {item.action === 'move' && "Mudança de Fase"}
                          {item.action === 'update' && "Atualização"}
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          {item.details}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

            </div>
            <DialogFooter className="p-6 pt-4 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
