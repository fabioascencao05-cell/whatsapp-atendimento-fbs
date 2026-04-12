const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const axios = require('axios');
const multer = require('multer');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { OpenAI } = require("openai");
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');
const jwt = require('jsonwebtoken'); 
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'fbs-camisetas-seguro-2024';
const prisma = new PrismaClient();
const upload = multer();

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

app.use(express.static(path.join(__dirname, 'cloned_frontend/dist')));
app.use(express.static(path.join(__dirname, 'public')));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "no_key");

app.post('/api/admin/migrate-all', async (req, res) => {
    try {
        const result = await prisma.conversa.updateMany({
            data: { status_kanban: 'Novos', status_bot: true }
        });
        res.json({ message: `${result.count} contatos movidos para Novos e IA ativada.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

let openai = null;
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else {
    console.log('⚠️ OPENAI_API_KEY não encontrada. ChatGPT desativado.');
}

const recentSystemMessages = new Map();

// ==========================================
// FUNÇÃO DE INTELIGÊNCIA ARTIFICIAL (DEISE)
// ==========================================
async function processarIA(remoteJid, textoDaMensagem) {
    console.log(`🤖 Iniciando resposta via GPT para: ${remoteJid}`);
    try {
        const conversa = await prisma.conversa.findUnique({ where: { id: remoteJid } });
        if (!conversa || !conversa.status_bot) {
            console.log('🛑 Bot ignorado para esta conversa.');
            return;
        }
        const historico = await prisma.mensagem.findMany({
            where: { conversaId: remoteJid },
            orderBy: { criado_em: 'desc' },
            take: 10
        });
        const historicoOrdenado = historico.reverse();
        console.log(`📜 Histórico: ${historicoOrdenado.length} msgs`);
        historicoOrdenado.forEach(m => console.log(`  [${m.origem}]: ${m.texto}`));
        const systemPrompt = `[IDENTIDADE E COMPORTAMENTO]
Você é Deise, atendente da FBS Camisetas (Mauá - SP).
Você é uma pessoa real da equipe.
É PROIBIDO dizer que é robô, IA ou assistente virtual.
Se perguntarem se você é robô, negue naturalmente.
Exemplo: "Não, sou a Deise mesmo 😊 tô aqui pra te ajudar!"

Seu estilo:
- Frases curtas
- Linguagem simples e natural (WhatsApp)
- No máximo 1 emoji por mensagem
- Sem parecer script ou atendimento automático
- Nunca use listas, tópicos ou formatação de texto
- Escreva como se estivesse digitando no WhatsApp

[OBJETIVO PRINCIPAL]
Coletar 3 informações essenciais antes de passar para o humano:
1. Nome do cliente
2. Quantidade de camisetas
3. Cor desejada
Conduza a conversa de forma leve e natural até conseguir essas 3 informações.

[REGRAS DE SEGURANÇA]
NUNCA:
- Informar preços ou valores
- Inventar valores ou estimativas
- Negociar ou finalizar venda
- Confirmar prazo diferente do padrão
- Inventar cores ou modelos que não existem na grade
PRAZOS: Sempre informar "de 4 a 8 dias úteis"

[MODELOS DISPONÍVEIS]
Camiseta Algodão (masculina): Mais confortável, melhor qualidade de impressão, mais opções de cores.
Baby Look Algodão (feminina): Mesmo modelo do algodão porém feminino, mesmas cores, mais ajustada.
Camiseta Infantil (algodão): Disponível do tamanho 0 ao 16, mesmas cores do algodão, masculina e feminina.
Malha Fria (masculina): Mais leve, mais econômica, menos opções de cores.
Oversized (unissex): Modelo amplo e moderno, ideal para estampas grandes. Cores: Preto, Azul, Off White, Branco.
Polo Piquet Masculina: Modelo social masculino, ideal para uso empresarial, mesmas cores do algodão.
Polo Piquet Feminina: Modelo social feminino, ideal para uso empresarial, mesmas cores do algodão.

[CORES DISPONÍVEIS]
ALGODÃO, BABY LOOK, INFANTIL e POLO PIQUET (17 cores):
Branco, Preto, Cinza Mescla, Cinza Chumbo, Azul Royal, Azul Marinho, Azul Turquesa, Verde Bandeira, Verde Musgo, Vermelho, Bordô, Rosa Claro, Rosa Pink, Amarelo, Laranja, Roxo, Bege.
OVERSIZED (4 cores): Preto, Azul, Off White, Branco.
MALHA FRIA (4 cores): Branco, Preto, Azul Marinho, Grafite.
NUNCA inventar cor fora da grade.

[TAMANHOS]
Adulto (algodão, baby look, malha fria, oversized, polo): P, M, G, GG, XGG.
Infantil: 0, 2, 4, 6, 8, 10, 12, 14, 16.

[MEMÓRIA PERSISTENTE]
Manter memória ativa de tudo que o cliente já informou:
- Nome, modelo, quantidade, cor, tamanho, prazo, objeções, se orçamento já foi enviado, etapa atual, última intenção.
REGRAS: Nunca perguntar algo já respondido. Nunca sobrescrever info útil. Priorizar info mais recente em conflito. Se o cliente voltar depois de um tempo, retomar de onde parou.

[SITUAÇÕES COMUNS]
Pergunta preço: "Os valores variam por quantidade e modelo 😊 me passa a quantidade e a cor que eu encaminho pro setor de orçamentos!"
Pergunta prazo: "Nosso prazo padrão é de 4 a 8 dias úteis após aprovação da arte 👍"
Pergunta arte/estampa: "Pode mandar a arte que você tem! Se precisar de ajuda com o layout nosso time também pode ajudar 😊"
Demonstra urgência: "Entendo! Me passa a quantidade e a cor que eu já encaminho com urgência 👍"
Some e volta: "Oi! Conseguiu pensar? Me passa as informações que te encaminho rapidinho 😊"
Pergunta se é robô: "Não, sou a Deise mesmo 😊 tô aqui pra te ajudar!"
Pede desconto: "Os valores já são bem competitivos, mas quanto maior a quantidade melhor fica 😊 me passa a quantidade certinha que eu encaminho pro orçamento!"
Manda foto de arte: "Recebi a arte 😊 me confirma a quantidade e a cor que já encaminho tudo junto!"
Pergunta modelo: "Temos algodão, baby look, infantil, malha fria, oversized e polo piquet 😊 qual você prefere?"
Pergunta tamanho adulto: "Trabalhamos com P, M, G, GG e XGG 👍 você já sabe os tamanhos que vai precisar?"
Pergunta tamanho infantil: "Temos infantil do 0 ao 16 😊 qual tamanho você vai precisar?"

[CONDUÇÃO DA CONVERSA]
Ordem natural:
1. Cumprimentar e entender o objetivo
2. Perguntar modelo se necessário
3. Perguntar quantidade
4. Perguntar cor
5. Pegar nome se ainda não tiver
6. Finalizar e encaminhar

[FINALIZAÇÃO OBRIGATÓRIA]
Quando tiver Nome + Quantidade + Cor, encerrar EXATAMENTE assim:
"Perfeito, [Nome]! Já anotei tudo aqui:
📦 Quantidade: [X]
🎨 Cor: [X]
Vou encaminhar pro setor de orçamentos agora. Em breve eles te chamam com os valores certinhos. Só aguardar! 😊"
APÓS FINALIZAR: NÃO continuar conversando, NÃO inventar assunto, NÃO responder além do necessário. Aguardar humano assumir.

[REGRA CRÍTICA — IA x HUMANO]
Se o contexto indicar que orçamento já foi enviado, humano já assumiu, ou lead está em negociação avançada:
NÃO envie novos preços, NÃO tente fechar, NÃO interfira. Apenas responda dúvidas simples se necessário.`;
        const contexto = [
            { role: "system", content: systemPrompt },
            ...historicoOrdenado.map(msg => ({
                role: msg.origem === 'bot' ? 'assistant' : 'user',
                content: msg.texto || ''
            })),
            { role: "user", content: textoDaMensagem }
        ];
        let respostaIA = "";
        if (openai) {
            try {
                const completion = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: contexto,
                    max_tokens: 400,
                    temperature: 0.7
                });
                respostaIA = completion.choices[0].message.content;
            } catch (openaiErr) {
                console.error('❌ Erro OpenAI, tentando Gemini...', openaiErr.message);
                if (process.env.GEMINI_API_KEY) {
                    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                    const result = await model.generateContent(
                        contexto.map(m => `${m.role}: ${m.content}`).join('\n')
                    );
                    respostaIA = result.response.text();
                }
            }
        }
        if (respostaIA) {
            console.log(`✅ Deise Respondeu: ${respostaIA}`);
            await enviarMensagemEvolution(remoteJid.split('@')[0], respostaIA);
            const msgSalva = await prisma.mensagem.create({
                data: { conversaId: remoteJid, texto: respostaIA, origem: 'bot' }
            });
            console.log(`💾 Salvo no banco: ID ${msgSalva.id}`);
            recentSystemMessages.set(remoteJid.split('@')[0], Date.now());
        }
    } catch (err) {
        console.error('❌ Erro Crítico IA/Evolution:', err.message);
    }
}

const enviarMensagemEvolution = async (number, text) => {
    try {
        const url = `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`;
        await axios.post(url, { number, text }, {
            headers: { 'apikey': process.env.EVOLUTION_API_KEY }
        });
    } catch (err) { console.error('Erro Evolution:', err.message); }
};

// ==========================================
// WEBHOOK
// ==========================================
app.post('/api/webhook', async (req, res) => {
    const data = req.body;
    if (!data.data || !data.data.key) return res.sendStatus(200);

    const remoteJid = data.data.key.remoteJid;
    const isFromMe = data.data.key.fromMe;
    const number = remoteJid.split('@')[0];
    const pushName = data.data.pushName || 'Cliente';

    if (remoteJid.includes('@g.us')) return res.sendStatus(200); // Ignora grupos

    let texto = "";
    if (data.data.message?.conversation) texto = data.data.message.conversation;
    else if (data.data.message?.extendedTextMessage?.text) texto = data.data.message.extendedTextMessage.text;
    else if (data.data.message?.imageMessage?.caption) texto = data.data.message.imageMessage.caption;
    else if (data.data.message?.videoMessage?.caption) texto = data.data.message.videoMessage.caption;

    let mediaType = null;
    if (data.data.message?.imageMessage) mediaType = 'image';
    else if (data.data.message?.videoMessage) mediaType = 'video';
    else if (data.data.message?.audioMessage) mediaType = 'audio';
    else if (data.data.message?.documentMessage) mediaType = 'document';

    // Se for mensagem enviada pelo humano, silencia a Deise
    if (isFromMe) {
        await prisma.conversa.upsert({
            where: { id: remoteJid },
            update: { assumido_por: 'humano', ultima_mensagem: texto || `[Arquivo ${mediaType}]`, atualizado_em: new Date() },
            create: { id: remoteJid, nome: pushName, telefone: number, ultima_mensagem: texto || `[Arquivo ${mediaType}]`, assumido_por: 'humano' }
        });
        if (texto || mediaType) {
            await prisma.mensagem.create({
                data: { conversaId: remoteJid, texto: texto || '', mediaType, origem: 'loja' }
            });
        }
        return res.sendStatus(200);
    }

    const conversa = await prisma.conversa.upsert({
        where: { id: remoteJid },
        update: { nome: pushName, ultima_mensagem: texto || `[Arquivo ${mediaType}]`, atualizado_em: new Date() },
        create: { id: remoteJid, nome: pushName, telefone: number, ultima_mensagem: texto || `[Arquivo ${mediaType}]` }
    });

    if (texto || mediaType) {
        await prisma.mensagem.create({
            data: { conversaId: remoteJid, texto: texto || '', mediaType, origem: 'cliente' }
        });
    }

    // Deise só responde se: bot ON + estágio Novos + sem humano assumido
    if (texto && conversa.status_bot && conversa.status_kanban === 'Novos' && !conversa.assumido_por) {
        setTimeout(() => processarIA(remoteJid, texto), 2000);
    } else {
        console.log(`⏸️ IA pausada (Kanban: ${conversa.status_kanban} | Assumido: ${conversa.assumido_por || 'ninguém'})`);
    }

    res.sendStatus(200);
});

// ==========================================
// ROTAS DA DASHBOARD
// ==========================================

// ⚠️ ROTA DE SOFT DELETE (Lixeira)
app.post('/api/conversas/delete', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "ID não fornecido" });
    console.log(`🗑️ Soft delete conversa: ${id}`);
    try {
        await prisma.conversa.update({
            where: { id },
            data: { deleted_at: new Date(), deleted_by: 'operador' }
        });
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Erro ao excluir:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Restaurar da lixeira
app.post('/api/conversas/restaurar', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "ID não fornecido" });
    try {
        await prisma.conversa.update({
            where: { id },
            data: { deleted_at: null, deleted_by: null }
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Exclusão definitiva
app.post('/api/conversas/delete-permanente', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "ID não fornecido" });
    console.log(`💀 Exclusão PERMANENTE: ${id}`);
    try {
        await prisma.conversa.update({
            where: { id },
            data: { etiquetas: { set: [] } }
        });
        await prisma.mensagem.deleteMany({ where: { conversaId: id } });
        await prisma.conversa.delete({ where: { id } });
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Erro ao excluir permanentemente:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Listar lixeira
app.get('/api/conversas/lixeira', async (req, res) => {
    try {
        const conversas = await prisma.conversa.findMany({
            where: { deleted_at: { not: null } },
            include: { etiquetas: true },
            orderBy: { deleted_at: 'desc' }
        });
        res.json(conversas);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Listar conversas ativas (exclui soft deleted)
app.get('/api/conversas', async (req, res) => {
    try {
        const conversas = await prisma.conversa.findMany({
            where: { deleted_at: null },
            include: { etiquetas: true },
            orderBy: { atualizado_em: 'desc' }
        });
        res.json(conversas);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/conversas/:id', async (req, res) => {
    try {
        const conversa = await prisma.conversa.findUnique({
            where: { id: req.params.id },
            include: { etiquetas: true }
        });
        if (!conversa) return res.status(404).json({ error: "Conversa não encontrada" });
        
        const mensagens = await prisma.mensagem.findMany({
            where: { conversaId: req.params.id },
            orderBy: { criado_em: 'asc' }
        });
        
        res.json({ conversa, mensagens, pedidos: [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/conversas/:id/mensagens', async (req, res) => {
    try {
        const mensagens = await prisma.mensagem.findMany({
            where: { conversaId: req.params.id },
            orderBy: { criado_em: 'asc' }
        });
        res.json(mensagens);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/conversas/:id/enviar', async (req, res) => {
    const { id } = req.params;
    const { texto } = req.body;
    try {
        await enviarMensagemEvolution(id.split('@')[0], texto);
        const msg = await prisma.mensagem.create({
            data: { conversaId: id, texto, origem: 'loja' }
        });
        // Marca como assumido por humano
        await prisma.conversa.update({
            where: { id },
            data: { assumido_por: 'humano', atualizado_em: new Date() }
        });
        res.json(msg);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Pausar Bot (rota que o frontend espera)
app.post('/api/conversas/:id/pausar', async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.conversa.update({ where: { id }, data: { status_bot: false, assumido_por: 'humano' } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Ativar Bot (rota que o frontend espera)
app.post('/api/conversas/:id/ativar', async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.conversa.update({ where: { id }, data: { status_bot: true, assumido_por: null } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Editar dados do cliente
app.post('/api/conversas/:id/editar', async (req, res) => {
    const { id } = req.params;
    const { nome, telefone } = req.body;
    try {
        const data = {};
        if (nome) data.nome = nome;
        if (telefone) data.telefone = telefone;
        await prisma.conversa.update({ where: { id }, data });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Toggle genérico de bot (mantido por compatibilidade)
app.post('/api/conversas/:id/bot', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        await prisma.conversa.update({ where: { id }, data: { status_bot: status } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/conversas/:id/kanban', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        await prisma.conversa.update({ where: { id }, data: { status_kanban: status } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/conversas/:id/valor', async (req, res) => {
    const { id } = req.params;
    const { valor } = req.body;
    try {
        await prisma.conversa.update({ where: { id }, data: { valor_conversa: valor } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Tags do painel lateral
app.post('/api/conversas/:id/tags', async (req, res) => {
    const { id } = req.params;
    const { tags } = req.body;
    try {
        await prisma.conversa.update({ where: { id }, data: { tags } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/conversas/:id/etiquetas', async (req, res) => {
    const { id } = req.params;
    const { etiquetaIds } = req.body;
    try {
        await prisma.conversa.update({
            where: { id },
            data: { etiquetas: { set: etiquetaIds.map(eid => ({ id: parseInt(eid) })) } }
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Reativar Deise para uma conversa
app.post('/api/conversas/:id/reativar-bot', async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.conversa.update({
            where: { id },
            data: { assumido_por: null, status_bot: true, status_kanban: 'Novos' }
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/etiquetas', async (req, res) => {
    const etiquetas = await prisma.etiqueta.findMany();
    res.json(etiquetas);
});

app.post('/api/etiquetas', async (req, res) => {
    const etiqueta = await prisma.etiqueta.create({ data: req.body });
    res.json(etiqueta);
});

app.delete('/api/etiquetas/:id', async (req, res) => {
    await prisma.etiqueta.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true });
});

app.get('/api/respostas', async (req, res) => {
    const respostas = await prisma.respostaRapida.findMany();
    res.json(respostas);
});

app.post('/api/respostas', async (req, res) => {
    const resposta = await prisma.respostaRapida.create({ data: req.body });
    res.json(resposta);
});

app.delete('/api/respostas/:id', async (req, res) => {
    await prisma.respostaRapida.delete({ where: { id: req.params.id } });
    res.json({ success: true });
});

// Stats - disponível em AMBAS as URLs para compatibilidade
app.get('/api/stats', async (req, res) => {
    try {
        const totalLeads = await prisma.conversa.count({ where: { deleted_at: null } });
        const faturamentoTotal = await prisma.conversa.aggregate({ 
            where: { deleted_at: null },
            _sum: { valor_conversa: true } 
        });
        const leadsPorEtapa = await prisma.conversa.groupBy({
            by: ['status_kanban'],
            where: { deleted_at: null },
            _count: { id: true }
        });
        res.json({
            totalLeads,
            faturamento: faturamentoTotal._sum.valor_conversa || 0,
            leadsPorEtapa
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Alias para o frontend que chama /api/dashboard/stats
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const totalLeads = await prisma.conversa.count({ where: { deleted_at: null } });
        const faturamentoTotal = await prisma.conversa.aggregate({
            where: { deleted_at: null },
            _sum: { valor_conversa: true }
        });
        const leadsPorEtapa = await prisma.conversa.groupBy({
            by: ['status_kanban'],
            where: { deleted_at: null },
            _count: { id: true }
        });
        res.json({
            totalLeads,
            faturamento: faturamentoTotal._sum.valor_conversa || 0,
            leadsPorEtapa
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/proxy-media', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.sendStatus(400);
    try {
        const response = await axios({ url, method: 'GET', responseType: 'stream', headers: { 'apikey': process.env.EVOLUTION_API_KEY } });
        response.data.pipe(res);
    } catch (err) { res.sendStatus(404); }
});

app.post('/api/sync', async (req, res) => {
    console.log('🔄 Iniciando sincronização de fotos...');
    try {
        const conversas = await prisma.conversa.findMany({
            where: { profile_pic_url: null, deleted_at: null }
        });
        
        let atualizadas = 0;
        
        for (const c of conversas) {
            try {
                const url = `${process.env.EVOLUTION_API_URL}/chat/fetchProfilePictureUrl/${process.env.EVOLUTION_INSTANCE}`;
                const response = await axios.post(url, { number: c.id }, {
                    headers: { 'apikey': process.env.EVOLUTION_API_KEY }
                });
                
                if (response.data && response.data.profilePictureUrl) {
                    await prisma.conversa.update({
                        where: { id: c.id },
                        data: { profile_pic_url: response.data.profilePictureUrl }
                    });
                    atualizadas++;
                }
            } catch (err) {
                // Ignore errors for individual fetch
            }
        }
        
        res.json({ message: `Sincronização concluída! ${atualizadas} fotos atualizadas.` });
    } catch (err) {
        console.error('❌ Erro na sincronização:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// DISPARO EM MASSA (BROADCAST)
// ==========================================
app.post('/api/broadcast', async (req, res) => {
    const { ids, texto } = req.body;
    if (!ids || !ids.length || !texto) return res.status(400).json({ error: "IDs e texto são obrigatórios" });
    
    console.log(`📡 Disparo em massa para ${ids.length} contatos`);
    
    let enviados = 0;
    let falhas = 0;
    
    // Disparo com intervalo de 3-5 segundos entre cada envio
    for (const id of ids) {
        try {
            const number = id.split('@')[0];
            await enviarMensagemEvolution(number, texto);
            await prisma.mensagem.create({
                data: { conversaId: id, texto, origem: 'loja' }
            });
            enviados++;
        } catch (err) {
            console.error(`❌ Falha ao enviar para ${id}:`, err.message);
            falhas++;
        }
        // Rate limiting: espera entre 3 e 5 segundos entre cada mensagem
        await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));
    }
    
    res.json({ message: `Disparo concluído! ${enviados} enviados, ${falhas} falhas.` });
});

// ==========================================
// CRON: FOLLOW-UP AUTOMÁTICO
// ==========================================
cron.schedule('0 * * * *', async () => {
    console.log('⏰ Rodando verificação de Follow-up...');
    try {
        const agora = new Date();
        const etiquetasComFollowup = await prisma.etiqueta.findMany({
            where: { followup_texto: { not: null }, followup_horas: { not: null } }
        });
        for (const etiqueta of etiquetasComFollowup) {
            const conversas = await prisma.conversa.findMany({
                where: {
                    etiquetas: { some: { id: etiqueta.id } },
                    atualizado_em: { lte: new Date(agora.getTime() - etiqueta.followup_horas * 60 * 60 * 1000) }
                }
            });
            for (const lead of conversas) {
                await enviarMensagemEvolution(lead.telefone, etiqueta.followup_texto);
                await prisma.mensagem.create({
                    data: { conversaId: lead.id, texto: etiqueta.followup_texto, origem: 'bot' }
                });
                await prisma.conversa.update({
                    where: { id: lead.id },
                    data: { atualizado_em: new Date() }
                });
                console.log(`✅ Follow-up enviado para: ${lead.nome}`);
            }
        }
    } catch (err) {
        console.error('❌ Erro no Follow-up:', err.message);
    }
}, { timezone: "America/Sao_Paulo" });

// SPA Fallback
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'cloned_frontend/dist', 'index.html'), (err) => {
            if (err) {
                res.sendFile(path.join(__dirname, 'public', 'index.html'), (err2) => {
                    if (err2) res.status(404).send('Página não encontrada');
                });
            }
        });
    } else {
        res.status(404).json({ error: 'Endpoint não encontrado' });
    }
});

app.listen(3000, () => console.log('🚀 FBS CRM rodando na porta 3000'));
