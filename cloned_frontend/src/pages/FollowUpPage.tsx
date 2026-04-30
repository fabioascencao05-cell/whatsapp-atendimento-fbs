import { useState, useEffect, useMemo } from "react";
import { CalendarClock, Plus, Trash2, Send, Clock, User, CheckCircle2, XCircle, AlertCircle, Edit2, ArrowRight, GitBranch, Filter, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchConversas, fetchFollowUps, criarFollowUp, cancelarFollowUp, deletarFollowUp } from "@/services/api";
import type { Conversa } from "@/types/crm";

interface FollowUpItem {
  id: string;
  conversaId: string;
  texto: string;
  agendado_para: string;
  status: string;
  tentativas: number;
  criado_em: string;
  enviado_em?: string;
  conversa?: {
    nome: string;
    telefone: string;
    profile_pic_url?: string;
    status_kanban: string;
  };
}

// ===== ETAPAS DO FUNIL (editáveis via UI) =====
const DEFAULT_ETAPAS = [
  { id: "novos", nome: "Novos", cor: "#818cf8", emoji: "🆕", prazo: "Auto", mensagem: "Bot Deise responde automaticamente" },
  { id: "em_negociacao", nome: "Em Negociação", cor: "#f59e0b", emoji: "🤝", prazo: "Manual", mensagem: "Humano assumiu o atendimento" },
  { id: "aguardando_pagamento", nome: "Aguardando Pagamento", cor: "#8b5cf6", emoji: "💰", prazo: "48h", mensagem: "" },
  { id: "pedido_aprovado", nome: "Pedido Aprovado", cor: "#10b981", emoji: "✅", prazo: "—", mensagem: "" },
  { id: "pedido_entregue", nome: "Pedido Entregue", cor: "#22c55e", emoji: "🎉", prazo: "—", mensagem: "" },
];

export default function FollowUpPage() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [followups, setFollowups] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");

  // Modal novo follow-up
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoConversaId, setNovoConversaId] = useState("");
  const [novoTexto, setNovoTexto] = useState("");
  const [novoHoras, setNovoHoras] = useState("24");

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    setLoading(true);
    try {
      const [c, f] = await Promise.all([fetchConversas(), fetchFollowUps()]);
      setConversas(c);
      setFollowups(f as FollowUpItem[]);
    } catch (err) {
      console.error("Erro ao carregar:", err);
    }
    setLoading(false);
  }

  // Estatísticas
  const stats = useMemo(() => {
    const pendentes = followups.filter(f => f.status === "pendente").length;
    const enviados = followups.filter(f => f.status === "enviado").length;
    const agora = new Date();
    const atrasados = followups.filter(f => f.status === "pendente" && new Date(f.agendado_para) < agora).length;
    return { pendentes, enviados, atrasados };
  }, [followups]);

  // Leads no funil automático
  const funisAgrupados = useMemo(() => {
    const mapa: Record<string, Conversa[]> = {
      'nao_respondeu': [],
      'orcamento_sumiu': [],
      'recorrente': []
    };
    conversas.forEach(c => {
      const tipo = (c as any).funil_tipo;
      if (tipo && mapa[tipo]) {
        mapa[tipo].push(c);
      }
    });
    return mapa;
  }, [conversas]);

  // Follow-ups filtrados
  const followupsFiltrados = useMemo(() => {
    if (filtroStatus === "todos") return followups;
    return followups.filter(f => f.status === filtroStatus);
  }, [followups, filtroStatus]);

  async function handleCriarFollowUp() {
    if (!novoConversaId || !novoTexto) return;
    const horasNum = parseInt(novoHoras) || 24;
    const agendado = new Date(Date.now() + horasNum * 60 * 60 * 1000).toISOString();
    try {
      await criarFollowUp({ conversaId: novoConversaId, texto: novoTexto, agendado_para: agendado });
      setNovoOpen(false);
      setNovoConversaId("");
      setNovoTexto("");
      setNovoHoras("24");
      carregarDados();
    } catch (err) {
      console.error("Erro ao criar follow-up:", err);
    }
  }

  async function handleCancelar(id: string) {
    try {
      await cancelarFollowUp(id);
      carregarDados();
    } catch (err) {
      console.error("Erro ao cancelar:", err);
    }
  }

  async function handleDeletar(id: string) {
    try {
      await deletarFollowUp(id);
      carregarDados();
    } catch (err) {
      console.error("Erro ao deletar:", err);
    }
  }

  function formatarData(iso: string) {
    const d = new Date(iso);
    const agora = new Date();
    const diff = d.getTime() - agora.getTime();
    const horas = Math.round(diff / (1000 * 60 * 60));
    const minutos = Math.round(diff / (1000 * 60));

    if (diff < 0) {
      const atraso = Math.abs(horas);
      return atraso > 24 ? `${Math.round(atraso / 24)}d atrasado` : `${atraso}h atrasado`;
    }
    if (minutos < 60) return `em ${minutos}min`;
    if (horas < 24) return `em ${horas}h`;
    return `em ${Math.round(horas / 24)}d`;
  }

  function nomeFunil(tipo: string) {
    const mapa: Record<string, string> = {
      "nao_respondeu": "Não Respondeu",
      "orcamento_sumiu": "Orçamento Sumiu",
      "recorrente": "Cliente Recorrente"
    };
    return mapa[tipo] || tipo;
  }

  function emojiFunil(tipo: string) {
    const mapa: Record<string, string> = {
      "nao_respondeu": "🔴", "orcamento_sumiu": "🟡", "recorrente": "🟢"
    };
    return mapa[tipo] || "⚙️";
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">

      {/* Header */}
      <header className="px-6 py-5 border-b border-border/50 bg-card/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <GitBranch size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Central de Follow-Up</h1>
              <p className="text-xs text-muted-foreground">Funil inteligente • Acompanhe cada lead</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={carregarDados} className="gap-1.5">
              <RefreshCw size={14} /> Atualizar
            </Button>
            <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus size={14} /> Novo Follow-Up
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Agendar Follow-Up</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Contato</label>
                    <Select value={novoConversaId} onValueChange={setNovoConversaId}>
                      <SelectTrigger><SelectValue placeholder="Selecione um contato..." /></SelectTrigger>
                      <SelectContent>
                        {conversas.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.nome} — {c.telefone}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Mensagem</label>
                    <Textarea
                      value={novoTexto}
                      onChange={e => setNovoTexto(e.target.value)}
                      placeholder="Ex: Oi! Conseguiu decidir sobre as camisetas?"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Enviar em (horas)</label>
                    <div className="flex gap-2">
                      {["1", "2", "6", "12", "24", "48", "72"].map(h => (
                        <Button
                          key={h}
                          size="sm"
                          variant={novoHoras === h ? "default" : "outline"}
                          onClick={() => setNovoHoras(h)}
                          className="flex-1 text-xs"
                        >
                          {h}h
                        </Button>
                      ))}
                    </div>
                  </div>
                  <Button onClick={handleCriarFollowUp} className="w-full gap-2" disabled={!novoConversaId || !novoTexto}>
                    <Send size={14} /> Agendar Envio
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">

          {/* Cards de Resumo */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-primary">{stats.pendentes}</p>
                <p className="text-xs text-muted-foreground mt-1">Pendentes</p>
              </CardContent>
            </Card>
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-emerald-400">{stats.enviados}</p>
                <p className="text-xs text-muted-foreground mt-1">Enviados</p>
              </CardContent>
            </Card>
            <Card className={`${stats.atrasados > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-border'}`}>
              <CardContent className="p-4">
                <p className={`text-2xl font-bold ${stats.atrasados > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>{stats.atrasados}</p>
                <p className="text-xs text-muted-foreground mt-1">Atrasados</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-foreground">{conversas.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Total de Leads</p>
              </CardContent>
            </Card>
          </div>

          {/* FUNIS AUTOMÁTICOS */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <GitBranch size={14} /> Funis Automáticos Ativos
            </h2>
            <div className="space-y-2.5">
              {Object.entries(funisAgrupados).map(([tipo, leads]) => (
                <Card key={tipo} className="overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30">
                    <span className="text-base">{emojiFunil(tipo)}</span>
                    <h3 className="font-semibold text-sm text-foreground flex-1">{nomeFunil(tipo)}</h3>
                    <Badge variant="secondary">
                      {leads.length} lead{leads.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  {leads.length > 0 ? (
                    <div className="p-3 flex flex-wrap gap-2">
                      {leads.map(lead => (
                        <div key={lead.id} className="flex flex-col gap-1 bg-muted/20 border border-border/30 rounded-lg px-3 py-2 text-xs group hover:bg-muted/40 transition-colors">
                          <div className="flex items-center gap-2">
                            {lead.profile_pic_url ? (
                              <img src={lead.profile_pic_url} className="w-5 h-5 rounded-full object-cover" alt="" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                                {lead.nome?.charAt(0) || "?"}
                              </div>
                            )}
                            <span className="text-foreground/80 font-semibold">{lead.nome}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground flex flex-col gap-0.5 mt-1">
                            <span>Etapa atual: <b>{(lead as any).funil_step || 1}</b></span>
                            {(lead as any).funil_proximo && (
                              <span className="text-primary/70">
                                ⏰ Dispara {formatarData((lead as any).funil_proximo)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-xs text-muted-foreground text-center">Nenhum lead neste funil.</div>
                  )}
                </Card>
              ))}
            </div>
          </div>

          {/* FOLLOW-UPS AGENDADOS */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <CalendarClock size={14} /> Follow-Ups Agendados
              </h2>
              <div className="flex gap-1">
                {["todos", "pendente", "enviado", "cancelado"].map(f => (
                  <Button
                    key={f}
                    size="sm"
                    variant={filtroStatus === f ? "default" : "ghost"}
                    onClick={() => setFiltroStatus(f)}
                    className="text-xs h-7 px-2.5"
                  >
                    {f === "todos" ? "Todos" : f.charAt(0).toUpperCase() + f.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            {followupsFiltrados.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="p-8 text-center text-muted-foreground text-sm">
                  <CalendarClock className="mx-auto mb-3 opacity-30" size={40} />
                  {filtroStatus === "todos"
                    ? "Nenhum follow-up agendado. Clique em \"Novo Follow-Up\" para criar."
                    : `Nenhum follow-up com status "${filtroStatus}".`
                  }
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {followupsFiltrados.map(fu => {
                  const isAtrasado = fu.status === "pendente" && new Date(fu.agendado_para) < new Date();
                  return (
                    <Card key={fu.id} className={`transition-colors ${isAtrasado ? 'border-red-500/30' : ''}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {/* Ícone de status */}
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-none ${
                            fu.status === "enviado" ? "bg-emerald-500/15 text-emerald-400" :
                            fu.status === "cancelado" ? "bg-zinc-500/15 text-zinc-400" :
                            isAtrasado ? "bg-red-500/15 text-red-400" :
                            "bg-primary/15 text-primary"
                          }`}>
                            {fu.status === "enviado" ? <CheckCircle2 size={18} /> :
                             fu.status === "cancelado" ? <XCircle size={18} /> :
                             isAtrasado ? <AlertCircle size={18} /> :
                             <Clock size={18} />}
                          </div>

                          {/* Conteúdo */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm text-foreground">
                                {fu.conversa?.nome || "Contato"}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {fu.conversa?.telefone}
                              </span>
                              {fu.conversa?.status_kanban && (
                                <Badge variant="secondary" className="text-[10px]">
                                  {fu.conversa.status_kanban}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">
                              {fu.texto}
                            </p>
                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                              <span className={`flex items-center gap-1 ${isAtrasado ? 'text-red-400 font-medium' : ''}`}>
                                <Clock size={10} />
                                {fu.status === "enviado" && fu.enviado_em
                                  ? `Enviado ${formatarData(fu.enviado_em)}`
                                  : formatarData(fu.agendado_para)
                                }
                              </span>
                              {fu.tentativas > 0 && (
                                <span>Tentativas: {fu.tentativas}</span>
                              )}
                            </div>
                          </div>

                          {/* Ações */}
                          {fu.status === "pendente" && (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                                onClick={() => handleCancelar(fu.id)}
                                title="Cancelar"
                              >
                                <XCircle size={14} />
                              </Button>
                            </div>
                          )}
                          {(fu.status === "enviado" || fu.status === "cancelado") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                              onClick={() => handleDeletar(fu.id)}
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </ScrollArea>
    </div>
  );
}
