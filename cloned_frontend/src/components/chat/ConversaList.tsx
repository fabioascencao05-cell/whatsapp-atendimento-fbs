import { useState, useMemo } from 'react';
import { Search, Tag, X, Filter, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Conversa } from '@/types/crm';
import { useEtiquetas } from '@/contexts/EtiquetasContext';
import { syncConversas } from '@/services/api';
import { toast } from 'sonner';

interface Props {
  conversas: Conversa[];
  activeId: string | null;
  onSelect: (c: Conversa) => void;
  onSync?: () => void;
}

function formatWhatsAppDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return date.toLocaleDateString('pt-BR', { weekday: 'short' });
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const tabs = ['Todos', 'Novos', 'Negociação', 'Pagamento', 'Fechados'] as const;

export function ConversaList({ conversas, activeId, onSelect, onSync }: Props) {
  const { etiquetas: etiquetasDisponiveis } = useEtiquetas();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<typeof tabs[number]>('Todos');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await syncConversas();
      toast.success(res.message);
      if (onSync) onSync();
    } catch (err) {
      toast.error('Erro na sincronização');
    } finally {
      setIsSyncing(false);
    }
  };

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    conversas.forEach(c => {
      if (c.etiquetas && Array.isArray(c.etiquetas)) {
        c.etiquetas.forEach(et => tagSet.add(et.nome));
      }
    });
    return Array.from(tagSet).sort();
  }, [conversas]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const filtered = useMemo(() => {
    let list = conversas;
    // Filtros de Pipeline
    if (tab === 'Novos') {
      list = list.filter(c => c.status_kanban === 'Novos');
    } else if (tab === 'Negociação') {
      list = list.filter(c => c.status_kanban === 'Em Negociação');
    } else if (tab === 'Pagamento') {
      list = list.filter(c => c.status_kanban === 'Aguardando Pagamento');
    } else if (tab === 'Fechados') {
      list = list.filter(c => ['Pedido Aprovado', 'Pedido Entregue', 'Finalizados'].includes(c.status_kanban));
    }
    
    // Pesquisa por texto
    if (search) {
      list = list.filter(c => 
        c.nome.toLowerCase().includes(search.toLowerCase()) || 
        c.telefone.includes(search)
      );
    }
    
    // Filtro por Etiquetas (Tags)
    if (selectedTags.length > 0) {
      list = list.filter(c => {
        const cTagNames = c.etiquetas ? c.etiquetas.map(et => et.nome) : [];
        return selectedTags.some(st => cTagNames.includes(st));
      });
    }
    return list;
  }, [conversas, tab, search, selectedTags]);

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground tracking-tight">Conversas</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-7 w-8 p-0 rounded-lg", isSyncing && "animate-spin text-primary")}
              onClick={handleSync}
              disabled={isSyncing}
              title="Sincronizar conversas e fotos"
            >
              <RefreshCw size={14} />
            </Button>
          </div>
        </div>

        {/* BARRA DE ETIQUETAS NO TOPO */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none no-scrollbar">
          <button
            onClick={() => setSelectedTags([])}
            className={cn(
              "px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all border",
              selectedTags.length === 0 
                ? "bg-primary text-primary-foreground border-primary shadow-sm" 
                : "bg-secondary text-muted-foreground border-transparent hover:bg-secondary/80"
            )}
          >
            Todos
          </button>
          {allTags.map(tag => {
            const isSelected = selectedTags.includes(tag);
            const label = etiquetasDisponiveis.find(e => e.nome === tag);
            const color = label?.cor || 'var(--primary)';
            
            return (
              <button
                key={tag}
                onClick={() => {
                  if (isSelected) {
                    setSelectedTags(prev => prev.filter(t => t !== tag));
                  } else {
                    setSelectedTags(prev => [...prev, tag]);
                  }
                }}
                className={cn(
                  "px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all border flex items-center gap-1.5",
                  isSelected 
                    ? "shadow-sm" 
                    : "bg-secondary text-muted-foreground border-transparent hover:bg-secondary/80"
                )}
                style={isSelected ? { 
                  backgroundColor: color, 
                  color: 'white',
                  borderColor: color 
                } : {}}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isSelected ? 'white' : color }} />
                {tag}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="pl-9 h-9 text-sm bg-secondary border-0 rounded-xl"
          />
        </div>

        <div className="flex gap-1 bg-secondary rounded-xl p-1">
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 text-xs font-medium py-1.5 rounded-lg transition-all',
                tab === t
                  ? 'bg-card text-foreground shadow-sm font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {filtered.map(c => {
          const tags = c.etiquetas || [];
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className={cn(
                'w-full flex items-start gap-3 px-4 py-3.5 text-left transition-all border-b border-border/30',
                activeId === c.id
                  ? 'bg-secondary'
                  : 'hover:bg-secondary/50 bg-card'
              )}
            >
              <div className="relative shrink-0">
                {c.profile_pic_url ? (
                  <img src={c.profile_pic_url} alt={c.nome} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold',
                    activeId === c.id
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'bg-primary/10 text-primary'
                  )}>
                    {getInitials(c.nome)}
                  </div>
                )}
                {!c.status_bot && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-destructive flex items-center justify-center ring-2 ring-card">
                    <span className="text-[7px] text-destructive-foreground font-bold">⏸</span>
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold truncate text-foreground">{c.nome}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{formatWhatsAppDate(c.atualizado_em)}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{c.ultima_mensagem}</p>
                {tags.length > 0 && (
                  <div className="flex items-center gap-1 mt-2 flex-wrap">
                    {tags.slice(0, 3).map(tag => (
                      <span
                        key={tag.id}
                        className="text-[9px] font-semibold px-2 py-0.5 rounded-full border inline-flex items-center gap-1"
                        style={{
                          backgroundColor: tag.cor + '15',
                          color: tag.cor,
                          borderColor: tag.cor + '30',
                        }}
                      >
                        <span className="w-1 h-1 rounded-full" style={{ backgroundColor: tag.cor }} />
                        {tag.nome}
                      </span>
                    ))}
                    {tags.length > 3 && (
                      <span className="text-[9px] text-muted-foreground font-medium">+{tags.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
              {c.unreadCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0 mt-1 shadow-md">
                  {c.unreadCount}
                </span>
              )}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-xs">
            Nenhuma conversa encontrada
          </div>
        )}
      </div>
    </div>
  );
}
