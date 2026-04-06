let conversaAtual = null;
let todasConversas = [];
let respostasRapidas = [];
let abaAtiva = 'todos';

// ===================== NAVIGATION =====================
function switchTab(tab) {
    document.getElementById('sec-chat').style.display = 'none';
    document.getElementById('sec-kanban').style.display = 'none';
    document.getElementById('sec-kanban').classList.add('hidden');
    document.getElementById('sec-dashboard').style.display = 'none';
    document.getElementById('sec-dashboard').classList.add('hidden');
    document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));

    if(tab === 'chat') {
        document.getElementById('sec-chat').style.display = 'flex';
        document.getElementById('nav-chat').classList.add('active');
    } else if (tab === 'kanban') {
        document.getElementById('sec-kanban').style.display = 'flex';
        document.getElementById('sec-kanban').classList.remove('hidden');
        document.getElementById('nav-kanban').classList.add('active');
        renderizarKanban();
    } else {
        document.getElementById('sec-dashboard').style.display = 'flex';
        document.getElementById('sec-dashboard').classList.remove('hidden');
        document.getElementById('nav-dashboard').classList.add('active');
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

// ===================== UTILS =====================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const cls = type === 'success' ? 'toast-success' : type === 'info' ? 'toast-info' : 'toast-error';
    toast.className = `toast-anim toast ${cls}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3500);
}

function renderTags(tagsString) {
    if(!tagsString) return '';
    return tagsString.split(',').map(t => {
        let c = t.trim();
        if(!c) return '';
        return `<span class="tag-badge tag-${c}">${c}</span>`;
    }).join(' ');
}

function getInitials(name) {
    if(!name) return '?';
    const p = name.trim().split(' ');
    return p.length > 1 ? (p[0][0] + p[1][0]).toUpperCase() : p[0].substring(0,2).toUpperCase();
}

function getAvatarClass(name) {
    if(!name) return '';
    const colors = ['c1','c2','c3','c4','c5'];
    let hash = 0;
    for(let i=0;i<name.length;i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

function getStatusDotClass(kanban, bot) {
    if(bot) return 'dot-bot';
    const m = {'Novos':'dot-novo','Em Negociação':'dot-negociacao','Em Orçamento':'dot-negociacao','Aguardando Arte/Aprovação':'dot-arte','Em Produção':'dot-aprovada','Finalizado':'dot-fechado'};
    return m[kanban] || 'dot-default';
}

function handleKeyDown(e) {
    if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMsg(); }
}

function filtrarAba(aba, btn) {
    abaAtiva = aba;
    document.querySelectorAll('.conv-tab').forEach(t => t.classList.remove('active'));
    if(btn) btn.classList.add('active');
    renderConversas();
}

// ===================== KANBAN =====================
const kanbanCols = [
    { id: "Novos", color: "#2196F3", label: "NOVOS LEADS" },
    { id: "Em Negociação", color: "#FFC107", label: "EM NEGOCIAÇÃO" },
    { id: "Em Orçamento", color: "#FF9800", label: "EM ORÇAMENTO" },
    { id: "Aguardando Arte/Aprovação", color: "#9C27B0", label: "AGUARD. ARTE" },
    { id: "Em Produção", color: "#616161", label: "EM PRODUÇÃO" },
    { id: "Finalizado", color: "#4CAF50", label: "FINALIZADO" }
];

function renderizarKanban() {
    const container = document.getElementById('kanban-container');
    container.innerHTML = '';
    kanbanCols.forEach(col => {
        const items = todasConversas.filter(c => (c.status_kanban || 'Novos') === col.id);
        const div = document.createElement('div');
        div.className = 'kanban-col';
        div.innerHTML = `<div class="kanban-col-header" style="border-top:3px solid ${col.color};border-radius:var(--radius) var(--radius) 0 0;">
            <span>${col.label}</span>
            <span style="font-size:11px;background:var(--bg-white);padding:2px 8px;border-radius:10px;color:var(--text-mid);">${items.length}</span>
        </div>`;
        const cards = document.createElement('div');
        cards.className = 'kanban-cards-container';
        cards.ondragover = e => e.preventDefault();
        cards.ondrop = e => dropKanban(e, col.id);
        items.forEach(c => {
            const card = document.createElement('div');
            card.className = 'kanban-card';
            card.draggable = true;
            card.ondragstart = e => e.dataTransfer.setData('text/plain', c.id);
            card.onclick = () => { switchTab('chat'); abrirChat(c); };
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:4px;">
                    <span style="font-weight:600;font-size:13px;color:var(--text-dark);">${c.nome || c.telefone}</span>
                    ${c.status_bot ? '<div style="width:8px;height:8px;border-radius:50%;background:var(--whatsapp);flex-shrink:0;"></div>' : ''}
                </div>
                <div style="font-size:12px;color:var(--text-light);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px;">${c.ultima_mensagem || ''}</div>
                <div style="display:flex;gap:4px;">${renderTags(c.tags)}</div>`;
            cards.appendChild(card);
        });
        div.appendChild(cards);
        container.appendChild(div);
    });
}

async function dropKanban(e, novoStatus) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const c = todasConversas.find(x => x.id === id);
    if(c && (c.status_kanban||'Novos') !== novoStatus) {
        c.status_kanban = novoStatus;
        renderizarKanban();
        if(conversaAtual?.id === id) document.getElementById('chat-kanban-status').value = novoStatus;
        try { await fetch(`/api/conversas/${id}/kanban`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:novoStatus})}); showToast(`Movido para ${novoStatus}`,'info'); } catch(e){}
    }
}

async function alterarKanbanAtivo(s) {
    if(!conversaAtual) return;
    conversaAtual.status_kanban = s;
    try { await fetch(`/api/conversas/${conversaAtual.id}/kanban`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:s})}); showToast(`→ ${s}`,'info'); carregarConversas(); } catch(e){}
}

// ===================== TAGS =====================
function abrirModalTags() { if(!conversaAtual) return; document.getElementById('input-tags').value = conversaAtual.tags||''; document.getElementById('modal-tags').classList.add('show'); }
function fecharModalTags() { document.getElementById('modal-tags').classList.remove('show'); }
async function salvarTags() {
    const v = document.getElementById('input-tags').value;
    try { await fetch(`/api/conversas/${conversaAtual.id}/tags`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tags:v})}); conversaAtual.tags=v; document.getElementById('chat-tags-display').innerHTML=renderTags(v); fecharModalTags(); carregarConversas(); } catch(e){ showToast('Erro','error'); }
}

// ===================== CONVERSATIONS =====================
function filtrarConversas(q) {
    q = q.toLowerCase();
    document.querySelectorAll('.conv-item').forEach(item => {
        const n = item.dataset.name||'', p = item.dataset.phone||'';
        item.style.display = (n.includes(q)||p.includes(q)) ? 'flex' : 'none';
    });
}

function renderConversas() {
    const lista = document.getElementById('lista-conversas');
    lista.innerHTML = '';
    let filtered = todasConversas;
    if(abaAtiva === 'novos') filtered = todasConversas.filter(c => (c.status_kanban||'Novos') === 'Novos');
    else if(abaAtiva === 'negociacao') filtered = todasConversas.filter(c => ['Em Negociação','Em Orçamento'].includes(c.status_kanban));
    else if(abaAtiva === 'fechados') filtered = todasConversas.filter(c => c.status_kanban === 'Finalizado');

    filtered.sort((a,b) => { if((a.unreadCount||0)>0 && (b.unreadCount||0)===0) return -1; if((a.unreadCount||0)===0 && (b.unreadCount||0)>0) return 1; return new Date(b.atualizado_em)-new Date(a.atualizado_em); });

    filtered.forEach(c => {
        const div = document.createElement('div');
        const isActive = conversaAtual?.id === c.id;
        div.className = `conv-item${isActive?' active':''}`;
        div.dataset.name = (c.nome||'').toLowerCase();
        div.dataset.phone = c.telefone||'';
        div.onclick = () => abrirChat(c);
        const initials = getInitials(c.nome);
        const avClass = getAvatarClass(c.nome);
        const dotClass = getStatusDotClass(c.status_kanban, c.status_bot);
        const unread = c.unreadCount > 0 ? `<div class="unread-badge">${c.unreadCount}</div>` : '';
        const time = c.atualizado_em ? new Date(c.atualizado_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
        const prevClass = c.unreadCount > 0 ? 'conv-preview unread' : 'conv-preview';
        div.innerHTML = `
            <div class="conv-avatar ${avClass}"><span>${initials}</span><div class="status-dot ${dotClass}"></div></div>
            <div class="conv-body">
                <div class="conv-name">${c.nome||c.telefone}</div>
                <div class="${prevClass}">${c.ultima_mensagem||'...'}</div>
            </div>
            <div class="conv-meta"><span class="conv-time">${time}</span>${unread}</div>`;
        lista.appendChild(div);
    });
}

async function carregarConversas(showLoading = false) {
    const lista = document.getElementById('lista-conversas');
    if(showLoading) lista.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px;">Carregando...</div>';
    try {
        const res = await fetch('/api/conversas');
        todasConversas = await res.json();
        renderConversas();
        if(!document.getElementById('sec-kanban').classList.contains('hidden')) renderizarKanban();
    } catch(e) {}
}

async function abrirChat(c) {
    conversaAtual = c;
    document.getElementById('chat-empty').style.display = 'none';
    document.getElementById('chat-active').classList.remove('hidden');
    document.getElementById('chat-active').style.display = 'flex';
    document.getElementById('erp-area').classList.remove('hidden');
    document.getElementById('chat-nome').innerText = c.nome;
    document.getElementById('chat-telefone').innerText = `+${c.telefone}`;
    document.getElementById('chat-tags-display').innerHTML = renderTags(c.tags);
    document.getElementById('chat-kanban-status').value = c.status_kanban||'Novos';
    document.getElementById('info-nome').innerText = c.nome;
    document.getElementById('info-telefone').innerText = `+${c.telefone}`;
    document.getElementById('followup-horas').value = c.lembrete_horas||'';
    const init = getInitials(c.nome);
    const avCls = getAvatarClass(c.nome);
    document.getElementById('chat-initials').innerText = init;
    document.getElementById('chat-avatar').className = `avatar conv-avatar ${avCls}`;
    document.getElementById('info-initials').innerText = init;
    document.getElementById('info-avatar').className = `conv-avatar ${avCls}`;
    renderBotBtn();
    await carregarMensagens();
    carregarConversas();
}

function renderBotBtn() {
    const btn = document.getElementById('btn-robo');
    if(conversaAtual.status_bot) {
        btn.innerHTML = `<i data-lucide="bot-off" style="width:14px;height:14px;"></i> Pausar Bot`;
        btn.className = 'btn-bot-pause';
    } else {
        btn.innerHTML = `<i data-lucide="bot" style="width:14px;height:14px;"></i> Religar Bot`;
        btn.className = 'btn-bot-activate';
    }
    lucide.createIcons({root:btn});
}

async function alternarRobo() {
    if(!conversaAtual) return;
    const a = conversaAtual.status_bot ? 'pausar' : 'ativar';
    try {
        await fetch(`/api/conversas/${conversaAtual.id}/${a}`,{method:'POST'});
        conversaAtual.status_bot = !conversaAtual.status_bot;
        renderBotBtn(); carregarConversas();
        if(a==='ativar'){showToast('Bot ativado!','success');setTimeout(carregarMensagens,1500);}
        else showToast('Bot pausado.','info');
    } catch(e){}
}

async function excluirConversa() {
    if(!conversaAtual) return;
    if(!confirm(`Excluir conversa com ${conversaAtual.nome}?\n\nTodas as mensagens e pedidos serão apagados.`)) return;
    try {
        const r = await fetch(`/api/conversas/${conversaAtual.id}`,{method:'DELETE'});
        if(r.ok){showToast('Excluída!');conversaAtual=null;document.getElementById('chat-empty').style.display='flex';document.getElementById('chat-active').classList.add('hidden');document.getElementById('erp-area').classList.add('hidden');carregarConversas(true);}
        else showToast('Erro','error');
    } catch(e){showToast('Erro','error');}
}

async function carregarMensagens() {
    if(!conversaAtual) return;
    try {
        const res = await fetch(`/api/conversas/${conversaAtual.id}`);
        const data = await res.json();
        const h = document.getElementById('chat-historico');
        h.innerHTML = `<div id="quick-replies-popup" class="qr-popup hidden"><div style="font-size:11px;color:var(--text-muted);padding:4px 8px;font-weight:600;">Respostas Rápidas</div><div id="quick-replies-list"></div></div>`;
        
        let lastDate = '';
        data.mensagens.forEach(msg => {
            // Date separator
            const msgDate = new Date(msg.criado_em).toLocaleDateString('pt-BR');
            if(msgDate !== lastDate) {
                lastDate = msgDate;
                const today = new Date().toLocaleDateString('pt-BR');
                const yesterday = new Date(Date.now()-86400000).toLocaleDateString('pt-BR');
                const label = msgDate === today ? 'Hoje' : msgDate === yesterday ? 'Ontem' : msgDate;
                const sep = document.createElement('div');
                sep.style.cssText = 'text-align:center;margin:12px 0;';
                sep.innerHTML = `<span style="background:rgba(225,218,208,0.9);color:var(--text-mid);font-size:11px;padding:4px 14px;border-radius:6px;font-weight:500;">${label}</span>`;
                h.appendChild(sep);
            }
            const div = document.createElement('div');
            const cls = msg.origem==='cliente'?'msg-client':msg.origem==='bot'?'msg-bot':'msg-shop';
            div.className = `msg-bubble ${cls}`;
            let content = `<span>${msg.texto}</span>`;
            if(msg.mediaType==='image') content = `<div style="margin-bottom:4px;background:var(--bg-input);border-radius:6px;padding:10px;text-align:center;"><i data-lucide="image" style="width:24px;height:24px;color:var(--text-muted);"></i><div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Imagem</div></div>` + content;
            else if(msg.mediaType==='audio') content = `<div style="margin-bottom:4px;"><audio controls style="height:28px;width:180px;">Áudio</audio></div>` + content;
            else if(msg.mediaType==='document') content = `<div style="margin-bottom:4px;display:flex;align-items:center;gap:4px;background:var(--bg-input);padding:6px;border-radius:4px;"><i data-lucide="file-text" style="width:14px;height:14px;color:var(--text-muted);"></i><span style="font-size:11px;">Documento</span></div>` + content;
            const time = new Date(msg.criado_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
            const icon = msg.origem==='bot'?' 🤖':msg.origem==='loja'?' ✓✓':'';
            content += `<div class="msg-time" style="text-align:${msg.origem==='cliente'?'left':'right'};">${time}${icon}</div>`;
            div.innerHTML = content;
            h.appendChild(div);
        });
        lucide.createIcons({root:h});
        h.scrollTop = h.scrollHeight;
        renderPedidos(data.pedidos);
    } catch(e){}
}

// ===================== AUTOMATION =====================
function toggleAgendar() { const i=document.getElementById('input-agendar'); i.classList.contains('hidden')?i.classList.remove('hidden'):(i.classList.add('hidden'),i.value=''); }

async function salvarFollowUp() {
    if(!conversaAtual) return;
    const v = document.getElementById('followup-horas').value;
    try { await fetch(`/api/conversas/${conversaAtual.id}/followup`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({horas:v})}); showToast(v?`Cobrança em ${v}h`:'Cancelada','info'); carregarConversas(); } catch(e){}
}

async function enviarMsg(isQR = false) {
    const input = document.getElementById('input-msg');
    const dateInput = document.getElementById('input-agendar');
    const texto = input.value.trim();
    if(!texto || !conversaAtual) return;
    input.value = '';
    fecharQuickReply();
    if(dateInput && dateInput.value && !dateInput.classList.contains('hidden')) {
        try { await fetch(`/api/conversas/${conversaAtual.id}/agendar`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texto,dataStr:dateInput.value})}); showToast('Agendada!'); dateInput.classList.add('hidden'); dateInput.value=''; } catch(e){ showToast('Erro','error'); } return;
    }
    const h = document.getElementById('chat-historico');
    const p = document.createElement('div'); p.className='msg-bubble msg-shop'; p.style.opacity='0.5'; p.innerHTML=`<span>${texto}</span>`; h.appendChild(p); h.scrollTop=h.scrollHeight;
    try {
        const r = await fetch(`/api/conversas/${conversaAtual.id}/enviar`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texto,is_quick_reply:isQR})});
        if(r.ok){if(!isQR)conversaAtual.status_bot=false;renderBotBtn();carregarConversas();setTimeout(carregarMensagens,500);} else showToast('Erro','error');
    } catch(e){}
}

// ===================== QUICK REPLIES =====================
function checarQuickReply(v) {
    const popup = document.getElementById('quick-replies-popup');
    if(v==='/'){popup.classList.remove('hidden');renderListaQuickReplies(true);}
    else if(v.startsWith('/')&&v.length>1){popup.classList.remove('hidden');renderListaQuickReplies(true,v.toLowerCase());}
    else fecharQuickReply();
}
function fecharQuickReply(){document.getElementById('quick-replies-popup')?.classList.add('hidden');}

async function carregarQuickReplies() {
    try { const r=await fetch('/api/respostas'); respostasRapidas=await r.json(); if(!respostasRapidas.length) respostasRapidas=[{atalho:'/pix',texto:'CNPJ: 34.037.253/0001-51'},{atalho:'/prazo',texto:'4 a 8 dias úteis.'}]; renderListaQuickReplies(false); } catch(e){}
}

function renderListaQuickReplies(forPopup, filter='') {
    const l = document.getElementById(forPopup?'quick-replies-list':'side-respostas-list');
    if(!l)return; l.innerHTML='';
    let items = filter ? respostasRapidas.filter(q=>q.atalho.includes(filter)) : respostasRapidas;
    items.forEach(q => {
        const div = document.createElement('div');
        if(forPopup){
            div.className='qr-item';
            div.innerHTML=`<span class="qr-cmd">${q.atalho}</span><span class="qr-preview">${q.texto.substring(0,40)}...</span>`;
        } else {
            div.style.cssText='padding:10px;background:var(--bg-input);border:1px solid var(--border-light);border-radius:var(--radius-sm);cursor:pointer;transition:all 0.15s;';
            div.innerHTML=`<div style="font-weight:700;color:var(--action);font-size:13px;margin-bottom:3px;">${q.atalho}</div><div style="font-size:12px;color:var(--text-light);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${q.texto}</div>`;
            div.onmouseover=()=>{div.style.borderColor='var(--action)';div.style.background='#FFF';};
            div.onmouseout=()=>{div.style.borderColor='var(--border-light)';div.style.background='var(--bg-input)';};
        }
        div.onclick=()=>{document.getElementById('input-msg').value=q.atalho;fecharQuickReply();enviarMsg(true);};
        l.appendChild(div);
    });
}

async function novaRespostaRapida() {
    const a=prompt("Atalho. Ex: /boasvindas"); if(!a)return;
    const t=prompt("Texto da mensagem:"); if(!t)return;
    try{const r=await fetch('/api/respostas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({atalho:a,texto:t})}); if(r.ok){showToast('Criado!');carregarQuickReplies();}}catch(e){}
}

// ===================== UPLOAD =====================
async function uploadArquivo() {
    const input=document.getElementById('file-uploader');
    if(!input.files||!input.files.length||!conversaAtual)return;
    const fd=new FormData();fd.append('file',input.files[0]);fd.append('caption','Anexo');
    document.getElementById('modal-upload').classList.add('show');
    try{const r=await fetch(`/api/conversas/${conversaAtual.id}/enviar-midia`,{method:'POST',body:fd});if(r.ok){showToast('Enviado!');input.value='';setTimeout(carregarMensagens,1000);}else showToast('Falha','error');}catch(e){showToast('Erro','error');}
    document.getElementById('modal-upload').classList.remove('show');
}

// ===================== ERP =====================
async function salvarPedido() {
    if(!conversaAtual)return;
    const b={quantidade:document.getElementById('ped-qtd').value,tamanho:document.getElementById('ped-tamanho').value,cor:document.getElementById('ped-cor').value,local_estampa:document.getElementById('ped-estampa').value,valor_total:document.getElementById('ped-valor').value,sinal_pago:document.getElementById('ped-sinal').value,status:document.getElementById('ped-status').value};
    if(!b.valor_total)return showToast('Preencha o valor!','error');
    try{const r=await fetch(`/api/conversas/${conversaAtual.id}/pedidos`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});if(r.ok){showToast('Pedido salvo!');carregarMensagens();}}catch(e){showToast('Erro','error');}
}

function renderPedidos(pedidos) {
    const l=document.getElementById('lista-pedidos'); l.innerHTML='';
    if(!pedidos.length){l.innerHTML='<p style="font-size:12px;color:var(--text-muted);">Nenhum pedido.</p>';return;}
    pedidos.forEach(p=>{
        const colors={'Pronto':'#4CAF50','Em Produção':'#2196F3','Finalizado':'#4CAF50','Pendente':'#FFC107'};
        const c=colors[p.status]||'#999';
        l.innerHTML+=`<div style="background:var(--bg-white);border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:12px;font-size:13px;box-shadow:var(--shadow-card);">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid var(--border-light);">
                <span style="font-weight:600;color:var(--text-dark);">#${p.id.split('-')[0]}</span>
                <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${c}15;color:${c};font-weight:600;">${p.status}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;font-size:12px;color:var(--text-light);">
                <p>Qtd: <b style="color:var(--text-dark);">${p.quantidade}</b></p>
                <p>Tam: <b style="color:var(--text-dark);">${p.tamanho}</b></p>
            </div></div>`;
    });
}

// ===================== DASHBOARD =====================
let chartVol=null, chartKan=null;
async function carregarDashboard() {
    try {
        const r=await fetch('/api/dashboard/stats'); const d=await r.json();
        document.getElementById('dash-avg').innerText=d.avgResponse;
        let t=0; const lK=Object.keys(d.kanbanDist), dK=Object.values(d.kanbanDist); dK.forEach(v=>t+=v);
        document.getElementById('dash-total').innerText=t;
        const ctx1=document.getElementById('chart-kanban').getContext('2d');
        if(chartKan)chartKan.destroy();
        chartKan=new Chart(ctx1,{type:'doughnut',data:{labels:lK,datasets:[{data:dK,backgroundColor:['#2196F3','#FFC107','#9C27B0','#4CAF50','#E94560']}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:'#666',font:{family:'Inter'}}}}}});
        const lV=Object.keys(d.leadsPorDia).sort(), dV=lV.map(l=>d.leadsPorDia[l]);
        const ctx2=document.getElementById('chart-volume').getContext('2d');
        if(chartVol)chartVol.destroy();
        chartVol=new Chart(ctx2,{type:'bar',data:{labels:lV,datasets:[{label:'Contatos',data:dV,backgroundColor:'#E94560',borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{ticks:{color:'#888'},grid:{display:false}},y:{ticks:{color:'#888'},grid:{color:'#EEE'}}},plugins:{legend:{display:false}}}});
    } catch(e){}
}

// ===================== INIT =====================
carregarQuickReplies();
carregarConversas(true);
setInterval(()=>{carregarConversas(false);if(conversaAtual)carregarMensagens();},8000);
