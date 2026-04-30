import { useState, useEffect } from 'react';
import { User, Phone, Tag, Plus, X, Columns3, ArrowLeft, Edit2, Check, Bot, BotOff, Zap, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Conversa, RespostaRapida } from '@/types/crm';
import { salvarTags, mudarKanban } from '@/services/api';
import { useEtiquetas } from '@/contexts/EtiquetasContext';
import { toast } from 'sonner';

interface Props {
  conversa: Conversa;
  respostas: RespostaRapida[];
  onRespostasUpdate?: (r: RespostaRapida[]) => void;
  onConversaUpdate?: (c: Conversa) => void;
  onBack?: () => void;
}

export function ClientPanel({ conversa, respostas, onConversaUpdate, onBack }: Props) {
  const { etiquetas: etiquetasDisponiveis } = useEtiquetas();
  const [newTag, setNewTag] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);

  // Edição de nome
  const [editingNome, setEditingNome] = useState(false);
  const [nomeEdit, setNomeEdit] = useState(conversa.nome);

  // Edição de telefone
  const [editingTelefone, setEditingTelefone] = useState(false);
  const [telefoneEdit, setTelefoneEdit] = useState(conversa.telefone);

  const currentTags = conversa.tags ? conversa.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

  const handleSaveNome = async () => {
    if (!nomeEdit.trim()) return;
    try {
      await fetch(`/api/conversas/${conversa.id}/editar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeEdit.trim() })
      });
      onConversaUpdate?.({ ...conversa, nome: nomeEdit.trim() });
      toast.success('Nome atualizado');
      setEditingNome(false);
    } catch { toast.error('Erro ao salvar nome'); }
  };

  const handleSaveTelefone = async () => {
    if (!telefoneEdit.trim()) return;
    try {
      await fetch(`/api/conversas/${conversa.id}/editar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone: telefoneEdit.trim() })
      });
      onConversaUpdate?.({ ...conversa, telefone: telefoneEdit.trim() });
      toast.success('Telefone atualizado');
      setEditingTelefone(false);
    } catch { toast.error('Erro ao salvar telefone'); }
  };

  const handleAddTag = async () => {
    const tag = newTag.trim();
    if (!tag || currentTags.includes(tag)) return;
    const updated = [...currentTags, tag].join(',');
    await salvarTags(conversa.id, updated);
    onConversaUpdate?.({ ...conversa, tags: updated });
    setNewTag('');
    setShowTagInput(false);
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const updated = currentTags.filter(t => t !== tagToRemove).join(',');
    await salvarTags(conversa.id, updated);
    onConversaUpdate?.({ ...conversa, tags: updated });
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); }
    if (e.key === 'Escape') { setShowTagInput(false); setNewTag(''); }
  };

  const handleKanbanChange = async (status: string) => {
    await mudarKanban(conversa.id, status);
    onConversaUpdate?.({ ...conversa, status_kanban: status });
  };

  const [pipelineOptions, setPipelineOptions] = useState<string[]>(['Novos']);

  useEffect(() => {
    fetch('/api/pipeline').then(r => r.json()).then((cols: any[]) => {
      if (cols.length > 0) setPipelineOptions(cols.map(c => c.nome));
    }).catch(() => {});
  }, []);

  // Funil automático
  const [funilOpen, setFunilOpen] = useState(false);
  const [funilAtivo, setFunilAtivo] = useState<string | null>((conversa as any).funil_tipo || null);
  const [funilLoading, setFunilLoading] = useState(false);

  const FUNIL_OPCOES = [
    { tipo: 'nao_respondeu', label: '🔴 Não respondeu', desc: '24h → 48h → 72h' },
    { tipo: 'orcamento_sumiu', label: '🟡 Recebeu orçamento e sumiu', desc: '48h → 96h' },
    { tipo: 'recorrente', label: '🟢 Cliente recorrente', desc: 'A cada 90 dias' },
  ];

  const ativarFunil = async (tipo: string) => {
    setFunilLoading(true);
    try {
      await fetch(`/api/conversas/${conversa.id}/entrar-funil`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo }),
      });
      setFunilAtivo(tipo);
      setFunilOpen(false);
      toast.success('✅ Lead inserido no funil automático!');
    } catch { toast.error('Erro ao ativar funil'); }
    setFunilLoading(false);
  };

  const sairFunil = async () => {
    setFunilLoading(true);
    try {
      await fetch(`/api/conversas/${conversa.id}/sair-funil`, { method: 'POST' });
      setFunilAtivo(null);
      toast.success('Funil desativado');
    } catch { toast.error('Erro ao desativar funil'); }
    setFunilLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-card border-l">
      <div className="px-4 py-3 border-b flex items-center gap-2">
        {onBack && (
          <Button variant="ghost" size="icon" className="shrink-0 lg:hidden h-8 w-8" onClick={onBack}>
            <ArrowLeft size={18} />
          </Button>
        )}
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <User size={14} className="text-primary" /> Dados do Cliente
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {/* Avatar & name */}
        <div className="text-center">
          {conversa.profile_pic_url ? (
            <img
              src={conversa.profile_pic_url}
              alt={conversa.nome}
              className="w-16 h-16 rounded-full mx-auto mb-2 ring-2 ring-primary/20 object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-bold mx-auto mb-2 ring-2 ring-primary/20">
              {conversa.nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
          )}

          {/* Nome editável */}
          {editingNome ? (
            <div className="flex items-center gap-1 justify-center mt-1">
              <Input
                value={nomeEdit}
                onChange={e => setNomeEdit(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveNome(); if (e.key === 'Escape') setEditingNome(false); }}
                className="text-xs h-7 w-36 text-center"
                autoFocus
              />
              <Button size="icon" variant="ghost" className="h-6 w-6 text-success" onClick={handleSaveNome}>
                <Check size={12} />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => { setEditingNome(false); setNomeEdit(conversa.nome); }}>
                <X size={12} />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1">
              <h3 className="font-semibold text-sm">{conversa.nome}</h3>
              <button onClick={() => { setEditingNome(true); setNomeEdit(conversa.nome); }} className="text-muted-foreground hover:text-primary transition-colors">
                <Edit2 size={11} />
              </button>
            </div>
          )}

          {/* Telefone editável */}
          {editingTelefone ? (
            <div className="flex items-center gap-1 justify-center mt-1">
              <Input
                value={telefoneEdit}
                onChange={e => setTelefoneEdit(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveTelefone(); if (e.key === 'Escape') setEditingTelefone(false); }}
                className="text-xs h-7 w-36 text-center"
                autoFocus
              />
              <Button size="icon" variant="ghost" className="h-6 w-6 text-success" onClick={handleSaveTelefone}>
                <Check size={12} />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => { setEditingTelefone(false); setTelefoneEdit(conversa.telefone); }}>
                <X size={12} />
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
              <Phone size={12} /> {conversa.telefone}
              <button onClick={() => { setEditingTelefone(true); setTelefoneEdit(conversa.telefone); }} className="text-muted-foreground hover:text-primary transition-colors">
                <Edit2 size={11} />
              </button>
            </p>
          )}
        </div>

        {/* Editable Tags */}
        <div className="bg-secondary/50 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <Tag size={12} /> Etiquetas
            </label>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
              onClick={() => setShowTagInput(!showTagInput)}
            >
              <Plus size={14} />
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {currentTags.length > 0 ? currentTags.map(t => {
              const etiqueta = etiquetasDisponiveis.find(e => e.nome === t);
              return (
                <Badge
                  key={t}
                  variant="outline"
                  className="text-xs font-medium gap-1 pr-1 border"
                  style={etiqueta ? {
                    backgroundColor: etiqueta.cor + '15',
                    color: etiqueta.cor,
                    borderColor: etiqueta.cor + '30',
                  } : undefined}
                >
                  {etiqueta && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: etiqueta.cor }} />}
                  {t}
                  <button
                    onClick={() => handleRemoveTag(t)}
                    className="hover:bg-foreground/10 rounded-full p-0.5 transition-colors"
                  >
                    <X size={10} />
                  </button>
                </Badge>
              );
            }) : (
              <span className="text-xs text-muted-foreground">Sem etiquetas</span>
            )}
          </div>

          {showTagInput && (
            <div className="space-y-2 animate-fade-in">
              <div className="flex gap-1.5">
                <Input
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder="Nova etiqueta..."
                  className="text-xs h-8 bg-card border-border flex-1"
                  autoFocus
                />
                <Button size="sm" className="h-8 px-2.5 text-xs" onClick={handleAddTag} disabled={!newTag.trim()}>
                  <Plus size={12} />
                </Button>
              </div>
              {etiquetasDisponiveis.filter(e => !currentTags.includes(e.nome)).length > 0 && (
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground font-medium">Sugestões:</span>
                  <div className="flex flex-wrap gap-1">
                    {etiquetasDisponiveis
                      .filter(e => !currentTags.includes(e.nome))
                      .filter(e => !newTag || e.nome.toLowerCase().includes(newTag.toLowerCase()))
                      .map(e => (
                        <button
                          key={e.id}
                          onClick={async () => {
                            const updated = [...currentTags, e.nome].join(',');
                            await salvarTags(conversa.id, updated);
                            onConversaUpdate?.({ ...conversa, tags: updated });
                            setNewTag('');
                          }}
                          className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border transition-all hover:scale-105 cursor-pointer"
                          style={{
                            backgroundColor: e.cor + '15',
                            color: e.cor,
                            borderColor: e.cor + '30',
                          }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: e.cor }} />
                          {e.nome}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pipeline / Status Kanban */}
        <div className="bg-secondary/50 rounded-xl p-3 space-y-2">
          <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <Columns3 size={12} /> Pipeline
          </label>
          <select
            value={conversa.status_kanban}
            onChange={e => handleKanbanChange(e.target.value)}
            className="w-full text-xs border rounded-lg px-2.5 py-2 bg-card text-foreground focus:ring-2 focus:ring-ring focus:outline-none font-medium"
          >
            {pipelineOptions.map(col => <option key={col} value={col}>{col}</option>)}
          </select>
        </div>

        {/* ⚡ Funil Automático */}
        <div className="bg-secondary/50 rounded-xl p-3 space-y-2">
          <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <Zap size={12} className="text-primary" /> Follow-Up Automático
          </label>

          {funilAtivo ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="text-xs font-semibold bg-primary/15 text-primary border border-primary/30 flex-1 justify-center py-1">
                  {FUNIL_OPCOES.find(f => f.tipo === funilAtivo)?.label || funilAtivo}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">
                {FUNIL_OPCOES.find(f => f.tipo === funilAtivo)?.desc}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={sairFunil}
                disabled={funilLoading}
              >
                <X size={12} className="mr-1" /> Remover do funil
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => setFunilOpen(!funilOpen)}
                disabled={funilLoading}
              >
                <Zap size={13} /> Ativar Follow-Up <ChevronDown size={12} />
              </Button>
              {funilOpen && (
                <div className="absolute top-9 left-0 right-0 z-20 bg-card border border-border rounded-xl shadow-lg overflow-hidden animate-in slide-in-from-top-2">
                  {FUNIL_OPCOES.map(op => (
                    <button
                      key={op.tipo}
                      onClick={() => ativarFunil(op.tipo)}
                      className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-secondary/60 transition-colors border-b border-border/30 last:border-0"
                    >
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-foreground">{op.label}</p>
                        <p className="text-[10px] text-muted-foreground">{op.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status Bot */}
        <div className="bg-secondary/50 rounded-xl p-3 space-y-2">
          <label className="text-xs font-semibold text-muted-foreground">Status da Deise</label>
          <div className="flex items-center gap-2">
            <Badge className={cn(
              'text-xs font-medium',
              conversa.status_bot ? 'bg-success/10 text-success border border-success/20' : 'bg-destructive/10 text-destructive border border-destructive/20'
            )}>
              {conversa.status_bot ? '🟢 Deise Ativa' : '🔴 Deise Pausada'}
            </Badge>
          </div>
          {conversa.assumido_por && (
            <p className="text-[10px] text-muted-foreground">Assumido por: <span className="font-bold text-foreground">{conversa.assumido_por}</span></p>
          )}
        </div>

        {/* Quick Replies preview */}
        {respostas.length > 0 && (
          <div className="bg-secondary/50 rounded-xl p-3 space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Respostas Rápidas</label>
            <div className="space-y-1">
              {respostas.slice(0, 4).map(r => (
                <div key={r.id} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-primary font-semibold bg-primary/10 px-1.5 py-0.5 rounded text-[10px]">{r.atalho}</span>
                  <span className="text-muted-foreground truncate">{r.texto.slice(0, 40)}...</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
