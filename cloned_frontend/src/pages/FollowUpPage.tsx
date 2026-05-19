import { useState, useEffect, useMemo } from 'react';
import { CalendarClock, Plus, Trash2, Clock, CheckCircle2, XCircle, AlertCircle, GitBranch, RefreshCw, GripVertical } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchConversas, fetchFollowUps, criarFollowUp, cancelarFollowUp, deletarFollowUp, agendarRecorrente, mudarKanban } from '@/services/api';
import type { Conversa } from '@/types/crm';
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
  conversa?: {
    nome: string;
    telefone: string;
    profile_pic_url?: string;
    status_kanban: string;
  };
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

  const funisAgrupados = useMemo(() => {
    const mapa: Record<string, Conversa[]> = {
      'nao_respondeu': [],
      'orcamento_sumiu': []
    };
    conversas.forEach(c => {
      const tipo = c.funil_tipo;
      if (tipo && mapa[tipo]) {
        mapa[tipo].push(c);
      }
    });
    return mapa;
  }, [conversas]);

  const leadsNaoFechou = useMemo(() => conversas.filter(c => c.status_kanban === 'Não Fechou' && !c.funil_tipo), [conversas]);
  const leadsRecorrentes = useMemo(() => conversas.filter(c => c.funil_tipo === 'recorrente'), [conversas]);
  const followupsAtivos = useMemo(() => followups.filter(f => f.status === 'pendente'), [followups]);
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

  async function handleCancelar(id: string) {
    try {
      await cancelarFollowUp(id);
      carregarDados();
      toast.success('Follow-up cancelado');
    } catch (err) {
      toast.error('Erro ao cancelar');
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

  async function handleExcluirCliente(id: string) {
    if (!confirm('Deseja excluir este cliente da lista de acompanhamento (move para Finalizados)?')) return;
    try {
      await mudarKanban(id, 'Finalizados');
      carregarDados();
      toast.success('Cliente excluído do acompanhamento');
    } catch (err) {
      toast.error('Erro ao excluir cliente');
    }
  }

  async function handlePararRecorrente(id: string) {
    if (!confirm('Deseja parar os envios recorrentes para este cliente?')) return;
    try {
      // Mover para 'Finalizados' ou 'Não Fechou' novamente. Vamos mover para Finalizados para tirar do funil e do acompanhamento
      await mudarKanban(id, 'Finalizados');
      carregarDados();
      toast.success('Recorrência cancelada');
    } catch (err) {
      toast.error('Erro ao cancelar recorrência');
    }
  }

  async function onDropToRecorrente(leadId: string) {
    const dias = prompt('Enviar mensagem recorrente a cada quantos dias?', '30');
    if (!dias) return;
    try {
      await agendarRecorrente(leadId, parseInt(dias));
      toast.success('Funil recorrente ativado!');
      carregarDados();
    } catch (err) {
      toast.error('Erro ao agendar recorrente');
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

  const RenderFollowupList = ({ items }: { items: FollowUpItem[] }) => {
    if (items.length === 0) {
      return (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            <CalendarClock className="mx-auto mb-3 opacity-30" size={40} />
            Nenhum follow-up nesta lista.
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="space-y-2">
        {items.map(fu => {
          const isAtrasado = fu.status === 'pendente' && new Date(fu.agendado_para) < new Date();
          return (
            <Card key={fu.id} className={`transition-colors ${isAtrasado ? 'border-red-500/30' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-none ${
                    fu.status === 'enviado' ? 'bg-emerald-500/15 text-emerald-400' :
                    fu.status === 'cancelado' ? 'bg-zinc-500/15 text-zinc-400' :
                    isAtrasado ? 'bg-red-500/15 text-red-400' :
                    'bg-primary/15 text-primary'
                  }`}>
                    {fu.status === 'enviado' ? <CheckCircle2 size={18} /> :
                     fu.status === 'cancelado' ? <XCircle size={18} /> :
                     isAtrasado ? <AlertCircle size={18} /> :
                     <Clock size={18} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm text-foreground">
                        {fu.conversa?.nome || 'Contato'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {fu.conversa?.telefone}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">
                      {fu.texto}
                    </p>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className={`flex items-center gap-1 ${isAtrasado ? 'text-red-400 font-medium' : ''}`}>
                        <Clock size={10} />
                        {fu.status === 'enviado' && fu.enviado_em
                          ? `Enviado ${formatarData(fu.enviado_em)}`
                          : formatarData(fu.agendado_para)
                        }
                      </span>
                    </div>
                  </div>

                  {fu.status === 'pendente' && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" onClick={() => handleCancelar(fu.id)}>
                      <XCircle size={14} />
                    </Button>
                  )}
                  {(fu.status === 'enviado' || fu.status === 'cancelado') && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" onClick={() => handleDeletar(fu.id)}>
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><RefreshCw className="animate-spin text-primary" size={32} /></div>;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <header className="px-6 py-5 border-b border-border/50 bg-card/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <GitBranch size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Central de Follow-Up</h1>
              <p className="text-xs text-muted-foreground">Acompanhamento de clientes</p>
            </div>
          </div>
          <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 text-xs"><Plus size={14} className="mr-1"/> Novo Agendamento</Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Agendar Follow-up</DialogTitle></DialogHeader>
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

      <Tabs defaultValue="ativos" className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="px-6 py-2 border-b">
          <TabsList>
            <TabsTrigger value="ativos">Em Andamento</TabsTrigger>
            <TabsTrigger value="concluidos">Concluídos & Recorrentes</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="ativos" className="p-6 m-0 h-full overflow-y-auto">
          <div className="space-y-8 max-w-4xl mx-auto pb-10">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Funis Automáticos (Robô)</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {['nao_respondeu', 'orcamento_sumiu'].map(tipo => {
                  const leads = funisAgrupados[tipo];
                  const info = tipo === 'nao_respondeu' ? { nome: 'Não Respondeu', icon: '🔴' } : { nome: 'Orçamento Sumiu', icon: '🟡' };
                  return (
                    <Card key={tipo} className="overflow-hidden border-border/50">
                      <div className="bg-card p-3 border-b border-border/30 flex items-center justify-between">
                        <div className="flex items-center gap-2"><span className="text-lg">{info.icon}</span><span className="font-bold text-sm text-foreground/90">{info.nome}</span></div>
                        <Badge variant="secondary">{leads.length} leads</Badge>
                      </div>
                      <div className="p-3 flex flex-col gap-2 min-h-24">
                        {leads.map(lead => (
                          <div key={lead.id} className="bg-muted/20 border p-2 rounded-lg text-xs flex justify-between">
                            <span className="font-semibold">{lead.nome}</span>
                            <span className="text-muted-foreground">Step {lead.funil_step || 1}</span>
                          </div>
                        ))}
                        {leads.length === 0 && <span className="text-xs text-muted-foreground text-center my-auto">Vazio</span>}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Follow-Ups Agendados (Manuais)</h2>
              <RenderFollowupList items={followupsAtivos} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="concluidos" className="p-6 m-0 h-full overflow-hidden flex flex-col">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
            
            <div className="flex flex-col border rounded-xl bg-muted/10 overflow-hidden shadow-sm">
              <div className="p-3 bg-card border-b font-semibold flex justify-between items-center text-sm text-foreground">
                <div className="flex items-center gap-2"><GitBranch size={16} className="text-primary"/><span>Fim de Funil (Não Fechou)</span></div>
                <Badge variant="secondary">{leadsNaoFechou.length}</Badge>
              </div>
              <div className="p-2 bg-muted/30 text-[11px] text-muted-foreground border-b text-center">
                Arraste um cliente para a coluna ao lado para agendar envios periódicos.
              </div>
              <ScrollArea className="flex-1 p-3">
                <div className="space-y-2 pb-10">
                  {leadsNaoFechou.map(lead => (
                    <div 
                      key={lead.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('leadId', lead.id)}
                      className="bg-card border p-3 rounded-lg flex flex-col gap-1 shadow-sm cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <GripVertical size={14} className="text-muted-foreground/40" />
                          <span className="font-semibold text-sm">{lead.nome}</span>
                        </div>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500" onClick={() => handleExcluirCliente(lead.id)} title="Excluir do Acompanhamento">
                          <Trash2 size={12} />
                        </Button>
                      </div>
                      <span className="text-xs text-muted-foreground ml-6">{lead.telefone}</span>
                    </div>
                  ))}
                  {leadsNaoFechou.length === 0 && (
                     <p className="text-xs text-center text-muted-foreground mt-8 italic">Nenhum cliente finalizou o funil recentemente.</p>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div 
              className="flex flex-col border border-primary/20 rounded-xl bg-primary/5 overflow-hidden shadow-sm"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const leadId = e.dataTransfer.getData('leadId');
                if (leadId) onDropToRecorrente(leadId);
              }}
            >
              <div className="p-3 bg-card border-b font-semibold flex justify-between items-center text-sm text-foreground">
                <div className="flex items-center gap-2"><CalendarClock size={16} className="text-primary"/><span>Funil Recorrente (Agendados)</span></div>
                <Badge variant="default">{leadsRecorrentes.length}</Badge>
              </div>
              <ScrollArea className="flex-1 p-3">
                <div className="space-y-2 pb-10">
                  {leadsRecorrentes.map(lead => (
                    <div key={lead.id} className="bg-card border p-3 rounded-lg flex justify-between items-center shadow-sm">
                      <div>
                        <span className="font-semibold text-sm block">{lead.nome}</span>
                        {lead.funil_proximo && <span className="text-xs text-primary">Próx: {formatarData(lead.funil_proximo)}</span>}
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-red-500" onClick={() => handlePararRecorrente(lead.id)} title="Parar Recorrência">
                        <XCircle size={14} />
                      </Button>
                    </div>
                  ))}
                  {leadsRecorrentes.length === 0 && (
                    <div className="flex flex-col items-center justify-center mt-12 text-muted-foreground opacity-50">
                      <CalendarClock size={32} className="mb-2" />
                      <p className="text-xs text-center">Arraste leads para cá</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
            
          </div>
          
          <div className="mt-6 bg-card border rounded-xl overflow-hidden shadow-sm flex flex-col flex-none" style={{ height: '250px' }}>
            <div className="p-3 bg-muted/30 border-b font-semibold text-sm flex justify-between">
              <span>Histórico (Follow-ups Entregues)</span>
            </div>
            <ScrollArea className="flex-1 p-4">
              <RenderFollowupList items={followupsConcluidos} />
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
