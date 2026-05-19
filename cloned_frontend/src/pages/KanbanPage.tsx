import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X, CalendarClock, MessageCircle, TrendingUp, Users, GripVertical, Settings2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fetchConversas, mudarKanban, fetchMensagens, fetchRespostas } from '@/services/api';
import type { Conversa, Mensagem, RespostaRapida } from '@/types/crm';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ChatArea } from '@/components/chat/ChatArea';

interface PipelineCol {
  id: number;
  nome: string;
  cor: string;
  ordem: number;
}

const PRESET_COLORS = [
  'hsl(210,80%,55%)', 'hsl(38,92%,50%)', 'hsl(145,63%,42%)',
  'hsl(262,83%,58%)', 'hsl(220,15%,70%)', 'hsl(0,84%,60%)',
  'hsl(330,81%,60%)', 'hsl(25,95%,53%)', 'hsl(180,50%,40%)',
];

function formatWhatsAppDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function KanbanPage() {
  const navigate = useNavigate();
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [columns, setColumns] = useState<PipelineCol[]>([]);
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Inline create/edit
  const [newColName, setNewColName] = useState('');
  const [newColCor, setNewColCor] = useState(PRESET_COLORS[0]);
  const [editingCol, setEditingCol] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editCor, setEditCor] = useState('');

  // Side Chat State
  const [activeChat, setActiveChat] = useState<Conversa | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [respostas, setRespostas] = useState<RespostaRapida[]>([]);

  const loadData = async () => {
    const [convs, cols, resp] = await Promise.all([
      fetchConversas(),
      fetch('/api/pipeline').then(r => r.json()),
      fetchRespostas()
    ]);
    setConversas(convs);
    setColumns(cols);
    setRespostas(resp);
  };

  const handleOpenChat = async (c: Conversa) => {
    setActiveChat(c);
    try {
      const data = await fetchMensagens(c.id);
      setMensagens(data.mensagens || []);
    } catch (err) {
      toast.error('Erro ao carregar mensagens');
    }
  };

  useEffect(() => { loadData(); }, []);

  const getColumnData = (colName: string) => {
    const items = conversas.filter(c => c.status_kanban === colName);
    const totalValue = items.reduce((acc, c) => acc + (c.valor_conversa || 0), 0);
    return { items, totalValue };
  };

  const handleDrop = async (col: string) => {
    if (!dragItem) return;
    await mudarKanban(dragItem, col);
    setConversas(prev => prev.map(c => c.id === dragItem ? { ...c, status_kanban: col } : c));
    setDragItem(null);
    setDragOverCol(null);
  };

  const handleCreateColumn = async () => {
    if (!newColName.trim()) return;
    try {
      await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: newColName.trim(), cor: newColCor })
      });
      toast.success(`Coluna "${newColName}" criada!`);
      setNewColName('');
      setNewColCor(PRESET_COLORS[0]);
      loadData();
    } catch { toast.error('Erro ao criar coluna'); }
  };

  const handleEditColumn = async (id: number) => {
    try {
      await fetch(`/api/pipeline/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: editName, cor: editCor })
      });
      toast.success('Coluna atualizada!');
      setEditingCol(null);
      loadData();
    } catch { toast.error('Erro ao editar'); }
  };

  const handleDeleteColumn = async (id: number, nome: string) => {
    if (!confirm(`Excluir a coluna "${nome}"? Os leads serão movidos para "Novos".`)) return;
    try {
      await fetch(`/api/pipeline/${id}`, { method: 'DELETE' });
      toast.success(`Coluna "${nome}" excluída`);
      loadData();
    } catch { toast.error('Erro ao excluir'); }
  };

  return (
    <div className="h-full flex flex-col p-4 lg:p-6 bg-background/50 overflow-hidden">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp size={20} className="text-primary" /> Funil de Vendas
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Gestão visual do faturamento potencial.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Faturamento Total</p>
            <p className="text-lg font-bold text-primary">
              {conversas.reduce((acc, c) => acc + (c.valor_conversa || 0), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
          <Button
            variant={showSettings ? "default" : "outline"}
            size="sm"
            className="gap-1.5 text-xs rounded-xl"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings2 size={14} />
            {showSettings ? 'Fechar' : 'Editar Colunas'}
          </Button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="mb-6 bg-card rounded-2xl border p-5 shadow-sm space-y-4 animate-in slide-in-from-top-2">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Settings2 size={14} className="text-primary" /> Gerenciar Colunas do Funil
          </h3>

          {/* Existing columns */}
          <div className="space-y-2">
            {columns.map(col => (
              <div key={col.id} className="flex items-center gap-3 bg-secondary/30 rounded-xl px-3 py-2">
                {editingCol === col.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="text-xs h-8 flex-1"
                      autoFocus
                    />
                    <div className="flex gap-1">
                      {PRESET_COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => setEditCor(c)}
                          className={cn("w-5 h-5 rounded-full border-2 transition-all", editCor === c ? 'border-foreground scale-110' : 'border-transparent')}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => handleEditColumn(col.id)}>
                      <Check size={14} />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setEditingCol(null)}>
                      <X size={14} />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: col.cor }} />
                    <span className="text-xs font-semibold flex-1">{col.nome}</span>
                    <Badge variant="secondary" className="text-[10px]">{getColumnData(col.nome).items.length} leads</Badge>
                    <button
                      onClick={() => { setEditingCol(col.id); setEditName(col.nome); setEditCor(col.cor); }}
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={() => handleDeleteColumn(col.id, col.nome)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Add new column */}
          <div className="flex items-center gap-3 border-t border-border/50 pt-4">
            <Input
              value={newColName}
              onChange={e => setNewColName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateColumn(); }}
              placeholder="Nova coluna (ex: Fornecedores, Não Fechou)..."
              className="text-xs h-9 flex-1"
            />
            <div className="flex gap-1">
              {PRESET_COLORS.slice(0, 5).map(c => (
                <button
                  key={c}
                  onClick={() => setNewColCor(c)}
                  className={cn("w-5 h-5 rounded-full border-2 transition-all", newColCor === c ? 'border-foreground scale-110' : 'border-transparent')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <Button size="sm" className="gap-1 text-xs h-9 rounded-xl" onClick={handleCreateColumn} disabled={!newColName.trim()}>
              <Plus size={14} /> Criar
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 flex gap-4 overflow-x-auto pb-6 no-scrollbar">
        {columns.map(col => {
          const { items, totalValue } = getColumnData(col.nome);
          return (
            <div
              key={col.id}
              className={cn(
                'min-w-[300px] w-80 flex flex-col rounded-2xl shrink-0 transition-all border border-border/50',
                dragOverCol === col.nome ? 'bg-primary/5 ring-2 ring-primary/20 scale-[1.01]' : 'bg-secondary/30'
              )}
              onDragOver={e => { e.preventDefault(); setDragOverCol(col.nome); }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={() => handleDrop(col.nome)}
            >
              <div className="px-4 py-4 border-b border-border/10 bg-card/30 rounded-t-2xl">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="text-[10px] font-bold border px-2 py-0.5 uppercase tracking-wide" style={{ backgroundColor: col.cor + '15', color: col.cor, borderColor: col.cor + '30' }}>
                    <span className="w-1.5 h-1.5 rounded-full mr-2" style={{ backgroundColor: col.cor }} />
                    {col.nome}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] font-bold h-5 px-2">{items.length}</Badge>
                </div>
                <p className="text-sm font-extrabold text-foreground/90">{totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
              </div>

              <div className="flex-1 px-3 py-3 space-y-3 overflow-y-auto scrollbar-thin">
                {items.map(c => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={() => setDragItem(c.id)}
                    className={cn(
                      'bg-card rounded-xl p-4 shadow-sm border border-border/50 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-primary/30 transition-all group',
                      dragItem === c.id ? 'opacity-30 scale-95' : 'opacity-100'
                    )}
                    onClick={() => handleOpenChat(c)}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate text-foreground group-hover:text-primary transition-colors">{c.nome}</p>
                          <p className="text-[10px] text-muted-foreground truncate font-medium mt-0.5">{c.telefone}</p>
                        </div>
                        {c.valor_conversa > 0 && (
                          <span className="text-[10px] font-bold text-success bg-success/10 px-2 py-1 rounded-lg shrink-0">
                            {c.valor_conversa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        )}
                      </div>
                      {c.ultima_mensagem && <p className="text-[11px] text-muted-foreground line-clamp-2 bg-secondary/30 p-2 rounded-lg italic">"{c.ultima_mensagem}"</p>}
                      {c.etiquetas && c.etiquetas.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {c.etiquetas.slice(0, 3).map(tag => (
                            <span key={tag.id} className="text-[9px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1" style={{ backgroundColor: tag.cor + '15', color: tag.cor, borderColor: tag.cor + '30' }}>
                              <span className="w-1 h-1 rounded-full" style={{ backgroundColor: tag.cor }} />
                              {tag.nome}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="pt-3 border-t border-border/50 flex items-center justify-between">
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
                          <CalendarClock size={12} className="text-muted-foreground/60" />
                          {formatWhatsAppDate(c.atualizado_em)}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); handleOpenChat(c); }} className="flex items-center gap-1 text-[10px] font-bold text-primary hover:opacity-80 transition-opacity">
                          <MessageCircle size={12} /> Chat
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="h-24 flex flex-col items-center justify-center border-2 border-dashed border-border/20 rounded-2xl text-muted-foreground/30">
                    <Users size={20} className="mb-1" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Vazio</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Side Chat Panel */}
      <Sheet open={activeChat !== null} onOpenChange={(val) => { if (!val) setActiveChat(null); }}>
        <SheetContent side="right" className="w-[400px] sm:w-[540px] p-0 flex flex-col h-full bg-background border-l-0 shadow-2xl">
          {activeChat && (
            <ChatArea 
              conversa={activeChat}
              mensagens={mensagens}
              respostas={respostas}
              onMensagemEnviada={(m) => setMensagens(prev => [...prev, m])}
              onConversaUpdate={(c) => {
                setActiveChat(c);
                setConversas(prev => prev.map(x => x.id === c.id ? c : x));
              }}
              onBack={() => setActiveChat(null)}
              onDelete={(id) => {
                setConversas(prev => prev.filter(x => x.id !== id));
                setActiveChat(null);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
