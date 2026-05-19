import { useState, useEffect, useMemo } from 'react';
import { CalendarClock, Plus, Trash2, Clock, CheckCircle2, XCircle, AlertCircle, GitBranch, RefreshCw, GripVertical, MessageSquare, PowerOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { fetchConversas, fetchFollowUps, fetchMensagens, criarFollowUp, cancelarFollowUp, deletarFollowUp, ativarFunil, mudarKanban, sairFunil } from '@/services/api';
import type { Conversa, Mensagem } from '@/types/crm';
import { toast } from 'sonner';

interface FollowUpItem {
  id: string;
  conversaId: string;
  texto: string;
  agendado_para: string;
  status: string;
  tentativas: number;
  criado_em: string;
  enviado_em?: string;
  conversa?: Conversa;
}

export default function FollowUpPage() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [followups, setFollowups] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal novo follow-up
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoConversaId, setNovoConversaId] = useState('');
  const [novoTexto, setNovoTexto] = useState('');
  const [novoHoras, setNovoHoras] = useState('24');

  // Sheet do Chat Lateral
  const [selectedLead, setSelectedLead] = useState<Conversa | null>(null);
  const [leadMensagens, setLeadMensagens] = useState<Mensagem[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  // Modal de Agendamento Customizado (Substitui prompt)
  const [agendarModalOpen, setAgendarModalOpen] = useState(false);
  const [agendarLeadId, setAgendarLeadId] = useState('');
  const [agendarTipo, setAgendarTipo] = useState('');
  const [agendarDias, setAgendarDias] = useState('30');

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
      console.error('Erro ao carregar:', err);
    }
    setLoading(false);
  }

  async function abrirChatLateral(lead: Conversa) {
    setSelectedLead(lead);
    setLoadingMsgs(true);
    try {
      const data = await fetchMensagens(lead.id);
      setLeadMensagens(data.mensagens || []);
    } catch (err) {
      toast.error('Erro ao carregar mensagens');
    }
    setLoadingMsgs(false);
  }

  // Kanban Columns
  const funilNaoRespondeu = useMemo(() => conversas.filter(c => c.funil_tipo === 'nao_respondeu'), [conversas]);
  const funilOrcamentoSumiu = useMemo(() => conversas.filter(c => c.funil_tipo === 'orcamento_sumiu'), [conversas]);
  const leadsNaoFechou = useMemo(() => conversas.filter(c => c.status_kanban === 'Não Fechou' && !c.funil_tipo), [conversas]);
  const leadsRecorrentes = useMemo(() => conversas.filter(c => c.funil_tipo === 'recorrente'), [conversas]);
  const leadsReativacao = useMemo(() => conversas.filter(c => c.funil_tipo === 'reativacao'), [conversas]);

  const followupsConcluidos = useMemo(() => followups.filter(f => f.status === 'enviado' || f.status === 'cancelado'), [followups]);

  async function handleCriarFollowUp() {
    if (!novoConversaId || !novoTexto) return;
    const horasNum = parseInt(novoHoras) || 24;
    const agendado = new Date(Date.now() + horasNum * 60 * 60 * 1000).toISOString();
    try {
      await criarFollowUp({ conversaId: novoConversaId, texto: novoTexto, agendado_para: agendado });
      setNovoOpen(false);
      setNovoConversaId('');
      setNovoTexto('');
      setNovoHoras('24');
      toast.success('Follow-up agendado!');
      carregarDados();
    } catch (err) {
      toast.error('Erro ao agendar follow-up');
    }
  }

  async function handleDeletar(id: string) {
    try {
      await deletarFollowUp(id);
      carregarDados();
      toast.success('Histórico excluído');
    } catch (err) {
      toast.error('Erro ao excluir histórico');
    }
  }

  async function handleSairDoFunil(id: string) {
    if (!confirm('Deseja retirar este cliente do funil automático? Ele irá para Não Fechou.')) return;
    try {
      await sairFunil(id);
      carregarDados();
      toast.success('Cliente retirado do funil');
    } catch (err) {
      toast.error('Erro ao retirar do funil');
    }
  }

  async function handleExcluirCliente(id: string) {
    if (!confirm('Deseja excluir este cliente (mover para Finalizados)?')) return;
    try {
      await mudarKanban(id, 'Finalizados');
      carregarDados();
      toast.success('Cliente arquivado');
    } catch (err) {
      toast.error('Erro ao arquivar cliente');
    }
  }

  function prepararAgendamento(leadId: string, tipo: string) {
    setAgendarLeadId(leadId);
    setAgendarTipo(tipo);
    setAgendarDias('30');
    setAgendarModalOpen(true);
  }

  async function handleConfirmarAgendamento() {
    if (!agendarLeadId || !agendarDias) return;
    try {
      await ativarFunil(agendarLeadId, agendarTipo, parseInt(agendarDias));
      toast.success(`Adicionado ao funil de ${agendarTipo}!`);
      setAgendarModalOpen(false);
      carregarDados();
    } catch (err) {
      toast.error('Erro ao agendar');
    }
  }

  function formatarData(iso: string) {
    if (!iso) return '';
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

  if (loading) return <div className="flex-1 flex items-center justify-center"><RefreshCw className="animate-spin text-primary" size={32} /></div>;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Header */}
      <header className="px-6 py-4 border-b border-border/50 bg-card/30 flex-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <GitBranch size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">CRM Follow-up</h1>
              <p className="text-xs text-muted-foreground">Acompanhe e organize envios automáticos e manuais</p>
            </div>
          </div>
          <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 text-xs"><Plus size={14} className="mr-1"/> Agendamento Manual</Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Agendar Follow-up Único</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold">Cliente</label>
                  <select className="w-full border p-2 rounded-md text-sm bg-background" value={novoConversaId} onChange={e => setNovoConversaId(e.target.value)}>
                    <option value="">Selecione...</option>
                    {conversas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold">Tempo (em horas)</label>
                  <Input type="number" value={novoHoras} onChange={e => setNovoHoras(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold">Mensagem</label>
                  <Textarea placeholder="Texto do follow-up..." className="h-24 resize-none" value={novoTexto} onChange={e => setNovoTexto(e.target.value)} />
                </div>
                <Button className="w-full" onClick={handleCriarFollowUp}>Agendar Mensagem</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
        <div className="flex h-full gap-4 min-w-max pb-2">
          
          {/* COLUNA 1: NÃO RESPONDEU */}
          <div className="w-72 flex flex-col bg-muted/20 border rounded-xl overflow-hidden shadow-sm flex-none" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('leadId'); if (id) prepararAgendamento(id, 'nao_respondeu'); }}>
            <div className="p-3 bg-card border-b font-semibold flex justify-between items-center text-sm text-foreground">
              <div className="flex items-center gap-2"><RefreshCw size={16} className="text-blue-500"/><span>Não Respondeu</span></div>
              <Badge variant="secondary">{funilNaoRespondeu.length}</Badge>
            </div>
            <div className="flex-1 p-3 overflow-y-auto space-y-3">
                {funilNaoRespondeu.map(lead => (
                  <div 
                    key={lead.id} 
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('leadId', lead.id)}
                    className="bg-card border p-3 rounded-lg flex flex-col gap-2 shadow-sm hover:border-blue-500/50 transition-colors cursor-grab active:cursor-grabbing" 
                    onClick={() => abrirChatLateral(lead)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <GripVertical size={14} className="text-muted-foreground/40" />
                        <span className="font-semibold text-sm">{lead.nome}</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:text-red-500" onClick={(e) => { e.stopPropagation(); handleSairDoFunil(lead.id); }} title="Sair do Funil (Parar Robô)">
                        <PowerOff size={14} />
                      </Button>
                    </div>
                    <div className="flex justify-between items-end text-xs">
                      <span className="text-muted-foreground">Etapa: {lead.funil_step}</span>
                      <span className="text-blue-500 font-medium">{formatarData(lead.funil_proximo!)}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* COLUNA 2: ORÇAMENTO SUMIU */}
          <div className="w-72 flex flex-col bg-muted/20 border rounded-xl overflow-hidden shadow-sm flex-none" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('leadId'); if (id) prepararAgendamento(id, 'orcamento_sumiu'); }}>
            <div className="p-3 bg-card border-b font-semibold flex justify-between items-center text-sm text-foreground">
              <div className="flex items-center gap-2"><RefreshCw size={16} className="text-orange-500"/><span>Orçamento Sumiu</span></div>
              <Badge variant="secondary">{funilOrcamentoSumiu.length}</Badge>
            </div>
            <div className="flex-1 p-3 overflow-y-auto space-y-3">
                {funilOrcamentoSumiu.map(lead => (
                  <div 
                    key={lead.id} 
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('leadId', lead.id)}
                    className="bg-card border p-3 rounded-lg flex flex-col gap-2 shadow-sm hover:border-orange-500/50 transition-colors cursor-grab active:cursor-grabbing" 
                    onClick={() => abrirChatLateral(lead)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <GripVertical size={14} className="text-muted-foreground/40" />
                        <span className="font-semibold text-sm">{lead.nome}</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:text-red-500" onClick={(e) => { e.stopPropagation(); handleSairDoFunil(lead.id); }} title="Sair do Funil (Parar Robô)">
                        <PowerOff size={14} />
                      </Button>
                    </div>
                    <div className="flex justify-between items-end text-xs">
                      <span className="text-muted-foreground">Etapa: {lead.funil_step}</span>
                      <span className="text-orange-500 font-medium">{formatarData(lead.funil_proximo!)}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* COLUNA 3: NÃO FECHOU (FIM DE FUNIL) */}
          <div className="w-72 flex flex-col bg-muted/20 border rounded-xl overflow-hidden shadow-sm flex-none" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('leadId'); if (id) sairFunil(id).then(carregarDados); }}>
            <div className="p-3 bg-card border-b font-semibold flex justify-between items-center text-sm text-foreground">
              <div className="flex items-center gap-2"><GitBranch size={16} className="text-primary"/><span>Não Fechou</span></div>
              <Badge variant="secondary">{leadsNaoFechou.length}</Badge>
            </div>
            <div className="p-2 bg-muted/30 text-[11px] text-muted-foreground border-b text-center">
              Arraste para as próximas colunas para reagendar.
            </div>
            <div className="flex-1 p-3 overflow-y-auto space-y-3">
                {leadsNaoFechou.map(lead => (
                  <div 
                    key={lead.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('leadId', lead.id)}
                    className="bg-card border p-3 rounded-lg flex flex-col gap-2 shadow-sm cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors"
                    onClick={() => abrirChatLateral(lead)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <GripVertical size={14} className="text-muted-foreground/40" />
                        <span className="font-semibold text-sm">{lead.nome}</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:text-red-500" onClick={(e) => { e.stopPropagation(); handleExcluirCliente(lead.id); }} title="Arquivar">
                        <Trash2 size={12} />
                      </Button>
                    </div>
                    <span className="text-xs text-muted-foreground ml-6">{lead.telefone}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* COLUNA 4: RECORRENTES */}
          <div className="w-72 flex flex-col bg-primary/5 border border-primary/20 rounded-xl overflow-hidden shadow-sm flex-none" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('leadId'); if (id) prepararAgendamento(id, 'recorrente'); }}>
            <div className="p-3 bg-card border-b font-semibold flex justify-between items-center text-sm text-foreground">
              <div className="flex items-center gap-2"><CalendarClock size={16} className="text-primary"/><span>Recorrentes</span></div>
              <Badge variant="default">{leadsRecorrentes.length}</Badge>
            </div>
            <div className="p-2 bg-muted/30 text-[11px] text-primary/80 border-b text-center">
              Solte aqui (MENSAGEM RECORRENTE)
            </div>
            <div className="flex-1 p-3 overflow-y-auto space-y-3">
                {leadsRecorrentes.map(lead => (
                  <div 
                    key={lead.id} 
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('leadId', lead.id)}
                    className="bg-card border p-3 rounded-lg flex justify-between items-center shadow-sm cursor-grab hover:border-primary/50" 
                    onClick={() => abrirChatLateral(lead)}
                  >
                    <div>
                      <span className="font-semibold text-sm block">{lead.nome}</span>
                      <span className="text-xs text-primary">Próx: {formatarData(lead.funil_proximo!)}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-red-500" onClick={(e) => { e.stopPropagation(); handleSairDoFunil(lead.id); }} title="Parar Recorrência">
                      <XCircle size={14} />
                    </Button>
                  </div>
                ))}
            </div>
          </div>

          {/* COLUNA 5: REATIVAÇÃO (IGREJAS/EMPRESAS) */}
          <div className="w-72 flex flex-col bg-emerald-500/5 border border-emerald-500/20 rounded-xl overflow-hidden shadow-sm flex-none" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('leadId'); if (id) prepararAgendamento(id, 'reativacao'); }}>
            <div className="p-3 bg-card border-b font-semibold flex justify-between items-center text-sm text-foreground">
              <div className="flex items-center gap-2"><MessageSquare size={16} className="text-emerald-500"/><span>Reativação</span></div>
              <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-500/10">{leadsReativacao.length}</Badge>
            </div>
            <div className="p-2 bg-muted/30 text-[11px] text-emerald-600/70 border-b text-center">
              Solte aqui (EMPRESAS / IGREJAS)
            </div>
            <div className="flex-1 p-3 overflow-y-auto space-y-3">
                {leadsReativacao.map(lead => (
                  <div 
                    key={lead.id} 
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('leadId', lead.id)}
                    className="bg-card border p-3 rounded-lg flex justify-between items-center shadow-sm cursor-grab hover:border-emerald-500/50" 
                    onClick={() => abrirChatLateral(lead)}
                  >
                    <div>
                      <span className="font-semibold text-sm block">{lead.nome}</span>
                      <span className="text-xs text-emerald-600">Próx: {formatarData(lead.funil_proximo!)}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-red-500" onClick={(e) => { e.stopPropagation(); handleSairDoFunil(lead.id); }} title="Parar Reativação">
                      <XCircle size={14} />
                    </Button>
                  </div>
                ))}
            </div>
          </div>

        </div>
      </div>

      {/* Histórico Manual (Rodapé compacto) */}
      <div className="h-40 border-t bg-card/30 flex flex-col flex-none">
        <div className="p-2 bg-card border-b font-semibold text-xs text-muted-foreground flex justify-between items-center">
          <span className="uppercase tracking-wider">Histórico de Follow-ups Manuais</span>
          <Badge variant="secondary">{followupsConcluidos.length}</Badge>
        </div>
        <ScrollArea className="flex-1 p-3">
          {followupsConcluidos.length === 0 ? (
            <p className="text-xs text-center text-muted-foreground/50 mt-10">Nenhum histórico</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {followupsConcluidos.map(fu => (
                <div key={fu.id} className="bg-card border p-2 rounded flex items-center justify-between min-w-[250px] max-w-[350px] shadow-sm">
                  <div className="flex flex-col">
                    <span className="font-semibold text-xs">{fu.conversa?.nome}</span>
                    <span className="text-[10px] text-muted-foreground truncate">{fu.texto}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:text-red-500 ml-2" onClick={() => handleDeletar(fu.id)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Modal de Agendamento Customizado (Substitui o window.prompt) */}
      <Dialog open={agendarModalOpen} onOpenChange={setAgendarModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {agendarTipo === 'recorrente' ? 'Agendar Mensagem Recorrente' : 
               agendarTipo === 'reativacao' ? 'Agendar Reativação (Igrejas/Empresas)' :
               agendarTipo === 'nao_respondeu' ? 'Voltar para Funil: Não Respondeu' :
               'Voltar para Funil: Orçamento Sumiu'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              De quantos em quantos dias você quer que o robô envie esta mensagem?
            </p>
            <div className="space-y-2">
              <label className="text-xs font-semibold">Intervalo em dias</label>
              <Input 
                type="number" 
                value={agendarDias} 
                onChange={e => setAgendarDias(e.target.value)} 
                min="1"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAgendarModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirmarAgendamento}>Salvar Agendamento</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sheet de Chat Lateral */}
      <Sheet open={selectedLead !== null} onOpenChange={(val) => { if (!val) setSelectedLead(null); }}>
        <SheetContent className="w-[400px] sm:w-[540px] flex flex-col p-0">
          <SheetHeader className="p-4 border-b flex-none">
            <SheetTitle className="flex items-center gap-3">
              {selectedLead?.profile_pic_url ? (
                <img src={selectedLead.profile_pic_url} className="w-10 h-10 rounded-full" alt="" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {selectedLead?.nome?.charAt(0) || '?'}
                </div>
              )}
              <div className="flex flex-col">
                <span>{selectedLead?.nome}</span>
                <span className="text-xs text-muted-foreground font-normal">{selectedLead?.telefone}</span>
              </div>
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto bg-muted/10 p-4">
            {loadingMsgs ? (
              <div className="flex items-center justify-center h-full"><RefreshCw className="animate-spin text-muted-foreground" /></div>
            ) : leadMensagens.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm opacity-50">
                <MessageSquare size={32} className="mb-2" />
                Nenhuma mensagem
              </div>
            ) : (
              <div className="flex flex-col gap-3 pb-4">
                {leadMensagens.map(msg => {
                  const isCliente = msg.origem === 'cliente';
                  return (
                    <div key={msg.id} className={`flex ${isCliente ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[80%] rounded-xl px-4 py-2 text-sm ${isCliente ? 'bg-card border rounded-tl-sm shadow-sm' : 'bg-primary text-primary-foreground rounded-tr-sm'}`}>
                        {msg.texto}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="p-4 border-t bg-card text-center text-xs text-muted-foreground">
            Para responder, acesse a <a href={`/chat?chat=${selectedLead?.id}`} className="text-primary font-semibold hover:underline">Central de Atendimento</a>.
          </div>
        </SheetContent>
      </Sheet>

    </div>
  );
}
