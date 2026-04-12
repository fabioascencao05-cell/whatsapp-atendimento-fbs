import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Image, Video, Clock, Trash2, ArrowLeft, X, CalendarClock, Power, PowerOff, Mic, Columns3 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Conversa, Mensagem, RespostaRapida } from '@/types/crm';
import { ImageLightbox } from './ImageLightbox';
import { AudioPlayer } from './AudioPlayer';
import { enviarMensagem, pausarBot, ativarBot, mudarKanban, deleteConversa, atualizarEtiquetasConversa, atualizarValor, agendarFollowUp } from '@/services/api';
import { useEtiquetas } from '@/contexts/EtiquetasContext';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface Props {
  conversa: Conversa;
  mensagens: Mensagem[];
  respostas: RespostaRapida[];
  onMensagemEnviada: (m: Mensagem) => void;
  onConversaUpdate: (c: Conversa) => void;
  onBack?: () => void;
  onOpenPanel?: () => void;
  onDelete?: (id: string) => void;
}

function formatWhatsAppTime(d: string) {
  return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function ChatArea({ conversa, mensagens, respostas, onMensagemEnviada, onConversaUpdate, onBack, onOpenPanel, onDelete }: Props) {
  const { etiquetas } = useEtiquetas();
  const [texto, setTexto] = useState('');
  const [showQuick, setShowQuick] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [attachments, setAttachments] = useState<{ name: string; type: string }[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensagens]);

  // Dynamic pipeline options
  const pipelineOptions = etiquetas.length > 0
    ? etiquetas.map(e => e.nome)
    : ['Novos', 'Em Negociação', 'Fechados', 'Finalizados'];

  const handleSend = async () => {
    if (!texto.trim() && attachments.length === 0) return;

    if (showSchedule && scheduleDate && scheduleTime) {
      const dt = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
      const autoTag = (document.getElementById('auto-kanban-chat') as HTMLSelectElement)?.value;
      
      try {
        await agendarFollowUp(conversa.id, {
          intervalo: 0, 
          template: texto.trim(),
          proximo_followup: dt,
          tag_automatica: autoTag || undefined
        });
        toast.success(`Agendado para ${scheduleDate} ${scheduleTime}`);
        setShowSchedule(false);
        setTexto('');
      } catch (err) {
        toast.error('Erro ao agendar');
      }
      return;
    }

    const msg = await enviarMensagem(conversa.id, texto.trim());
    onMensagemEnviada(msg);
    setTexto('');
    setShowQuick(false);
    setAttachments([]);
  };

  const handleToggleBot = async () => {
    if (conversa.status_bot) {
      await pausarBot(conversa.id);
      onConversaUpdate({ ...conversa, status_bot: false });
    } else {
      await ativarBot(conversa.id);
      onConversaUpdate({ ...conversa, status_bot: true });
    }
  };

  const handleKanbanChange = async (status: string) => {
    await mudarKanban(conversa.id, status);
    onConversaUpdate({ ...conversa, status_kanban: status });
  };

  const handleDelete = async () => {
    try {
      await deleteConversa(conversa.id);
      toast.success('Conversa movida para a lixeira');
      onDelete?.(conversa.id);
    } catch (err: any) {
      toast.error('Erro ao excluir: ' + (err.message || 'Desconhecido'));
      console.error(err);
    }
  };

  const handleInput = (val: string) => {
    setTexto(val);
    setShowQuick(val.startsWith('/'));
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) Array.from(files).forEach(f => setAttachments(prev => [...prev, { name: f.name, type: 'image' }]));
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) Array.from(files).forEach(f => setAttachments(prev => [...prev, { name: f.name, type: 'video' }]));
  };

  const removeAttachment = (idx: number) => setAttachments(prev => prev.filter((_, i) => i !== idx));

  const filteredQuick = respostas.filter(r => r.atalho.startsWith(texto));

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shadow-sm">
        {onBack && (
          <Button variant="ghost" size="icon" className="shrink-0 lg:hidden h-8 w-8" onClick={onBack}>
            <ArrowLeft size={18} />
          </Button>
        )}
        <div
          className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0 cursor-pointer overflow-hidden"
          onClick={onOpenPanel}
        >
          {conversa.profile_pic_url ? (
            <img src={conversa.profile_pic_url} alt={conversa.nome} className="w-full h-full object-cover" />
          ) : (
            conversa.nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpenPanel}>
          <p className="text-sm font-semibold truncate">{conversa.nome}</p>
          <p className="text-xs text-muted-foreground">{conversa.telefone}</p>
        </div>

        <div className="flex items-center gap-2">
           <div className="relative">
             <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">R$</span>
             <input
               type="number"
               defaultValue={conversa.valor_conversa || 0}
               onBlur={async (e) => {
                 const val = parseFloat(e.target.value) || 0;
                 await atualizarValor(conversa.id, val);
                 onConversaUpdate({ ...conversa, valor_conversa: val });
                 toast.success('Valor atualizado');
               }}
               className="w-20 pl-7 pr-2 py-1.5 text-xs font-bold border rounded-lg bg-secondary focus:ring-1 focus:ring-primary outline-none"
             />
           </div>

           <select
             value={conversa.status_kanban}
             onChange={e => handleKanbanChange(e.target.value)}
             className="text-xs border rounded-lg px-2.5 py-1.5 bg-secondary text-secondary-foreground font-medium focus:ring-2 focus:ring-ring focus:outline-none"
           >
             {['Novos', 'Em Negociação', 'Aguardando Pagamento', 'Pedido Aprovado', 'Pedido Entregue'].map(col => (
               <option key={col} value={col}>{col}</option>
             ))}
           </select>
        </div>

        <Button
          variant={conversa.status_bot ? 'default' : 'outline'}
          size="sm"
          onClick={handleToggleBot}
          className={cn(
            'gap-1.5 font-semibold text-xs rounded-lg transition-all',
            conversa.status_bot
              ? 'bg-success hover:bg-success/90 text-success-foreground shadow-sm'
              : 'border-destructive text-destructive hover:bg-destructive/5'
          )}
        >
          {conversa.status_bot ? <Power size={14} /> : <PowerOff size={14} />}
          <span className="hidden sm:inline">{conversa.status_bot ? 'Robô ON' : 'Robô OFF'}</span>
        </Button>

        <Button 
          variant="ghost" 
          size="icon" 
          className="text-destructive/70 hover:text-destructive hover:bg-destructive/10 h-8 w-8"
          onClick={() => {
            if (window.confirm(`Excluir permanentemente a conversa com ${conversa.nome}? Esta ação não pode ser desfeita.`)) {
              handleDelete();
            }
          }}
        >
          <Trash2 size={16} />
        </Button>
      </div>
      
      {/* Etiqueta Bar */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b bg-secondary/20 overflow-x-auto no-scrollbar">
          {etiquetas.map(e => {
            const isSelected = conversa.etiquetas?.some(et => String(et.id) === String(e.id));
            return (
              <button
                key={e.id}
                onClick={async () => {
                   const ids = isSelected 
                     ? (conversa.etiquetas?.filter(et => String(et.id) !== String(e.id)).map(et => String(et.id)) || [])
                     : ([...(conversa.etiquetas?.map(et => String(et.id)) || []), String(e.id)]);
                   await atualizarEtiquetasConversa(conversa.id, ids);
                   onConversaUpdate({ 
                     ...conversa, 
                     etiquetas: isSelected 
                       ? conversa.etiquetas?.filter(et => String(et.id) !== String(e.id)) 
                       : [...(conversa.etiquetas || []), e] 
                   });
                }}
                className={cn(
                  'text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap border transition-all flex items-center gap-1.5',
                  isSelected
                    ? 'ring-1 ring-offset-1 ring-primary/30 shadow-sm'
                    : 'bg-card/50 text-muted-foreground border-border/50 hover:border-primary/30'
                )}
                style={isSelected ? {
                  backgroundColor: e.cor + '25',
                  color: e.cor,
                  borderColor: e.cor + '40',
                } : undefined}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: e.cor }}
                />
                {e.nome}
              </button>
            );
          })}
          {etiquetas.length === 0 && (
            <span className="text-[10px] text-muted-foreground italic">Crie etiquetas nas Configurações para usá-las aqui</span>
          )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin chat-pattern">
        {mensagens.map(m => (
          <div key={m.id} className={cn('flex animate-fade-in', m.origem === 'cliente' ? 'justify-start' : 'justify-end')}>
            <div className={cn(
              'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
              m.origem === 'cliente'
                ? 'bg-bubble-client text-foreground rounded-tl-sm border border-border/50'
                : m.origem === 'bot'
                  ? 'bg-bubble-bot text-foreground rounded-tr-sm'
                  : 'bg-bubble-store text-foreground rounded-tr-sm'
            )}>
              {m.origem !== 'cliente' && (
                <span className={cn(
                  'text-[10px] font-semibold block mb-0.5',
                  m.origem === 'bot' ? 'text-success' : 'text-info'
                )}>
                  {m.origem === 'bot' ? '🤖 Bot' : '👤 Você'}
                </span>
              )}

              {/* Image */}
              {m.mediaType === 'image' && m.mediaUrl && (
                <img
                  src={`/api/proxy-media?url=${encodeURIComponent(m.mediaUrl)}`}
                  alt="Imagem"
                  loading="lazy"
                  onClick={() => setLightboxUrl(`/api/proxy-media?url=${encodeURIComponent(m.mediaUrl!)}`)}
                  className="rounded-lg max-w-full max-h-[240px] object-cover cursor-pointer hover:opacity-90 transition-opacity mb-1"
                />
              )}

              {/* Audio */}
              {m.mediaType === 'audio' && m.mediaUrl && (
                <AudioPlayer src={`/api/proxy-media?url=${encodeURIComponent(m.mediaUrl)}`} className="my-1" />
              )}

              {/* Video */}
              {m.mediaType === 'video' && m.mediaUrl && (
                <div className="mb-2 rounded-lg overflow-hidden border border-border/50 bg-black/5">
                   <video controls className="max-w-full h-auto">
                     <source src={`/api/proxy-media?url=${encodeURIComponent(m.mediaUrl)}`} type="video/mp4" />
                   </video>
                </div>
              )}

              {/* Document */}
              {m.mediaType === 'document' && m.mediaUrl && (
                <div className="mb-2 flex items-center gap-3 p-3 bg-secondary/30 rounded-xl border border-border/50 cursor-pointer hover:bg-secondary/50 transition-colors" onClick={() => window.open(`/api/proxy-media?url=${encodeURIComponent(m.mediaUrl!)}`, '_blank')}>
                   <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      <Paperclip size={20} />
                   </div>
                   <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{m.texto || 'Documento'}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">Abrir Arquivo</p>
                   </div>
                </div>
              )}

              {m.texto && <p className="leading-relaxed whitespace-pre-wrap">{m.texto}</p>}
              <p className="text-[10px] text-muted-foreground text-right mt-1">{formatWhatsAppTime(m.criado_em)}</p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Image Lightbox */}
      {lightboxUrl && <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

      {/* Quick replies popup */}
      {showQuick && filteredQuick.length > 0 && (
        <div className="border-t bg-card p-2 space-y-0.5 max-h-36 overflow-y-auto shadow-inner">
          {filteredQuick.map(r => (
            <button
              key={r.id}
              onClick={() => { setTexto(r.texto); setShowQuick(false); }}
              className="w-full text-left text-xs px-3 py-2.5 rounded-lg hover:bg-secondary transition-colors flex items-center gap-2"
            >
              <span className="font-mono text-primary font-semibold bg-primary/10 px-1.5 py-0.5 rounded">{r.atalho}</span>
              <span className="text-muted-foreground truncate">{r.texto.slice(0, 80)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="border-t bg-card px-4 py-2 flex gap-2 flex-wrap">
          {attachments.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-secondary rounded-lg px-2.5 py-1.5 text-xs">
              {a.type === 'image' ? <Image size={12} className="text-info" /> : <Video size={12} className="text-primary" />}
              <span className="truncate max-w-[120px]">{a.name}</span>
              <button onClick={() => removeAttachment(i)} className="text-muted-foreground hover:text-destructive">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showSchedule && (
        <div className="border-t bg-card px-4 py-3 flex flex-wrap items-center gap-3 animate-fade-in shadow-inner">
          <div className="flex items-center gap-2">
            <CalendarClock size={16} className="text-primary shrink-0" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase">Agendar:</span>
          </div>
          <Input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="h-8 text-xs w-32 bg-secondary border-0 rounded-lg px-2" />
          <Input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="h-8 text-xs w-24 bg-secondary border-0 rounded-lg px-2" />
          
          <div className="flex items-center gap-2 border-l pl-3 ml-1">
             <Columns3 size={14} className="text-success" />
             <select
               id="auto-kanban-chat"
               className="h-8 text-[10px] font-bold bg-success/10 text-success border-none rounded-lg px-2 focus:ring-1 focus:ring-success outline-none"
             >
               <option value="">Não mover etapa</option>
               {['Novos', 'Em Negociação', 'Aguardando Pagamento', 'Pedido Aprovado', 'Pedido Entregue'].map(col => (
                 <option key={col} value={col}>Mover para: {col}</option>
               ))}
             </select>
          </div>

          <div className="flex-1 flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="text-[10px] h-7 font-bold uppercase" onClick={() => setShowSchedule(false)}>Cancelar</Button>
            <Button size="sm" className="text-[10px] h-7 font-bold uppercase" onClick={handleSend}>Confirmar e Agendar</Button>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-2 px-3 py-3 border-t bg-card">
        <input ref={imageInputRef} type="file" accept="image/*" multiple hidden onChange={handleImageSelect} />
        <input ref={videoInputRef} type="file" accept="video/*" multiple hidden onChange={handleVideoSelect} />

        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-info shrink-0 h-9 w-9" onClick={() => imageInputRef.current?.click()}>
          <Image size={18} />
        </Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary shrink-0 h-9 w-9" onClick={() => videoInputRef.current?.click()}>
          <Video size={18} />
        </Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground shrink-0 h-9 w-9" onClick={() => document.getElementById('file-attach')?.click()}>
          <Paperclip size={18} />
        </Button>
        <input id="file-attach" type="file" hidden onChange={(e) => {
          const files = e.target.files;
          if (files) Array.from(files).forEach(f => setAttachments(prev => [...prev, { name: f.name, type: 'file' }]));
        }} />

        <Input
          value={texto}
          onChange={e => handleInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder='Mensagem... (use "/" para atalhos)'
          className="flex-1 bg-secondary border-0 h-10 rounded-xl"
        />

        <Button
          variant="ghost"
          size="icon"
          className={cn('shrink-0 h-9 w-9', showSchedule ? 'text-info bg-info/10' : 'text-muted-foreground hover:text-info')}
          onClick={() => setShowSchedule(!showSchedule)}
        >
          <Clock size={18} />
        </Button>

        <Button
          size="icon"
          onClick={handleSend}
          disabled={!texto.trim() && attachments.length === 0}
          className="bg-primary hover:bg-primary/90 shrink-0 h-10 w-10 rounded-xl shadow-sm disabled:opacity-40"
        >
          <Send size={16} className="text-primary-foreground" />
        </Button>
      </div>
    </div>
  );
}
