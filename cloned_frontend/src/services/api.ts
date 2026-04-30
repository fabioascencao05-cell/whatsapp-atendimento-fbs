import type { Conversa, Mensagem, Pedido, RespostaRapida, FollowUpConfig } from '@/types/crm';

async function tryFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const finalOptions: RequestInit = {
    ...options,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      ...(options.headers || {})
    },
    cache: 'no-store' as RequestCache
  };

  const res = await fetch(url, finalOptions);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || 'Erro na requisição');
  }
  return res.json();
}

export async function fetchConversas(): Promise<Conversa[]> {
  return tryFetch('/api/conversas');
}

export async function fetchMensagens(id: string): Promise<{ conversa: Conversa; mensagens: Mensagem[]; pedidos: Pedido[] }> {
  return tryFetch(`/api/conversas/${id}`);
}

export async function enviarMensagem(id: string, texto: string): Promise<Mensagem> {
  return tryFetch(`/api/conversas/${id}/enviar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto }),
  });
}

export async function pausarBot(id: string) {
  return tryFetch(`/api/conversas/${id}/pausar`, { method: 'POST' });
}

export async function ativarBot(id: string) {
  return tryFetch(`/api/conversas/${id}/ativar`, { method: 'POST' });
}

export async function mudarKanban(id: string, status: string) {
  return tryFetch(`/api/conversas/${id}/kanban`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export async function atualizarEtiquetasConversa(id: string, etiquetaIds: string[]) {
  return tryFetch(`/api/conversas/${id}/etiquetas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ etiquetaIds: etiquetaIds.map(eid => parseInt(eid)) }),
  });
}

export async function enviarBroadcast(ids: string[], texto: string) {
  return tryFetch('/api/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, texto }),
  });
}

export async function atualizarValor(id: string, valor: number) {
  return tryFetch(`/api/conversas/${id}/valor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ valor }),
  });
}

export async function salvarTags(id: string, tags: string) {
  return tryFetch(`/api/conversas/${id}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
}

export async function criarPedido(id: string, pedido: Omit<Pedido, 'id' | 'status'>) {
  return tryFetch(`/api/conversas/${id}/pedidos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pedido),
  });
}

export async function fetchPedidos(id: string): Promise<Pedido[]> {
  const data = await fetchMensagens(id);
  return data.pedidos;
}

export async function fetchRespostas(): Promise<RespostaRapida[]> {
  return tryFetch('/api/respostas');
}

export async function salvarResposta(resposta: Omit<RespostaRapida, 'id'>): Promise<RespostaRapida> {
  return tryFetch('/api/respostas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(resposta),
  });
}

export async function deletarResposta(id: string) {
  return tryFetch(`/api/respostas/${id}`, { method: 'DELETE' });
}

export async function agendarFollowUp(id: string, config: FollowUpConfig & { proximo_followup: string }) {
  return tryFetch('/api/followups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversaId: id,
      agendado_para: config.proximo_followup,
      texto: config.template,
    }),
  });
}

export async function deleteConversa(id: string) {
  return tryFetch('/api/conversas/delete', { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
}

export async function restaurarConversa(id: string) {
  return tryFetch('/api/conversas/restaurar', { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
}

export async function deletePermanente(id: string) {
  return tryFetch('/api/conversas/delete-permanente', { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
}

export async function fetchLixeira(): Promise<Conversa[]> {
  return tryFetch('/api/conversas/lixeira');
}

export async function fetchStats() {
  return tryFetch('/api/stats');
}

export async function syncConversas(): Promise<{ message: string }> {
  return tryFetch('/api/sync', { method: 'POST' });
}

// Follow-Up
export async function fetchFollowUps() {
  return tryFetch('/api/followups');
}

export async function criarFollowUp(data: { conversaId: string; texto: string; agendado_para: string }) {
  return tryFetch('/api/followups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function cancelarFollowUp(id: string) {
  return tryFetch(`/api/followups/${id}/cancelar`, { method: 'POST' });
}

export async function deletarFollowUp(id: string) {
  return tryFetch(`/api/followups/${id}`, { method: 'DELETE' });
}
