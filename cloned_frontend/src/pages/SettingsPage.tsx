import { useState, useEffect, useRef } from 'react';
import { Settings, Zap, FileText, Plus, Save, Trash2, Edit2, X, Check, MessageSquare, Tag, ImageIcon, Upload } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { fetchRespostas, salvarResposta, deletarResposta } from '@/services/api';
import type { RespostaRapida } from '@/types/crm';
import { useEtiquetas } from '@/contexts/EtiquetasContext';
import { useLogo } from '@/contexts/LogoContext';

interface Template {
  id: string;
  nome: string;
  categoria: string;
  texto: string;
}

const mockTemplates: Template[] = [
  { id: '1', nome: 'Boas-vindas', categoria: 'Geral', texto: 'Olá {{nome}}! Bem-vindo à FBS Camisetas! 👕 Como posso ajudar você hoje?' },
  { id: '2', nome: 'Orçamento', categoria: 'Vendas', texto: 'Oi {{nome}}, segue o orçamento solicitado:\n\n📦 Quantidade: {{qtd}}\n👕 Modelo: {{modelo}}\n💰 Valor: {{valor}}\n\nAguardo sua aprovação!' },
  { id: '3', nome: 'Prazo de entrega', categoria: 'Produção', texto: 'Olá {{nome}}, informamos que seu pedido {{pedido}} tem previsão de entrega para {{data}}. Qualquer dúvida estamos à disposição!' },
  { id: '4', nome: 'Pagamento PIX', categoria: 'Financeiro', texto: 'Segue nossa chave PIX para pagamento:\n\n🏦 Chave: fbs@camisetas.com\n💰 Valor: {{valor}}\n\nApós o pagamento, envie o comprovante aqui.' },
  { id: '5', nome: 'Pedido pronto', categoria: 'Produção', texto: 'Ótima notícia, {{nome}}! 🎉 Seu pedido {{pedido}} está pronto! Podemos combinar a entrega ou retirada. O que prefere?' },
];

// Templates prontos de Follow-up
const FOLLOWUP_TEMPLATES = [
  {
    grupo: 'Cliente não respondeu depois que chamou',
    opcoes: [
      { label: 'Leve / Persuasiva', texto: 'Oi, [Nome]! Tudo bem? Queria te ajudar a garantir as camisetas que você precisa. Me fala se posso te ajudar a avançar no pedido!' },
      { label: 'Com convite', texto: 'Oi, [Nome]! Sei que a correria é grande, mas queria saber se posso facilitar seu pedido de camisetas. Estou aqui para ajudar!' },
    ]
  },
  {
    grupo: 'Cliente não respondeu depois do orçamento',
    opcoes: [
      { label: 'Leve / Lembrete', texto: 'Oi, [Nome]! Passando para lembrar que nosso prazo é de 4 a 8 dias úteis. Se quiser garantir seu pedido, me avisa que te ajudo a agilizar!' },
      { label: 'Com incentivo', texto: 'Oi, [Nome]! Se precisar ajustar quantidade, modelo ou cor para caber no seu orçamento, me fala que a gente dá um jeito!' },
    ]
  },
  {
    grupo: 'Geral — serve para os dois casos',
    opcoes: [
      { label: 'Leve / Disponível', texto: 'Oi, [Nome]! Estou aqui para te ajudar a conseguir as camisetas do jeito que você quer. Me avisa se quiser continuar!' },
      { label: 'Urgência suave', texto: 'Oi, [Nome]! As peças estão saindo rápido e queria garantir que você não perca a sua chance. Posso te ajudar a finalizar?' },
    ]
  },
  {
    grupo: 'Cliente disse que ia ver',
    opcoes: [
      { label: 'Leve / Pergunta', texto: 'Oi, [Nome]! Só passando para saber se deu tempo de analisar o orçamento. Se precisar, posso tirar qualquer dúvida!' },
      { label: 'Com convite', texto: 'Oi, [Nome]! Quando puder, me fala se posso ajudar a ajustar algo para facilitar seu pedido.' },
    ]
  },
];

const categorias = ['Todos', 'Geral', 'Vendas', 'Produção', 'Financeiro'];

const PRESET_COLORS = [
  'hsl(262 83% 58%)',
  'hsl(199 89% 48%)',
  'hsl(142 71% 45%)',
  'hsl(38 92% 50%)',
  'hsl(0 84% 60%)',
  'hsl(330 81% 60%)',
  'hsl(25 95% 53%)',
  'hsl(200 18% 46%)',
];

export default function SettingsPage() {
  const [tab, setTab] = useState<'respostas' | 'templates' | 'etiquetas' | 'geral' | 'funis'>('respostas');

  const { logoUrl, setLogoUrl } = useLogo();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [respostas, setRespostas] = useState<RespostaRapida[]>([]);
  const [templates, setTemplates] = useState<Template[]>(mockTemplates);
  const [catFilter, setCatFilter] = useState('Todos');

  // Etiquetas from shared context
  const { etiquetas, setEtiquetas, addEtiqueta, removeEtiqueta, updateEtiqueta } = useEtiquetas();
  const [showNewEtiqueta, setShowNewEtiqueta] = useState(false);
  const [editingEtiqueta, setEditingEtiqueta] = useState<string | null>(null);
  const [etiquetaForm, setEtiquetaForm] = useState({ 
    nome: '', 
    cor: PRESET_COLORS[0],
    followup_texto: '',
    followup_horas: 0
  });

  // Respostas rápidas state
  const [showNewResposta, setShowNewResposta] = useState(false);
  const [editingResposta, setEditingResposta] = useState<string | null>(null);
  const [respostaForm, setRespostaForm] = useState({ atalho: '', texto: '' });

  // Templates state
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState({ nome: '', categoria: 'Geral', texto: '' });

  useEffect(() => {
    fetchRespostas().then(setRespostas);
  }, []);

  // Mensagens dos funis — editáveis pelo usuário
  const FUNIL_DEFAULTS = {
    nao_respondeu: [
      { horas: 24, texto: 'Oi! Vi que não conseguimos continuar nossa conversa. Ainda tem interesse em camisetas personalizadas? 😊' },
      { horas: 48, texto: 'Opa! Só passando pra saber se conseguiu decidir. Temos grade completa e entrega rápida 🚀' },
      { horas: 72, texto: 'Olá! Última tentativa — se precisar de camisetas personalizadas, estamos aqui! Qualquer dúvida é só me chamar.' },
    ],
    orcamento_sumiu: [
      { horas: 48, texto: 'Oi! Conseguiu analisar o orçamento que enviamos? Posso te ajudar com alguma dúvida? 😊' },
      { horas: 96, texto: 'Olá! Só para confirmar que o orçamento ainda está válido. Quando quiser fechar, é só me chamar 😊' },
    ],
    recorrente: [
      { horas: 24 * 90, texto: 'Oi! Tudo bem? 😊 Passou um tempinho desde nosso último pedido. Está precisando de novas camisetas personalizadas?' },
    ],
  };

  const [funilMsgs, setFunilMsgs] = useState(FUNIL_DEFAULTS);
  const [funilSaving, setFunilSaving] = useState(false);
  const [funilSaved, setFunilSaved] = useState(false);

  useEffect(() => {
    fetch('/api/funil-msgs').then(r => r.ok ? r.json() : null).then(data => {
      if (data) setFunilMsgs(data);
    }).catch(() => {});
  }, []);

  const salvarFunilMsgs = async () => {
    setFunilSaving(true);
    try {
      await fetch('/api/funil-msgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(funilMsgs),
      });
      setFunilSaved(true);
      setTimeout(() => setFunilSaved(false), 3000);
    } catch {}
    setFunilSaving(false);
  };

  const updateFunilMsg = (tipo: string, idx: number, campo: 'texto' | 'horas', valor: string | number) => {
    setFunilMsgs(prev => ({
      ...prev,
      [tipo]: (prev as any)[tipo].map((m: any, i: number) => i === idx ? { ...m, [campo]: valor } : m),
    }));
  };


  // Respostas handlers
  const handleSaveResposta = async () => {
    if (!respostaForm.atalho.trim() || !respostaForm.texto.trim()) return;
    if (editingResposta) {
      setRespostas(prev => prev.map(r => r.id === editingResposta ? { ...r, ...respostaForm } : r));
      setEditingResposta(null);
    } else {
      const nova = await salvarResposta(respostaForm);
      setRespostas(prev => [...prev, nova]);
    }
    setRespostaForm({ atalho: '', texto: '' });
    setShowNewResposta(false);
  };

  const handleDeleteResposta = async (id: string) => {
    try {
      await deletarResposta(id);
      setRespostas(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      console.error('Erro ao deletar:', e);
    }
  };

  const handleEditResposta = (r: RespostaRapida) => {
    setEditingResposta(r.id);
    setRespostaForm({ atalho: r.atalho, texto: r.texto });
    setShowNewResposta(true);
  };

  // Templates handlers
  const handleSaveTemplate = () => {
    if (!templateForm.nome.trim() || !templateForm.texto.trim()) return;
    if (editingTemplate) {
      setTemplates(prev => prev.map(t => t.id === editingTemplate ? { ...t, ...templateForm } : t));
      setEditingTemplate(null);
    } else {
      setTemplates(prev => [...prev, { ...templateForm, id: Date.now().toString() }]);
    }
    setTemplateForm({ nome: '', categoria: 'Geral', texto: '' });
    setShowNewTemplate(false);
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  const handleEditTemplate = (t: Template) => {
    setEditingTemplate(t.id);
    setTemplateForm({ nome: t.nome, categoria: t.categoria, texto: t.texto });
    setShowNewTemplate(true);
  };

  const filteredTemplates = catFilter === 'Todos' ? templates : templates.filter(t => t.categoria === catFilter);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-6 py-5 border-b bg-card">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Settings size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Configurações</h1>
            <p className="text-xs text-muted-foreground">Gerencie respostas rápidas e templates de mensagem</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4 bg-card border-b">
        <div className="flex gap-1 bg-secondary rounded-xl p-1 w-fit flex-wrap">
          <button
            onClick={() => setTab('geral')}
            className={cn(
              'flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-all',
              tab === 'geral'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ImageIcon size={16} /> Geral
          </button>
          <button
            onClick={() => setTab('respostas')}
            className={cn(
              'flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-all',
              tab === 'respostas'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Zap size={16} /> Respostas Rápidas
          </button>
          <button
            onClick={() => setTab('templates')}
            className={cn(
              'flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-all',
              tab === 'templates'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <FileText size={16} /> Templates
          </button>
          <button
            onClick={() => setTab('etiquetas')}
            className={cn(
              'flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-all',
              tab === 'etiquetas'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Tag size={16} /> Etiquetas
          </button>
          <button
            onClick={() => setTab('funis')}
            className={cn(
              'flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-all',
              tab === 'funis'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <MessageSquare size={16} /> Funis
          </button>
        </div>
      </div>


      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        {/* === GERAL (LOGO) === */}
        {tab === 'geral' && (
          <div className="max-w-3xl space-y-4">
            <div>
              <h2 className="text-sm font-bold text-foreground">Personalização</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Configure a identidade visual do seu CRM</p>
            </div>

            <div className="border rounded-xl p-5 bg-card space-y-4">
              <label className="text-xs font-semibold text-muted-foreground">Logo da Empresa</label>
              <div className="flex items-center gap-5">
                <div className="w-20 h-20 rounded-2xl bg-secondary border-2 border-dashed border-border flex items-center justify-center overflow-hidden shrink-0">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon size={28} className="text-muted-foreground/30" />
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    A logo aparece no menu lateral e identifica seu CRM. Use uma imagem quadrada (PNG, JPG).
                  </p>
                  <div className="flex gap-2">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          setLogoUrl(reader.result as string);
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                    <Button size="sm" className="gap-1.5 text-xs" onClick={() => logoInputRef.current?.click()}>
                      <Upload size={13} /> {logoUrl ? 'Trocar Logo' : 'Enviar Logo'}
                    </Button>
                    {logoUrl && (
                      <Button variant="outline" size="sm" className="text-xs text-destructive hover:text-destructive" onClick={() => setLogoUrl(null)}>
                        <X size={13} /> Remover
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === RESPOSTAS RÁPIDAS === */}
        {tab === 'respostas' && (
          <div className="max-w-3xl space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold">Respostas Rápidas</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Use o atalho <span className="font-mono font-semibold text-primary">/</span> no chat para acessar rapidamente
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 rounded-lg text-xs"
                  onClick={async () => {
                    const padroes = [
                      { atalho: '/fu1a', texto: 'Oi, [Nome]! Tudo bem? Queria te ajudar a garantir as camisetas que você precisa. Me fala se posso te ajudar a avançar no pedido!' },
                      { atalho: '/fu1b', texto: 'Oi, [Nome]! Sei que a correria é grande, mas queria saber se posso facilitar seu pedido de camisetas. Estou aqui para ajudar!' },
                      { atalho: '/fu2a', texto: 'Oi, [Nome]! Passando para lembrar que nosso prazo é de 4 a 8 dias úteis. Se quiser garantir seu pedido, me avisa que te ajudo a agilizar!' },
                      { atalho: '/fu2b', texto: 'Oi, [Nome]! Se precisar ajustar quantidade, modelo ou cor para caber no seu orçamento, me fala que a gente dá um jeito!' },
                      { atalho: '/fu3a', texto: 'Oi, [Nome]! Estou aqui para te ajudar a conseguir as camisetas do jeito que você quer. Me avisa se quiser continuar!' },
                      { atalho: '/fu3b', texto: 'Oi, [Nome]! As peças estão saindo rápido e queria garantir que você não perca a sua chance. Posso te ajudar a finalizar?' },
                      { atalho: '/fu4a', texto: 'Oi, [Nome]! Só passando para saber se deu tempo de analisar o orçamento. Se precisar, posso tirar qualquer dúvida!' },
                      { atalho: '/fu4b', texto: 'Oi, [Nome]! Quando puder, me fala se posso ajudar a ajustar algo para facilitar seu pedido.' },
                    ];
                    for (const p of padroes) {
                      const jaExiste = respostas.some(r => r.atalho === p.atalho);
                      if (!jaExiste) {
                        const nova = await salvarResposta(p);
                        setRespostas(prev => [...prev, nova]);
                      }
                    }
                  }}
                >
                  📋 Importar templates
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 rounded-lg"
                  onClick={() => { setShowNewResposta(true); setEditingResposta(null); setRespostaForm({ atalho: '', texto: '' }); }}
                >
                  <Plus size={14} /> Nova Resposta
                </Button>
              </div>
            </div>

            {showNewResposta && (
              <div className="border rounded-xl p-4 space-y-3 bg-card shadow-sm animate-fade-in">
                <h3 className="text-xs font-semibold text-muted-foreground">
                  {editingResposta ? 'Editar Resposta' : 'Nova Resposta Rápida'}
                </h3>
                <div className="flex gap-3">
                  <div className="w-32 shrink-0">
                    <label className="text-[11px] text-muted-foreground mb-1 block">Atalho</label>
                    <Input
                      placeholder="/exemplo"
                      value={respostaForm.atalho}
                      onChange={e => setRespostaForm(f => ({ ...f, atalho: e.target.value }))}
                      className="text-sm h-9 font-mono bg-secondary border-0"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[11px] text-muted-foreground mb-1 block">Mensagem</label>
                    <Textarea
                      placeholder="Digite o texto da resposta rápida..."
                      value={respostaForm.texto}
                      onChange={e => setRespostaForm(f => ({ ...f, texto: e.target.value }))}
                      className="text-sm bg-secondary border-0 min-h-[80px] resize-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => { setShowNewResposta(false); setEditingResposta(null); }}
                  >
                    Cancelar
                  </Button>
                  <Button size="sm" className="text-xs gap-1" onClick={handleSaveResposta}>
                    <Save size={12} /> {editingResposta ? 'Atualizar' : 'Salvar'}
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {respostas.map(r => (
                <div key={r.id} className="border rounded-xl p-4 bg-card hover:shadow-sm transition-shadow group flex items-start gap-4">
                  <div className="shrink-0">
                    <span className="font-mono text-sm font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-lg">{r.atalho}</span>
                  </div>
                  <p className="flex-1 text-sm text-muted-foreground leading-relaxed">{r.texto}</p>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => handleEditResposta(r)}>
                      <Edit2 size={13} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteResposta(r.id)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              ))}
              {respostas.length === 0 && (
                <div className="text-center py-12 border rounded-xl bg-card">
                  <Zap size={36} className="mx-auto text-muted-foreground/20 mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhuma resposta rápida cadastrada</p>
                  <p className="text-xs text-muted-foreground mt-1">Crie sua primeira resposta rápida para agilizar o atendimento</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* === TEMPLATES === */}
        {tab === 'templates' && (
          <div className="max-w-3xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold">Templates de Mensagem</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Modelos prontos com variáveis <span className="font-mono text-primary">{'{{variavel}}'}</span>
                </p>
              </div>
              <Button
                size="sm"
                className="gap-1.5 rounded-lg"
                onClick={() => { setShowNewTemplate(true); setEditingTemplate(null); setTemplateForm({ nome: '', categoria: 'Geral', texto: '' }); }}
              >
                <Plus size={14} /> Novo Template
              </Button>
            </div>

            {/* Category filter */}
            <div className="flex gap-1.5 flex-wrap">
              {categorias.map(c => (
                <button
                  key={c}
                  onClick={() => setCatFilter(c)}
                  className={cn(
                    'text-xs font-medium px-3 py-1.5 rounded-lg transition-all border',
                    catFilter === c
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-foreground'
                  )}
                >
                  {c}
                </button>
              ))}
            </div>

            {showNewTemplate && (
              <div className="border rounded-xl p-4 space-y-3 bg-card shadow-sm animate-fade-in">
                <h3 className="text-xs font-semibold text-muted-foreground">
                  {editingTemplate ? 'Editar Template' : 'Novo Template'}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">Nome</label>
                    <Input
                      placeholder="Ex: Confirmação de pedido"
                      value={templateForm.nome}
                      onChange={e => setTemplateForm(f => ({ ...f, nome: e.target.value }))}
                      className="text-sm h-9 bg-secondary border-0"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">Categoria</label>
                    <select
                      value={templateForm.categoria}
                      onChange={e => setTemplateForm(f => ({ ...f, categoria: e.target.value }))}
                      className="w-full text-sm h-9 border rounded-lg px-2.5 bg-secondary border-0 text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
                    >
                      {categorias.filter(c => c !== 'Todos').map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">
                    Mensagem <span className="text-muted-foreground/60">(use {'{{variavel}}'} para campos dinâmicos)</span>
                  </label>
                  <Textarea
                    placeholder="Olá {{nome}}, seu pedido {{pedido}} está pronto..."
                    value={templateForm.texto}
                    onChange={e => setTemplateForm(f => ({ ...f, texto: e.target.value }))}
                    className="text-sm bg-secondary border-0 min-h-[100px] resize-none"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => { setShowNewTemplate(false); setEditingTemplate(null); }}
                  >
                    Cancelar
                  </Button>
                  <Button size="sm" className="text-xs gap-1" onClick={handleSaveTemplate}>
                    <Save size={12} /> {editingTemplate ? 'Atualizar' : 'Salvar'}
                  </Button>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {filteredTemplates.map(t => (
                <div key={t.id} className="border rounded-xl p-4 bg-card hover:shadow-sm transition-shadow group space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-semibold flex items-center gap-1.5">
                        <MessageSquare size={14} className="text-primary" />
                        {t.nome}
                      </h4>
                      <Badge variant="secondary" className="text-[10px] mt-1 font-medium">{t.categoria}</Badge>
                    </div>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => handleEditTemplate(t)}>
                        <Edit2 size={13} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteTemplate(t.id)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{t.texto}</p>
                </div>
              ))}
            </div>

            {filteredTemplates.length === 0 && (
              <div className="text-center py-12 border rounded-xl bg-card">
                <FileText size={36} className="mx-auto text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum template nesta categoria</p>
              </div>
            )}
          </div>
        )}

        {/* === ETIQUETAS === */}
        {tab === 'etiquetas' && (
          <div className="max-w-3xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-foreground">Etiquetas</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Crie e gerencie etiquetas para organizar suas conversas
                </p>
              </div>
              <Button
                size="sm"
                className="gap-1.5 rounded-lg"
                onClick={() => { 
                  setShowNewEtiqueta(true); 
                  setEditingEtiqueta(null); 
                  setEtiquetaForm({ 
                    nome: '', 
                    cor: PRESET_COLORS[0],
                    followup_texto: '',
                    followup_horas: 0
                  }); 
                }}
              >
                <Plus size={14} /> Nova Etiqueta
              </Button>
            </div>

            {showNewEtiqueta && (
              <div className="border rounded-xl p-4 space-y-3 bg-card shadow-sm animate-fade-in">
                <h3 className="text-xs font-semibold text-muted-foreground">
                  {editingEtiqueta ? 'Editar Etiqueta' : 'Nova Etiqueta'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">Nome</label>
                    <Input
                      placeholder="Ex: VIP, Urgente, Atacado..."
                      value={etiquetaForm.nome}
                      onChange={e => setEtiquetaForm(f => ({ ...f, nome: e.target.value }))}
                      className="text-sm h-9 bg-secondary border-0"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">Tempo Follow-up (Horas)</label>
                    <Input
                      type="number"
                      placeholder="0 = desativado"
                      value={etiquetaForm.followup_horas}
                      onChange={e => setEtiquetaForm(f => ({ ...f, followup_horas: parseInt(e.target.value) || 0 }))}
                      className="text-sm h-9 bg-secondary border-0"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-muted-foreground">Mensagem Automática (Follow-up)</label>
                    {/* Seletor de templates prontos */}
                    <div className="relative">
                      <select
                        className="text-[10px] font-semibold bg-primary/10 text-primary border border-primary/30 rounded-lg px-2 py-1 pr-5 focus:outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
                        defaultValue=""
                        onChange={e => {
                          if (e.target.value) {
                            setEtiquetaForm(f => ({ ...f, followup_texto: e.target.value }));
                            e.target.value = ''; // reset select
                          }
                        }}
                      >
                        <option value="" disabled>📋 Usar template pronto</option>
                        {FOLLOWUP_TEMPLATES.map(grupo => (
                          <optgroup key={grupo.grupo} label={grupo.grupo}>
                            {grupo.opcoes.map((op, i) => (
                              <option key={i} value={op.texto}>{op.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </div>
                  <Textarea
                    placeholder="Oi, [Nome]! Passando para saber se posso te ajudar..."
                    value={etiquetaForm.followup_texto}
                    onChange={e => setEtiquetaForm(f => ({ ...f, followup_texto: e.target.value }))}
                    className="text-sm bg-secondary border-0 min-h-[90px] resize-none"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Escolha um template acima e edite como quiser. Use <span className="font-mono font-bold">[Nome]</span> para o nome do cliente.</p>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1.5 block">Cor</label>
                  <div className="flex gap-2 flex-wrap">
                    {PRESET_COLORS.map(cor => (
                      <button
                        key={cor}
                        onClick={() => setEtiquetaForm(f => ({ ...f, cor }))}
                        className={cn(
                          'w-8 h-8 rounded-lg border-2 transition-all',
                          etiquetaForm.cor === cor ? 'scale-110 border-foreground shadow-md' : 'border-transparent hover:scale-105'
                        )}
                        style={{ backgroundColor: cor }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <div className="flex-1">
                    <span className="text-[10px] text-muted-foreground">Preview:</span>
                    <div className="mt-1">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: etiquetaForm.cor + '20', color: etiquetaForm.cor, border: `1px solid ${etiquetaForm.cor}40` }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: etiquetaForm.cor }} />
                        {etiquetaForm.nome || 'Etiqueta'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => { 
                        setShowNewEtiqueta(false); 
                        setEditingEtiqueta(null); 
                        setEtiquetaForm({ nome: '', cor: PRESET_COLORS[0], followup_texto: '', followup_horas: 0 });
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button size="sm" className="text-xs gap-1" onClick={() => {
                      if (!etiquetaForm.nome.trim()) return;
                      if (editingEtiqueta) {
                        updateEtiqueta(editingEtiqueta, etiquetaForm);
                      } else {
                        addEtiqueta(etiquetaForm);
                      }
                      setEtiquetaForm({ nome: '', cor: PRESET_COLORS[0], followup_texto: '', followup_horas: 0 });
                      setShowNewEtiqueta(false);
                      setEditingEtiqueta(null);
                    }}>
                      <Save size={12} /> {editingEtiqueta ? 'Atualizar' : 'Salvar'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {etiquetas.map(e => (
                <div key={e.id} className="border rounded-xl p-4 bg-card hover:shadow-sm transition-shadow group flex items-center gap-4">
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: e.cor + '20', color: e.cor, border: `1px solid ${e.cor}40` }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: e.cor }} />
                    {e.nome}
                  </span>
                  <div className="flex-1" />
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => { 
                        setEditingEtiqueta(e.id); 
                        setEtiquetaForm({ 
                          nome: e.nome, 
                          cor: e.cor,
                          followup_texto: e.followup_texto || '',
                          followup_horas: e.followup_horas || 0
                        }); 
                        setShowNewEtiqueta(true); 
                      }}
                    >
                      <Edit2 size={13} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeEtiqueta(e.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              ))}
              {etiquetas.length === 0 && (
                <div className="text-center py-12 border rounded-xl bg-card">
                  <Tag size={36} className="mx-auto text-muted-foreground/20 mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhuma etiqueta cadastrada</p>
                  <p className="text-xs text-muted-foreground mt-1">Crie etiquetas para categorizar suas conversas</p>
                </div>
              )}
            </div>
          </div>
        )}
        {/* === FUNIS === */}
        {tab === 'funis' && (
          <div className="max-w-3xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-foreground">Mensagens dos Funis</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Edite o texto e o intervalo de cada mensagem automática</p>
              </div>
              <Button size="sm" className="gap-1.5 text-xs" onClick={salvarFunilMsgs} disabled={funilSaving}>
                {funilSaved ? <><Check size={13} /> Salvo!</> : <><Save size={13} /> Salvar Tudo</>}
              </Button>
            </div>

            {/* Funil 1 */}
            <div className="border rounded-xl bg-card overflow-hidden">
              <div className="px-4 py-3 bg-red-500/10 border-b border-red-500/20 flex items-center gap-2">
                <span className="text-base">🔴</span>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Não Respondeu</h3>
                  <p className="text-[10px] text-muted-foreground">Sequência enviada quando o lead para de responder</p>
                </div>
              </div>
              <div className="p-4 space-y-4">
                {funilMsgs.nao_respondeu.map((msg, idx) => (
                  <div key={idx} className="space-y-2 pb-4 border-b border-border/40 last:border-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded-lg">Mensagem {idx + 1}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Enviar após</span>
                        <input
                          type="number"
                          min={1}
                          value={msg.horas}
                          onChange={e => updateFunilMsg('nao_respondeu', idx, 'horas', parseInt(e.target.value) || 1)}
                          className="w-14 text-xs h-7 border rounded-lg px-2 bg-secondary text-foreground text-center focus:ring-1 focus:ring-ring outline-none"
                        />
                        <span className="text-xs text-muted-foreground">horas</span>
                      </div>
                    </div>
                    <Textarea
                      value={msg.texto}
                      onChange={e => updateFunilMsg('nao_respondeu', idx, 'texto', e.target.value)}
                      className="text-sm bg-secondary border-0 min-h-[80px] resize-none"
                      placeholder="Texto da mensagem..."
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Funil 2 */}
            <div className="border rounded-xl bg-card overflow-hidden">
              <div className="px-4 py-3 bg-yellow-500/10 border-b border-yellow-500/20 flex items-center gap-2">
                <span className="text-base">🟡</span>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Recebeu Orçamento e Sumiu</h3>
                  <p className="text-[10px] text-muted-foreground">Enviado para leads que sumiram após receber o valor</p>
                </div>
              </div>
              <div className="p-4 space-y-4">
                {funilMsgs.orcamento_sumiu.map((msg, idx) => (
                  <div key={idx} className="space-y-2 pb-4 border-b border-border/40 last:border-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded-lg">Mensagem {idx + 1}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Enviar após</span>
                        <input
                          type="number"
                          min={1}
                          value={msg.horas}
                          onChange={e => updateFunilMsg('orcamento_sumiu', idx, 'horas', parseInt(e.target.value) || 1)}
                          className="w-14 text-xs h-7 border rounded-lg px-2 bg-secondary text-foreground text-center focus:ring-1 focus:ring-ring outline-none"
                        />
                        <span className="text-xs text-muted-foreground">horas</span>
                      </div>
                    </div>
                    <Textarea
                      value={msg.texto}
                      onChange={e => updateFunilMsg('orcamento_sumiu', idx, 'texto', e.target.value)}
                      className="text-sm bg-secondary border-0 min-h-[80px] resize-none"
                      placeholder="Texto da mensagem..."
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Funil 3 */}
            <div className="border rounded-xl bg-card overflow-hidden">
              <div className="px-4 py-3 bg-green-500/10 border-b border-green-500/20 flex items-center gap-2">
                <span className="text-base">🟢</span>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Cliente Recorrente</h3>
                  <p className="text-[10px] text-muted-foreground">Mensagem de reativação enviada a cada 90 dias</p>
                </div>
              </div>
              <div className="p-4 space-y-4">
                {funilMsgs.recorrente.map((msg, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded-lg">Mensagem {idx + 1}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Ciclo a cada</span>
                        <input
                          type="number"
                          min={1}
                          value={msg.horas}
                          onChange={e => updateFunilMsg('recorrente', idx, 'horas', parseInt(e.target.value) || 1)}
                          className="w-16 text-xs h-7 border rounded-lg px-2 bg-secondary text-foreground text-center focus:ring-1 focus:ring-ring outline-none"
                        />
                        <span className="text-xs text-muted-foreground">horas</span>
                      </div>
                    </div>
                    <Textarea
                      value={msg.texto}
                      onChange={e => updateFunilMsg('recorrente', idx, 'texto', e.target.value)}
                      className="text-sm bg-secondary border-0 min-h-[80px] resize-none"
                      placeholder="Texto da mensagem..."
                    />
                  </div>
                ))}
              </div>
            </div>

            <Button className="w-full gap-2" onClick={salvarFunilMsgs} disabled={funilSaving}>
              {funilSaved ? <><Check size={14} /> Mensagens Salvas com Sucesso!</> : <><Save size={14} /> Salvar Mensagens dos Funis</>}
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
