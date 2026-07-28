'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shadcn/dialog";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { Textarea } from "@/components/shadcn/textarea";
import { createLead } from "@/server/actions/leads";
import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="bg-indigo-600 hover:bg-indigo-700 text-white w-full sm:w-auto">
      {pending ? "Salvando..." : "Salvar Lead"}
    </Button>
  );
}

import { CRMActionOverrides } from "@/types/crm-actions";

export function NewLeadDialog({ orgId, overrides }: { orgId: string; overrides?: CRMActionOverrides }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Action override
  const createLeadAction = overrides?.createLead || createLead;

  async function handleSubmit(formData: FormData) {
    if (isLoading) return;
    setIsLoading(true);
    try {
      await createLeadAction(formData, orgId);
      setOpen(false);
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
          <Plus className="mr-2 h-4 w-4" /> Adicionar Lead
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="text-slate-900 dark:text-slate-100">Novo Lead</DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400">
            Preencha as informações do lead abaixo. Ele será adicionado à coluna &quot;Novos Leads&quot;.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name" className="text-slate-700 dark:text-slate-300">Nome</Label>
              <Input id="name" name="name" placeholder="Nome do cliente" required className="bg-transparent border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="whatsapp" className="text-slate-700 dark:text-slate-300">Whatsapp (Principal)</Label>
              <Input id="whatsapp" name="whatsapp" placeholder="(11) 99999-9999" required className="bg-transparent border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email" className="text-slate-700 dark:text-slate-300">Email (Opcional)</Label>
              <Input id="email" name="email" type="email" placeholder="cliente@email.com" className="bg-transparent border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="company" className="text-slate-700 dark:text-slate-300">Empresa (Opcional)</Label>
              <Input id="company" name="company" placeholder="Nome da empresa" className="bg-transparent border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="value" className="text-slate-700 dark:text-slate-300">Valor (R$)</Label>
              <Input id="value" name="value" type="number" step="0.01" placeholder="0,00" className="bg-transparent border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="campaignSource" className="text-slate-700 dark:text-slate-300">Origem</Label>
              <select id="campaignSource" name="campaignSource" className="flex h-10 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 text-slate-700 dark:text-slate-300">
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

          <div className="grid gap-2">
            <Label htmlFor="notes" className="text-slate-700 dark:text-slate-300">Obs</Label>
            <Textarea id="notes" name="notes" placeholder="Observações adicionais..." className="bg-transparent border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500 min-h-[100px]" />
          </div>

          <DialogFooter className="mt-4">
            <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white w-full sm:w-auto" disabled={isLoading}>
              {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : "Salvar Lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
