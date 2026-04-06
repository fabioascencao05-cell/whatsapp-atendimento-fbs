let conversaAtual = null;
let todasConversas = [];
let respostasRapidas = [];

function switchTab(tab) {
    document.getElementById('sec-chat').style.display = 'none';
    document.getElementById('sec-kanban').style.display = 'none';
    document.getElementById('sec-kanban').classList.add('hidden');
    document.getElementById('sec-dashboard').style.display = 'none';
    document.getElementById('sec-dashboard').classList.add('hidden');

    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

    if(tab === 'chat') {
        document.getElementById('sec-chat').style.display = 'flex';
        document.getElementById('tab-chat').classList.add('active');
    } else if (tab === 'kanban') {
        document.getElementById('sec-kanban').style.display = 'flex';
        document.getElementById('sec-kanban').classList.remove('hidden');
        document.getElementById('tab-kanban').classList.add('active');
        renderizarKanban();
    } else {
        document.getElementById('sec-dashboard').style.display = 'flex';
        document.getElementById('sec-dashboard').classList.remove('hidden');
        document.getElementById('tab-dashboard').classList.add('active');
        carregarDashboard();
    }
}

function toggleRightTab(tab) {
    if(tab === 'info') {
        document.getElementById('right-tab-info').style.display = 'flex';
        document.getElementById('right-tab-erp').style.display = 'none';
        document.getElementById('btn-tab-info').classList.add('active');
        document.getElementById('btn-tab-erp').classList.remove('active');
    } else {
        document.getElementById('right-tab-erp').style.display = 'block';
        document.getElementById('right-tab-info').style.display = 'none';
        document.getElementById('btn-tab-erp').classList.add('active');
        document.getElementById('btn-tab-info').classList.remove('active');
    }
}

// Toasts
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bgClass = type === 'success' ? 'toast-success' : type === 'info' ? 'toast-info' : 'toast-error';
    const iName = type === 'success' ? 'check-circle' : type==='info' ? 'info' : 'alert-circle';
    
    toast.className = `toast-anim toast ${bgClass}`;
    toast.innerHTML = `<i data-lucide="${iName}" style="width:16px;height:16px;"></i> <span>${message}</span>`;
    
    container.appendChild(toast);
    lucide.createIcons({root: toast});
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 4000);
}

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

function renderTags(tagsString) {
    if(!tagsString) return '';
    return tagsString.split(',').map(t => {
        let clean = t.trim();
        if(!clean) return '';
        let colorClass = `tag-${clean}`;
        return `<span class="tag-badge ${colorClass}">${clean}</span>`;
    }).join(' ');
}

// ===================== KANBAN =====================
const kanbanCols = [
    { id: "Novos", color: "#3B82F6" },
    { id: "Em Negociação", color: "#EAB308" },
    { id: "Em Orçamento", color: "#F97316" },
    { id: "Aguardando Arte/Aprovação", color: "#A855F7" },
    { id: "Em Produção", color: "#3B82F6" },
    { id: "Finalizado", color: "#00C853" }
];

function renderizarKanban() {
    const container = document.getElementById('kanban-container');
    container.innerHTML = '';
    
    kanbanCols.forEach(col => {
        const divCol = document.createElement('div');
        divCol.className = 'kanban-col';
        
        const items = todasConversas.filter(c => (c.status_kanban || 'Novos') === col.id);
        
        divCol.innerHTML = `<div class="kanban-col-header" style="border-bottom:2px solid ${col.color};">
            <span>${col.id}</span>
            <span style="font-size:11px;background:var(--bg-primary);padding:2px 8px;border-radius:10px;">${items.length}</span>
        </div>`;
        
        const cardsCont = document.createElement('div');
        cardsCont.className = 'kanban-cards-container';
        cardsCont.ondragover = (e) => e.preventDefault();
        cardsCont.ondrop = (e) => dropKanban(e, col.id);
        
        items.forEach(c => {
            const card = document.createElement('div');
            card.className = 'kanban-card';
            card.draggable = true;
            card.ondragstart = (e) => e.dataTransfer.setData('text/plain', c.id);
            card.onclick = () => { switchTab('chat'); abrirChat(c); };
            
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px;">
                    <span style="font-weight:600;font-size:13px;color:var(--text-primary);">${c.nome || c.telefone}</span>
                    ${c.status_bot ? '<div style="width:8px;height:8px;border-radius:50%;background:var(--whatsapp);"></div>' : ''}
                </div>
                <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.ultima_mensagem || ''}</div>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">${renderTags(c.tags)}</div>
            `;
            cardsCont.appendChild(card);
        });
        
        divCol.appendChild(cardsCont);
        container.appendChild(divCol);
    });
}

async function dropKanban(e, novoStatus) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const conversa = todasConversas.find(c => c.id === id);
    if(conversa && (conversa.status_kanban || 'Novos') !== novoStatus) {
        conversa.status_kanban = novoStatus;
        renderizarKanban();
        if(conversaAtual && conversaAtual.id === id) { document.getElementById('chat-kanban-status').value = novoStatus; }
        try {
            await fetch(`/api/conversas/${id}/kanban`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({status: novoStatus})});
            showToast(`Movido para ${novoStatus}`, 'info');
        } catch(e) {}
    }
}

async function alterarKanbanAtivo(novoStatus) {
    if(!conversaAtual) return;
    conversaAtual.status_kanban = novoStatus;
    try {
        await fetch(`/api/conversas/${conversaAtual.id}/kanban`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({status: novoStatus})});
        showToast(`Movido para ${novoStatus}`, 'info');
        carregarConversas();
    } catch(e) {}
}

// ===================== TAGS =====================
function abrirModalTags() {
    if(!conversaAtual) return;
    document.getElementById('input-tags').value = conversaAtual.tags || '';
    document.getElementById('modal-tags').classList.add('show');
}
function fecharModalTags() {
    document.getElementById('modal-tags').classList.remove('show');
}
async function salvarTags() {
    const val = document.getElementById('input-tags').value;
    try {
        await fetch(`/api/conversas/${conversaAtual.id}/tags`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({tags: val})});
        conversaAtual.tags = val;
        document.getElementById('chat-tags-display').innerHTML = renderTags(val);
        fecharModalTags();
        carregarConversas();
    } catch(e) { showToast('Erro', 'error'); }
}

// ===================== CONVERSAS & CHAT =====================
function getStatusDotClass(kanban) {
    const map = {
        'Novos': 'dot-novo',
        'Em Negociação': 'dot-negociacao',
        'Em Orçamento': 'dot-negociacao',
        'Aguardando Arte/Aprovação': 'dot-arte',
        'Em Produção': 'dot-aprovada',
        'Finalizado': 'dot-fechado'
    };
    return map[kanban] || 'dot-semresposta';
}

function getInitials(name) {
    if(!name) return '?';
    const parts = name.split(' ');
    return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0][0].toUpperCase();
}

function filtrarConversas(query) {
    const q = query.toLowerCase();
    const lista = document.getElementById('lista-conversas');
    const items = lista.querySelectorAll('.conv-item');
    items.forEach(item => {
        const name = item.dataset.name || '';
        const phone = item.dataset.phone || '';
        item.style.display = (name.includes(q) || phone.includes(q)) ? 'flex' : 'none';
    });
}

async function carregarConversas(showLoading = false) {
    const lista = document.getElementById('lista-conversas');
    if(showLoading) lista.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">Carregando...</div>';

    try {
        const res = await fetch('/api/conversas');
        todasConversas = await res.json();
        lista.innerHTML = '';
        
        if(!document.getElementById('sec-kanban').classList.contains('hidden')) renderizarKanban();

        // Sort: unread first, then by date
        todasConversas.sort((a, b) => {
            if ((a.unreadCount || 0) > 0 && (b.unreadCount || 0) === 0) return -1;
            if ((a.unreadCount || 0) === 0 && (b.unreadCount || 0) > 0) return 1;
            return new Date(b.atualizado_em) - new Date(a.atualizado_em);
        });

        todasConversas.forEach(c => {
            const div = document.createElement('div');
            const isActive = conversaAtual?.id === c.id;
            div.className = `conv-item${isActive ? ' active' : ''}`;
            div.dataset.name = (c.nome || '').toLowerCase();
            div.dataset.phone = c.telefone || '';
            div.onclick = () => abrirChat(c);

            const initials = getInitials(c.nome);
            const dotClass = c.status_bot ? 'online' : 'offline';
            const statusKanban = getStatusDotClass(c.status_kanban);
            const unreadBadge = c.unreadCount > 0 
                ? `<div class="unread-badge">${c.unreadCount}</div>` : '';
            const timeStr = c.atualizado_em ? new Date(c.atualizado_em).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) : '';
            const previewClass = c.unreadCount > 0 ? 'conv-preview unread' : 'conv-preview';

            div.innerHTML = `
                <div class="conv-avatar">
                    <span style="font-size:13px;">${initials}</span>
                    <div class="status-dot ${dotClass}"></div>
                </div>
                <div class="conv-info">
                    <div class="conv-name">
                        ${c.nome || c.telefone}
                        <span style="width:8px;height:8px;border-radius:50;display:inline-block;" class="${statusKanban}"></span>
                    </div>
                    <div class="${previewClass}">${c.ultima_mensagem || '...'}</div>
                </div>
                <div class="conv-meta">
                    <span class="conv-time">${timeStr}</span>
                    ${unreadBadge}
                </div>
            `;
            lista.appendChild(div);
        });
    } catch (e) {}
}

async function abrirChat(conversa) {
    conversaAtual = conversa;
    document.getElementById('chat-empty').style.display = 'none';
    document.getElementById('chat-active').classList.remove('hidden');
    document.getElementById('chat-active').style.display = 'flex';
    document.getElementById('erp-area').classList.remove('hidden');

    document.getElementById('chat-nome').innerText = conversa.nome;
    document.getElementById('chat-telefone').innerText = `+${conversa.telefone}`;
    document.getElementById('chat-tags-display').innerHTML = renderTags(conversa.tags);
    document.getElementById('chat-kanban-status').value = conversa.status_kanban || 'Novos';
    
    document.getElementById('info-nome').innerText = conversa.nome;
    document.getElementById('info-telefone').innerText = `+${conversa.telefone}`;
    document.getElementById('followup-horas').value = conversa.lembrete_horas || '';

    renderBotBtn();
    await carregarMensagens();
    carregarConversas(); 
}

function renderBotBtn() {
    const btn = document.getElementById('btn-robo');
    if (conversaAtual.status_bot) {
        btn.innerHTML = `<i data-lucide="bot-off" style="width:14px;height:14px;"></i> Pausar Bot`;
        btn.className = "btn-bot-pause";
    } else {
        btn.innerHTML = `<i data-lucide="bot" style="width:14px;height:14px;"></i> Religar Bot`;
        btn.className = "btn-bot-activate";
    }
    lucide.createIcons({root: btn});
}

async function alternarRobo() {
    if(!conversaAtual) return;
    const acao = conversaAtual.status_bot ? 'pausar' : 'ativar';
    try {
        await fetch(`/api/conversas/${conversaAtual.id}/${acao}`, { method: 'POST' });
        conversaAtual.status_bot = !conversaAtual.status_bot;
        renderBotBtn();
        carregarConversas();
        if (acao === 'ativar') {
            showToast('Bot ativado! Natália enviou mensagem ao cliente.', 'success');
            setTimeout(carregarMensagens, 1500);
        } else {
            showToast('Bot pausado.', 'info');
        }
    } catch(e) {}
}

async function excluirConversa() {
    if(!conversaAtual) return;
    const confirma = confirm(`Tem certeza que quer EXCLUIR a conversa com ${conversaAtual.nome}?\n\nIsso apaga todas as mensagens e pedidos.`);
    if (!confirma) return;
    try {
        const res = await fetch(`/api/conversas/${conversaAtual.id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Conversa excluída!', 'success');
            conversaAtual = null;
            document.getElementById('chat-empty').style.display = 'flex';
            document.getElementById('chat-active').classList.add('hidden');
            document.getElementById('erp-area').classList.add('hidden');
            carregarConversas(true);
        } else { showToast('Erro ao excluir', 'error'); }
    } catch(e) { showToast('Erro ao excluir', 'error'); }
}

async function carregarMensagens() {
    if (!conversaAtual) return;
    try {
        const res = await fetch(`/api/conversas/${conversaAtual.id}`);
        const data = await res.json();
        const historico = document.getElementById('chat-historico');
        historico.innerHTML = '';
        // Restore popup
        historico.innerHTML = `<div id="quick-replies-popup" class="qr-popup hidden">
            <div style="font-size:11px;color:var(--text-muted);padding:4px 8px;font-weight:600;margin-bottom:4px;">Respostas Rápidas</div>
            <div id="quick-replies-list"></div>
        </div>`;
        
        data.mensagens.forEach(msg => {
            const div = document.createElement('div');
            const bgClass = msg.origem === 'cliente' ? 'msg-client' : msg.origem === 'bot' ? 'msg-bot' : 'msg-shop';
            div.className = `msg-bubble ${bgClass}`;
            
            let content = `<span>${msg.texto}</span>`;
            
            if(msg.mediaType === 'image') {
                content = `<div style="margin-bottom:6px;background:var(--bg-card);border-radius:8px;padding:12px;display:flex;flex-direction:column;align-items:center;"><i data-lucide="image" style="width:28px;height:28px;color:var(--text-muted);margin-bottom:4px;"></i><span style="font-size:11px;color:var(--text-muted);">Imagem</span></div>` + content;
            } else if (msg.mediaType === 'audio') {
                content = `<div style="margin-bottom:6px;"><audio controls style="height:32px;width:200px;">Áudio</audio></div>` + content;
            } else if (msg.mediaType === 'document') {
                content = `<div style="margin-bottom:6px;display:flex;align-items:center;gap:6px;background:var(--bg-card);padding:8px;border-radius:6px;"><i data-lucide="file-text" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:12px;">Documento</span></div>` + content;
            }
            
            // Timestamp
            const time = new Date(msg.criado_em).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
            const originLabel = msg.origem === 'bot' ? ' • 🤖' : msg.origem === 'loja' ? ' • 👤' : '';
            content += `<div style="font-size:10px;color:var(--text-muted);margin-top:4px;text-align:${msg.origem === 'cliente' ? 'left' : 'right'};">${time}${originLabel}</div>`;
            
            div.innerHTML = content;
            historico.appendChild(div);
        });
        lucide.createIcons({root: historico});
        historico.scrollTop = historico.scrollHeight;
        renderPedidos(data.pedidos);
    } catch(e) {}
}

// ===================== AUTOMATION =====================
function toggleAgendar() {
    const ipt = document.getElementById('input-agendar');
    if(ipt.classList.contains('hidden')) {
        ipt.classList.remove('hidden');
    } else {
        ipt.classList.add('hidden');
        ipt.value = '';
    }
}

async function salvarFollowUp() {
    if(!conversaAtual) return;
    const v = document.getElementById('followup-horas').value;
    try {
        await fetch(`/api/conversas/${conversaAtual.id}/followup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ horas: v }) });
        showToast(v ? `Cobrança agendada para ${v}h` : 'Cobrança cancelada', 'info');
        carregarConversas();
    } catch(e) {}
}

async function enviarMsg(isQuickReply = false) {
    const input = document.getElementById('input-msg');
    const dateInput = document.getElementById('input-agendar');
    const texto = input.value.trim();
    if (!texto || !conversaAtual) return;
    input.value = '';
    fecharQuickReply();
    
    if(dateInput && dateInput.value && !dateInput.classList.contains('hidden')) {
         try {
             await fetch(`/api/conversas/${conversaAtual.id}/agendar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, dataStr: dateInput.value }) });
             showToast('Mensagem Agendada!', 'success');
             dateInput.classList.add('hidden');
             dateInput.value = '';
         } catch(e) { showToast('Erro', 'error'); }
         return;
    }

    // Preview otimista
    const historico = document.getElementById('chat-historico');
    const preview = document.createElement('div');
    preview.className = 'msg-bubble msg-shop';
    preview.style.opacity = '0.5';
    preview.innerHTML = `<span>${texto}</span>`;
    historico.appendChild(preview);
    historico.scrollTop = historico.scrollHeight;

    try {
        const res = await fetch(`/api/conversas/${conversaAtual.id}/enviar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, is_quick_reply: isQuickReply }) });
        if(res.ok) {
            if (!isQuickReply) conversaAtual.status_bot = false;
            renderBotBtn();
            carregarConversas();
            setTimeout(carregarMensagens, 500);
        } else { showToast('Erro', 'error'); }
    } catch(e) {}
}

// ===================== QUICK REPLIES =====================
function checarQuickReply(val) {
    const popup = document.getElementById('quick-replies-popup');
    if(val === '/') {
        popup.classList.remove('hidden');
        renderListaQuickReplies(true);
    } else if (val.startsWith('/') && val.length > 1) {
        popup.classList.remove('hidden');
        renderListaQuickReplies(true, val.toLowerCase());
    } else {
        fecharQuickReply();
    }
}

function fecharQuickReply() { document.getElementById('quick-replies-popup')?.classList.add('hidden'); }

async function carregarQuickReplies() {
    try {
        const r = await fetch('/api/respostas');
        respostasRapidas = await r.json();
        if(respostasRapidas.length === 0) {
            respostasRapidas = [
                { atalho: "/pix", texto: "Nossa chave PIX é o CNPJ: 34.037.253/0001-51" },
                { atalho: "/prazo", texto: "Prazo de 4 a 8 dias úteis após aprovação da arte." }
            ];
        }
        renderListaQuickReplies(false);
    } catch(e) {}
}

function renderListaQuickReplies(forPopup, filter = '') {
    const l = document.getElementById(forPopup ? 'quick-replies-list' : 'side-respostas-list');
    if(!l) return;
    l.innerHTML = '';
    
    let filtered = respostasRapidas;
    if(filter) { filtered = respostasRapidas.filter(q => q.atalho.includes(filter)); }
    
    filtered.forEach(q => {
        const div = document.createElement('div');
        if(forPopup) {
            div.className = 'qr-item';
            div.innerHTML = `<span class="qr-cmd">${q.atalho}</span><span class="qr-preview">${q.texto.substring(0,35)}...</span>`;
        } else {
            div.style.cssText = 'padding:10px;background:var(--bg-primary);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;transition:all 0.2s;';
            div.innerHTML = `<div style="font-weight:700;color:var(--action);font-size:13px;margin-bottom:4px;">${q.atalho}</div>
                <div style="font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${q.texto}</div>`;
            div.onmouseover = () => { div.style.borderColor = 'var(--border-light)'; };
            div.onmouseout = () => { div.style.borderColor = 'var(--border)'; };
        }
        div.onclick = () => {
            document.getElementById('input-msg').value = q.atalho;
            fecharQuickReply();
            enviarMsg(true);
        };
        l.appendChild(div);
    });
}

async function novaRespostaRapida() {
    const atalho = prompt("Digite o Atalho. Ex: /boasvindas");
    if(!atalho) return;
    const texto = prompt("Digite o Texto da MENSAGEM:");
    if(!texto) return;
    try {
        const r = await fetch('/api/respostas', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ atalho, texto }) });
        if(r.ok) { showToast('Atalho criado!'); carregarQuickReplies(); }
    } catch(e) {}
}

// ===================== UPLOAD =====================
async function uploadArquivo() {
    const input = document.getElementById('file-uploader');
    if (!input.files || input.files.length === 0 || !conversaAtual) return;
    
    const file = input.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('caption', 'Anexo da Loja');
    
    document.getElementById('modal-upload').classList.add('show');

    try {
        const res = await fetch(`/api/conversas/${conversaAtual.id}/enviar-midia`, { method: 'POST', body: formData });
        if(res.ok) {
            showToast('Arquivo Enviado!');
            input.value = '';
            setTimeout(carregarMensagens, 1000);
        } else { showToast('Falha no upload', 'error'); }
    } catch (e) { showToast('Erro API', 'error'); }
    
    document.getElementById('modal-upload').classList.remove('show');
}

// ===================== ERP =====================
async function salvarPedido() {
    if(!conversaAtual) return;
    const body = {
        quantidade: document.getElementById('ped-qtd').value,
        tamanho: document.getElementById('ped-tamanho').value,
        cor: document.getElementById('ped-cor').value,
        local_estampa: document.getElementById('ped-estampa').value,
        valor_total: document.getElementById('ped-valor').value,
        sinal_pago: document.getElementById('ped-sinal').value,
        status: document.getElementById('ped-status').value
    };

    if(!body.valor_total) return showToast('Preencha o valor!', 'error');

    try {
        const res = await fetch(`/api/conversas/${conversaAtual.id}/pedidos`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        if(res.ok) { showToast('Pedido Salvo!'); carregarMensagens(); }
    } catch(e) { showToast('Erro', 'error'); }
}

function renderPedidos(pedidos) {
    const lista = document.getElementById('lista-pedidos');
    lista.innerHTML = '';
    if(pedidos.length === 0) {
        lista.innerHTML = '<p style="font-size:12px;color:var(--text-muted);">Nenhum pedido ainda.</p>';
        return;
    }
    
    pedidos.forEach(p => {
        const statusColors = { 'Pronto': 'var(--success)', 'Em Produção': '#3B82F6', 'Finalizado': 'var(--success)', 'Pendente': 'var(--warning)' };
        const color = statusColors[p.status] || 'var(--text-muted)';
        
        lista.innerHTML += `
            <div style="background:var(--bg-primary);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;font-size:13px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border);">
                    <span style="font-weight:600;">#${p.id.split('-')[0]}</span>
                    <span style="font-size:11px;padding:2px 8px;border-radius:10px;border:1px solid ${color};color:${color};background:${color}15;">${p.status}</span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px;color:var(--text-secondary);">
                    <p>Qtd: <span style="color:var(--text-primary);">${p.quantidade}</span></p>
                    <p>Tam: <span style="color:var(--text-primary);">${p.tamanho}</span></p>
                    <p style="grid-column:span 2;">Cor: ${p.cor || '-'} | Est: ${p.local_estampa || '-'}</p>
                </div>
            </div>
        `;
    });
}

// ===================== DASHBOARD =====================
let chartVolInstance = null;
let chartKanbanInstance = null;

async function carregarDashboard() {
    try {
        const res = await fetch('/api/dashboard/stats');
        const data = await res.json();
        
        document.getElementById('dash-avg').innerText = data.avgResponse;
        
        let tl = 0;
        const labelsK = Object.keys(data.kanbanDist);
        const dataK = Object.values(data.kanbanDist);
        dataK.forEach(v => tl += v);
        document.getElementById('dash-total').innerText = tl;

        const ctxKanban = document.getElementById('chart-kanban').getContext('2d');
        if(chartKanbanInstance) chartKanbanInstance.destroy();
        chartKanbanInstance = new Chart(ctxKanban, {
            type: 'doughnut',
            data: { labels: labelsK, datasets: [{ data: dataK, backgroundColor: ['#3b82f6','#eab308','#a855f7','#00c853','#E94560'] }]},
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#B0B0B0', font: { family: 'Inter' } } } } }
        });

        const labelsV = Object.keys(data.leadsPorDia).sort();
        const dataV = labelsV.map(l => data.leadsPorDia[l]);
        const ctxVol = document.getElementById('chart-volume').getContext('2d');
        if(chartVolInstance) chartVolInstance.destroy();
        chartVolInstance = new Chart(ctxVol, {
            type: 'bar',
            data: { labels: labelsV, datasets: [{ label: 'Novos Contatos', data: dataV, backgroundColor: '#E94560', borderRadius: 6 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: {color: '#B0B0B0'}, grid: {display:false} }, y: { ticks: {color: '#B0B0B0'}, grid: {color: 'rgba(42,58,92,0.3)'} } }, plugins: { legend: { display: false } } }
        });

    } catch (e) {}
}

// ===================== INIT =====================
carregarQuickReplies();
carregarConversas(true);
setInterval(() => {
    carregarConversas(false);
    if(conversaAtual) carregarMensagens();
}, 8000);
