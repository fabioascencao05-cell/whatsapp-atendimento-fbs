import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ConversaList } from '@/components/chat/ConversaList';
import { ChatArea } from '@/components/chat/ChatArea';
import { ClientPanel } from '@/components/chat/ClientPanel';
import { fetchConversas, fetchMensagens, fetchRespostas } from '@/services/api';
import type { Conversa, Mensagem, RespostaRapida } from '@/types/crm';
import { MessageSquare } from 'lucide-react';

export default function ChatPage() {
  const [searchParams] = useSearchParams();
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [active, setActive] = useState<Conversa | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [respostas, setRespostas] = useState<RespostaRapida[]>([]);
  const [mobileView, setMobileView] = useState<'list' | 'chat' | 'panel'>('list');
  const [showPanel, setShowPanel] = useState(true);

  useEffect(() => {
    const load = () => {
      fetchConversas().then(setConversas);
      if (active) {
        fetchMensagens(active.id).then(data => setMensagens(data.mensagens));
      }
    };

    // Initial load
    fetchConversas().then(data => {
      setConversas(data);
      const chatId = searchParams.get('chat');
      if (chatId) {
        const found = data.find(c => c.id === chatId);
        if (found) handleSelect(found);
      }
    });
    fetchRespostas().then(setRespostas);

    // Fast Polling (3s) for real-time feel
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [active?.id, searchParams]);

  const handleSelect = async (c: Conversa) => {
    setActive(c);
    const data = await fetchMensagens(c.id);
    setMensagens(data.mensagens);
    setMobileView('chat');
  };

  const handleMensagemEnviada = (m: Mensagem) => {
    setMensagens(prev => [...prev, m]);
  };

  const handleConversaUpdate = (c: Conversa) => {
    setActive(c);
    setConversas(prev => prev.map(x => x.id === c.id ? c : x));
  };

  const handleRespostasUpdate = (r: RespostaRapida[]) => {
    setRespostas(r);
  };

  const handleDelete = (id: string) => {
    setConversas(prev => prev.filter(c => c.id !== id));
    setActive(null);
    setMobileView('list');
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Col 1: Lista de conversas */}
      <div className={cn(
        'w-80 shrink-0 border-r flex flex-col bg-card',
        'max-lg:w-full',
        mobileView !== 'list' && 'max-lg:hidden'
      )}>
        <ConversaList conversas={conversas} activeId={active?.id ?? null} onSelect={handleSelect} />
      </div>

      {/* Col 2: Chat */}
      <div className={cn(
        'flex-1 min-w-0 flex flex-col bg-background overflow-hidden',
        mobileView !== 'chat' && 'max-lg:hidden'
      )}>
        {active ? (
          <ChatArea
            conversa={active}
            mensagens={mensagens}
            respostas={respostas}
            onMensagemEnviada={handleMensagemEnviada}
            onConversaUpdate={handleConversaUpdate}
            onBack={() => setMobileView('list')}
            onOpenPanel={() => {
              setShowPanel(prev => !prev);
              setMobileView('panel');
            }}
            onDelete={handleDelete}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
              <MessageSquare className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-semibold italic text-center px-4">FBS Camisetas — Selecione uma conversa para atender</p>
          </div>
        )}
      </div>

      {/* Col 3: Painel do cliente */}
      {showPanel && active && (
        <div className={cn(
          'w-72 shrink-0 border-l flex flex-col bg-card',
          'max-lg:w-full',
          mobileView === 'panel' ? 'max-lg:flex' : 'max-lg:hidden',
          'hidden lg:flex'
        )}>
          <ClientPanel
            conversa={active}
            respostas={respostas}
            onConversaUpdate={handleConversaUpdate}
            onBack={() => setMobileView('chat')}
          />
        </div>
      )}
    </div>
  );
}
