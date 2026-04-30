import { useState, useEffect, useMemo } from 'react';
import { Send, Users, Filter, CheckCircle2, AlertCircle, Loader2, MessageSquare, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { fetchConversas, fetchRespostas } from '@/services/api';
import type { Conversa, RespostaRapida } from '@/types/crm';
import { useEtiquetas } from '@/contexts/EtiquetasContext';
import { toast } from 'sonner';

interface Template {
  id: string;
  nome: string;
  categoria: string;
  texto: string;
}

const mockTemplates: Template[] = [
  { id: '1', nome: 'Boas-vindas', categoria: 'Geral', texto: 'Olá! Bem-vindo à FBS Camisetas! 👕 Como posso ajudar você hoje?' },
  { id: '2', nome: 'Orçamento', categoria: 'Vendas', texto: 'Oi, segue o orçamento solicitado. Aguardo sua aprovação!' },
  { id: '3', nome: 'Prazo de entrega', categoria: 'Produção', texto: 'Olá, informamos que seu pedido tem previsão de entrega para os próximos dias. Qualquer dúvida estamos à disposição!' },
  { id: '4', nome: 'Pagamento PIX', categoria: 'Financeiro', texto: 'Segue nossa chave PIX para pagamento:\n\n🏦 Chave: fbs@camisetas.com\n\nApós o pagamento, envie o comprovante aqui.' },
  { id: '5', nome: 'Pedido pronto', categoria: 'Produção', texto: 'Ótima notícia! 🎉 Seu pedido está pronto! Podemos combinar a entrega ou retirada. O que prefere?' },
  { id: '6', nome: 'Follow-up', categoria: 'Vendas', texto: 'Olá! Tudo bem? Passando para verificar se ainda tem interesse nas nossas camisetas. Posso te ajudar com alguma dúvida? 😊' },
  { id: '7', nome: 'Promoção', categoria: 'Vendas', texto: '🔥 Promoção especial FBS Camisetas! Aproveite condições exclusivas por tempo limitado. Entre em contato agora!' },
];

export default function BroadcastPage() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [respostas, setRespostas] = useState<RespostaRapida[]>([]);
  const { etiquetas } = useEtiquetas();
  const [selectedPipeline, setSelectedPipeline] = useState('Todos');
  const [selectedTag, setSelectedTag] = useState('Todas');
  const [mensagem, setMensagem] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [modoDisparo, setModoDisparo] = useState<'filtros' | 'manual'>('filtros');
  const [numerosManuais, setNumerosManuais] = useState('');

  useEffect(() => {
    fetchConversas().then(setConversas);
    fetchRespostas().then(setRespostas);
  }, []);

  const alvos = useMemo(() => {
    let list = conversas;
    if (selectedPipeline !== 'Todos') {
      list = list.filter(c => c.status_kanban === selectedPipeline);
    }
    if (selectedTag !== 'Todas') {
      list = list.filter(c => c.etiquetas?.some(e => e.nome === selectedTag));
    }
    return list;
  }, [conversas, selectedPipeline, selectedTag]);

  const handleSend = async () => {
    let idsParaEnvio: string[] = [];

    if (modoDisparo === 'filtros') {
      if (alvos.length === 0) return toast.error('Nenhum cliente selecionado');
      idsParaEnvio = alvos.map(a => a.id);
    } else {
      // Manual mode
      const parsedNumbers = numerosManuais
        .split(/[\n,;]+/)
        .map(n => n.replace(/\D/g, ''))
        .filter(n => n.length >= 10);
      
      if (parsedNumbers.length === 0) return toast.error('Nenhum número válido encontrado na lista');
      idsParaEnvio = parsedNumbers.map(n => n.startsWith('55') ? n : `55${n}`);
    }

    if (!mensagem.trim()) return toast.error('Digite a mensagem');
    if (!confirm(`Confirmar disparo para ${idsParaEnvio.length} número(s)? Esta ação enviará mensagens reais.`)) return;

    setIsSending(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsParaEnvio, texto: mensagem }),
      });
      const data = await res.json();
      setSendResult(data.message);
      toast.success(data.message);
      setMensagem('');
      if (modoDisparo === 'manual') setNumerosManuais('');
    } catch (err) {
      toast.error('Erro ao iniciar disparo');
    } finally {
      setIsSending(false);
    }
  };

  // Todos os templates disponíveis (templates + respostas rápidas)
  const todosTemplates = [
    ...mockTemplates,
    ...respostas.map(r => ({ id: `rr-${r.id}`, nome: r.atalho, categoria: 'Resposta Rápida', texto: r.texto }))
  ];

  return (
    <div className="flex flex-col h-full bg-background p-6 overflow-y-auto scrollbar-thin">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Send className="text-primary" /> Central de Transmissão
          </h1>
          <p className="text-sm text-muted-foreground">Envie mensagens em massa para seus clientes com segurança.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Configuração */}
          <div className="md:col-span-2 space-y-4">
            <div className="bg-card rounded-2xl border p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold mb-4">
                <Filter size={16} className="text-primary" /> 1. Definir Público do Disparo
              </div>

              {/* Toggle Mode */}
              <div className="flex bg-secondary p-1 rounded-xl w-fit mb-4">
                <button
                  onClick={() => setModoDisparo('filtros')}
                  className={cn("px-4 py-1.5 text-xs font-bold rounded-lg transition-all", modoDisparo === 'filtros' ? "bg-card shadow-sm text-primary" : "text-muted-foreground")}
                >
                  Usar Filtros (Base)
                </button>
                <button
                  onClick={() => setModoDisparo('manual')}
                  className={cn("px-4 py-1.5 text-xs font-bold rounded-lg transition-all", modoDisparo === 'manual' ? "bg-card shadow-sm text-primary" : "text-muted-foreground")}
                >
                  Colar Lista (Manual)
                </button>
              </div>
              
              {modoDisparo === 'filtros' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase">Filtro por Etapa</label>
                    <select
                      value={selectedPipeline}
                      onChange={e => setSelectedPipeline(e.target.value)}
                      className="w-full text-xs border rounded-xl px-3 py-2.5 bg-secondary text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                    >
                      <option value="Todos">Todas as etapas do funil</option>
                      {['Novos', 'Em Negociação', 'Aguardando Pagamento', 'Pedido Aprovado', 'Pedido Entregue'].map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase">Filtro por Etiqueta</label>
                    <select
                      value={selectedTag}
                      onChange={e => setSelectedTag(e.target.value)}
                      className="w-full text-xs border rounded-xl px-3 py-2.5 bg-secondary text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                    >
                      <option value="Todas">Todas as etiquetas</option>
                      {etiquetas.map(e => (
                        <option key={e.id} value={e.nome}>{e.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase">Cole os números aqui (um por linha ou separados por vírgula)</label>
                  <Textarea
                    placeholder="Ex: 11999999999&#10;11988888888"
                    value={numerosManuais}
                    onChange={(e) => setNumerosManuais(e.target.value)}
                    className="min-h-[100px] text-sm bg-secondary border-0 rounded-xl resize-none font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">O sistema irá extrair apenas os números automaticamente e adicionar o DDI 55.</p>
                </div>
              )}

              <div className="pt-4 space-y-4 border-t border-border/50">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                     <MessageSquare size={16} /> 2. O que vamos enviar?
                   </div>
                   <div className="flex gap-2 items-center">
                    <Tag size={12} className="text-primary" />
                    <select
                      onChange={e => {
                        const t = todosTemplates.find(tp => tp.id === e.target.value);
                        if (t) setMensagem(t.texto);
                        e.target.value = '';
                      }}
                      className="text-[10px] font-bold bg-primary/10 text-primary border-none rounded-lg px-2 py-1 cursor-pointer hover:bg-primary/20 transition-all focus:outline-none"
                    >
                      <option value="">PUXAR MENSAGEM PRONTA...</option>
                      {mockTemplates.length > 0 && (
                        <optgroup label="📋 Templates">
                          {mockTemplates.map(t => (
                            <option key={t.id} value={t.id}>{t.nome} ({t.categoria})</option>
                          ))}
                        </optgroup>
                      )}
                      {respostas.length > 0 && (
                        <optgroup label="⚡ Respostas Rápidas">
                          {respostas.map(r => (
                            <option key={`rr-${r.id}`} value={`rr-${r.id}`}>{r.atalho}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                   </div>
                </div>
                
                <Textarea
                  placeholder="Olá! Temos uma oferta especial para você hoje..."
                  className="min-h-[160px] text-sm bg-secondary border-0 rounded-2xl resize-none p-4 focus:ring-2 focus:ring-primary transition-all"
                  value={mensagem}
                  onChange={e => setMensagem(e.target.value)}
                />

                {sendResult && (
                  <div className="bg-success/10 text-success border border-success/20 rounded-xl p-3 text-xs font-medium flex items-center gap-2">
                    <CheckCircle2 size={14} />
                    {sendResult}
                  </div>
                )}

                <div className="bg-secondary/30 rounded-xl p-3 flex gap-3 text-[11px] text-muted-foreground">
                   <AlertCircle size={14} className="shrink-0 text-amber-500" />
                   <p>O sistema enviará mensagens uma por uma com intervalos aleatórios de 3 a 5 segundos para proteger seu número.</p>
                </div>

                <Button 
                  className="w-full h-12 rounded-2xl text-sm font-bold gap-2 shadow-lg shadow-primary/20"
                  disabled={isSending || (modoDisparo === 'filtros' && alvos.length === 0) || (modoDisparo === 'manual' && numerosManuais.trim().length === 0)}
                  onClick={handleSend}
                >
                  {isSending ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                  {isSending ? 'Enviando disparo...' : `Disparar Mensagens`}
                </Button>
              </div>
            </div>
          </div>

          {/* Resumo lateral */}
          <div className="space-y-4">
             <div className="bg-card rounded-2xl border p-6 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold mb-4">
                  <Users size={16} className="text-primary" /> Resumo do Grupo
                </div>
                <div className="space-y-4">
                   <div className="flex justify-between items-center text-xs">
                     <span className="text-muted-foreground">Público Alvo:</span>
                     <Badge variant="secondary" className="font-bold">{modoDisparo === 'filtros' ? `${alvos.length} clientes base` : 'Lista Manual'}</Badge>
                   </div>
                   {modoDisparo === 'filtros' && (
                     <>
                       <div className="flex justify-between items-center text-xs">
                         <span className="text-muted-foreground">Etapa:</span>
                         <Badge variant="secondary" className="font-bold">{selectedPipeline}</Badge>
                       </div>
                       <div className="flex justify-between items-center text-xs">
                         <span className="text-muted-foreground">Etiqueta:</span>
                         <Badge variant="secondary" className="font-bold">{selectedTag}</Badge>
                       </div>
                     </>
                   )}
                   <div className="flex justify-between items-center text-xs">
                     <span className="text-muted-foreground">Risco de Ban:</span>
                     <span className="text-success font-bold flex items-center gap-1">Baixo <CheckCircle2 size={10} /></span>
                   </div>
                </div>
             </div>

             <div className="bg-primary/5 rounded-2xl border border-primary/10 p-5 space-y-3">
                <h4 className="text-xs font-bold text-primary flex items-center gap-1.5 uppercase tracking-wider">
                  Dica de Ouro
                </h4>
                <p className="text-[11px] leading-relaxed text-foreground/80">
                  "Use o Envio em Massa para avisar sobre promoções rápidas ou novidades. Evite mandar mensagens muito longas e tente sempre ser o mais pessoal possível."
                </p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
