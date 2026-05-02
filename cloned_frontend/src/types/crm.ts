export interface Etiqueta {
  id: string;
  nome: string;
  cor: string;
}

export interface Conversa {
  id: string;
  numero: string;
  nome: string;
  telefone: string;
  tags: string;
  status_bot: boolean;
  status_kanban: string;
  unreadCount: number;
  atualizado_em: string;
  ultima_mensagem: string;
  proximo_followup?: string;
  automacao_ativa?: boolean;
  profile_pic_url?: string;
  label_id?: string | null;
  etiquetas?: Etiqueta[];
  valor_conversa?: number;
  // Funil automático
  funil_tipo?: string | null;
  funil_step?: number | null;
  funil_proximo?: string | null;
  funil_ultimo_disparo?: string | null;
}

export interface FollowUpConfig {
  intervalo: number; // hours
  template: string;
  tag_automatica?: string;
}

export interface Mensagem {
  id: number;
  texto: string;
  origem: 'cliente' | 'bot' | 'loja';
  mediaType: '' | 'image' | 'audio' | 'video' | 'contact' | 'document';
  mediaUrl?: string;
  mimeType?: string;
  criado_em: string;
}

export interface Pedido {
  id: string;
  quantidade: string;
  tamanho: string;
  cor: string;
  local_estampa: string;
  valor_total: string;
  sinal_pago: string;
  status: 'Pendente' | 'Pronto' | 'Finalizado';
}

export interface RespostaRapida {
  id: string;
  atalho: string;
  texto: string;
}

export const KANBAN_COLUMNS = ['Novos', 'Em Negociação', 'Fechados', 'Finalizados'] as const;
