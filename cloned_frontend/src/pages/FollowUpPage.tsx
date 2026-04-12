import { useState, useEffect, useMemo } from 'react';
import { CalendarClock, Plus, Send, Trash2, X, Clock, CheckCircle2, XCircle, User, Search, Filter, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { fetchConversas, fetchFollowUps, criarFollowUp, cancelarFollowUp, deletarFollowUp, fetchRespostas } from '@/services/api';
import type { Conversa, RespostaRapida } from '@/types/crm';
import { toast } from 'sonner';

interface FollowUpItem {
  id: string;
  conversaId: string;
  texto: string;
  agendado_para: string;
  status: string;
  tentativas: number;
  criado_em: string;
  enviado_em: string | null;
  conversa: {
    nome: string;
    telefone: string;
    profile_pic_url: string | null;
    status_kanban: string;
  };
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function isOverdue(dateStr: string) {
  return new Date(dateStr) < new Date();
}

export default function FollowUpPage() {
  const [followups, setFollowups] = useState<FollowUpItem[]>([]);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [respostas, setRespostas] = useState<RespostaRapida[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'todos' | 'pendente' | 'enviado' | 'cancelado'>('todos');
  const [searchTerm, setSearchTerm] = useState('');

  // Form
  const [selectedConversaId, setSelectedConversaId] = useState('');
  const [texto, setTexto] = useState('');
  const [agendadoPara, setAgendadoPara] = useState('');

  const loadData = async () => {
    const [fups, convs, resps] = await Promise.all([fetchFollowUps(), fetchConversas(), fetchRespostas()]);
    setFollowups(fups);
    setConversas(convs);
    setRespostas(resps);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const filtered = useMemo(() => {
    let list = followups;
    if (filterStatus !== 'todos') {
      list = list.filter(f => f.status === filterStatus);
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(f => f.conversa.nome.toLowerCase().includes(q) || f.texto.toLowerCase().includes(q));
    }
    return list;
  }, [followups, filterStatus, searchTerm]);

  const pendentes = followups.filter(f => f.status === 'pendente').length;
  const enviados = followups.filter(f => f.status === 'enviado').length;
  const atrasados = followups.filter(f => f.status === 'pendente' && isOverdue(f.agendado_para)).length;

  const handleCreate = async () => {
    if (!selectedConversaId || !texto.trim() || !agendadoPara) {
      toast.error('Preencha todos os campos');
      return;
    }
    try {
      await criarFollowUp({ conversaId: selectedConversaId, texto: texto.trim(), agendado_para: agendadoPara });
      toast.success('Follow-up agendado!');
      setShowCreate(false);
      setSelectedConversaId('');
      setTexto('');
      setAgendadoPara('');
      loadData();
    } catch { toast.error('Erro ao agendar'); }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancelar este follow-up?')) return;
    await cancelarFollowUp(id);
    toast.success('Follow-up cancelado');
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir permanentemente?')) return;
    await deletarFollowUp(id);
    toast.success('Follow-up excluído');
    loadData();
  };

  const statusConfig = {
    pendente: { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'Pendente' },
    enviado: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'Enviado' },
    cancelado: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Cancelado' },
  };

  // Min date for the date picker (now)
  const minDate = new Date().toISOString().slice(0, 16);

  return (
    <div className="flex flex-col h-full bg-background p-6 overflow-y-auto scrollbar-thin">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarClock className="text-primary" /> Central de Follow-Up
            </h1>
            <p className="text-sm text-muted-foreground">Agende lembretes para nunca perder uma venda.</p>
          </div>
          <Button onClick={() => setShowCreate(!showCreate)} className="gap-2 rounded-xl shadow-lg shadow-primary/20">
            {showCreate ? <X size={16} /> : <Plus size={16} />}
            {showCreate ? 'Cancelar' : 'Agendar Follow-Up'}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-card rounded-2xl border p-4 text-center">
            <p className="text-2xl font-bold text-amber-500">{pendentes}</p>
            <p className="text-[10px] text-muted-foreground font-bold uppercase">Pendentes</p>
          </div>
          <div className="bg-card rounded-2xl border p-4 text-center">
            <p className="text-2xl font-bold text-emerald-500">{enviados}</p>
            <p className="text-[10px] text-muted-foreground font-bold uppercase">Enviados</p>
          </div>
          <div className="bg-card rounded-2xl border p-4 text-center">
            <p className={cn("text-2xl font-bold", atrasados > 0 ? "text-red-500" : "text-muted-foreground")}>{atrasados}</p>
            <p className="text-[10px] text-muted-foreground font-bold uppercase">Atrasados</p>
          </div>
        </div>

        {/* Create Form */}
        {showCreate && (
          <div className="bg-card rounded-2xl border p-6 shadow-sm space-y-4 animate-in slide-in-from-top-2">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Bell size={16} className="text-primary" /> Novo Agendamento
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase">Cliente</label>
                <select
                  value={selectedConversaId}
                  onChange={e => setSelectedConversaId(e.target.value)}
                  className="w-full text-xs border rounded-xl px-3 py-2.5 bg-secondary text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                >
                  <option value="">Selecione um cliente...</option>
                  {conversas.map(c => (
                    <option key={c.id} value={c.id}>{c.nome} — {c.telefone}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase">Data e Hora do Disparo</label>
                <Input
                  type="datetime-local"
                  value={agendadoPara}
                  onChange={e => setAgendadoPara(e.target.value)}
                  min={minDate}
                  className="text-xs bg-secondary border-0 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-muted-foreground uppercase">Mensagem</label>
                <select
                  onChange={e => {
                    if (e.target.value) setTexto(e.target.value);
                    e.target.selectedIndex = 0;
                  }}
                  className="text-[10px] font-bold bg-primary/10 text-primary border-none rounded-lg px-2 py-1 cursor-pointer"
                >
                  <option value="">Puxar template...</option>
                  {respostas.map(r => (
                    <option key={r.id} value={r.texto}>{r.atalho}</option>
                  ))}
                </select>
              </div>
              <Textarea
                placeholder="Oi! Passando pra saber se você ainda tem interesse..."
                value={texto}
                onChange={e => setTexto(e.target.value)}
                className="min-h-[100px] text-sm bg-secondary border-0 rounded-2xl resize-none"
              />
            </div>

            <Button onClick={handleCreate} className="w-full gap-2 rounded-xl h-11">
              <Send size={16} /> Agendar Follow-Up
            </Button>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou texto..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 text-xs rounded-xl bg-secondary border-0"
            />
          </div>
          <div className="flex gap-1.5">
            {(['todos', 'pendente', 'enviado', 'cancelado'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={cn(
                  'text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg border transition-all',
                  filterStatus === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary text-muted-foreground border-transparent hover:bg-secondary/80'
                )}
              >
                {s === 'todos' ? 'Todos' : statusConfig[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="space-y-3">
          {filtered.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <CalendarClock size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhum follow-up {filterStatus !== 'todos' ? statusConfig[filterStatus]?.label?.toLowerCase() : ''} encontrado</p>
              <p className="text-xs mt-1">Clique em "Agendar Follow-Up" para criar o primeiro!</p>
            </div>
          )}

          {filtered.map(f => {
            const sc = statusConfig[f.status as keyof typeof statusConfig] || statusConfig.pendente;
            const Icon = sc.icon;
            const overdue = f.status === 'pendente' && isOverdue(f.agendado_para);

            return (
              <div
                key={f.id}
                className={cn(
                  'bg-card rounded-2xl border p-4 shadow-sm transition-all hover:shadow-md',
                  overdue && 'border-red-500/30 bg-red-500/5'
                )}
              >
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  {f.conversa.profile_pic_url ? (
                    <img src={f.conversa.profile_pic_url} className="w-10 h-10 rounded-full ring-2 ring-primary/20 object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0 ring-2 ring-primary/20">
                      {f.conversa.nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold">{f.conversa.nome}</p>
                        <p className="text-[10px] text-muted-foreground">{f.conversa.telefone} • {f.conversa.status_kanban}</p>
                      </div>
                      <Badge className={cn('text-[10px] font-bold gap-1', sc.bg, sc.color, sc.border, 'border')}>
                        <Icon size={10} />
                        {overdue ? 'Atrasado!' : sc.label}
                      </Badge>
                    </div>

                    <p className="text-xs text-foreground/80 bg-secondary/50 p-2.5 rounded-xl italic">"{f.texto}"</p>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarClock size={10} /> Disparo: <span className={cn("font-bold", overdue && "text-red-500")}>{formatDateTime(f.agendado_para)}</span>
                        </span>
                        {f.enviado_em && (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 size={10} className="text-emerald-500" /> Enviado: {formatDateTime(f.enviado_em)}
                          </span>
                        )}
                      </div>

                      <div className="flex gap-1">
                        {f.status === 'pendente' && (
                          <button onClick={() => handleCancel(f.id)} className="text-[10px] font-bold text-amber-500 hover:text-amber-400 transition-colors px-2 py-1 rounded-lg hover:bg-amber-500/10">
                            Cancelar
                          </button>
                        )}
                        <button onClick={() => handleDelete(f.id)} className="text-[10px] font-bold text-destructive hover:text-destructive/80 transition-colors px-2 py-1 rounded-lg hover:bg-destructive/10">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
