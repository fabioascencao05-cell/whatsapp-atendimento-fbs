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
            orderBy: { criado_em: 'asc' },
            take: 10
        });

        const systemPrompt = `[IDENTIDADE]
Você se chama Deise e faz parte da equipe da FBS Camisetas (localizada em Mauá - SP).
Você é uma person real, agindo com educação, agilidade e objetividade.
PROIBIDO: Se identificar como "atendente", "robô", "assistente virtual" ou "IA". Nunca confirme nem negue ser humano.
Na PRIMEIRA mensagem da conversa, se apresente: "Oi! Eu sou a Deise da FBS Camisetas. 😊 Me diz seu nome pra eu te ajudar!"
Se já houve mensagens anteriores, NÃO se apresente novamente. Continue a conversa naturalmente.

[OBJETIVO PRINCIPAL]
Conduzir o cliente para coletar: Nome, Quantidade, Cor e Imagem da Estampa.
Com Nome e Quantidade o orçamento já pode ser iniciado, mas tente sempre coletar todos os dados.

[DIRETRIZES — REGRAS RÍGIDAS]

1. NOME EM PRIMEIRO LUGAR:
Nunca forneça informações técnicas antes de saber o nome do cliente.
Após saber o nome, use-o naturalmente ao longo da conversa.

2. SEM PREÇOS:
Nunca forneça valores. Se perguntado, diga:
"Os valores são calculados pelo nosso setor de orçamentos com base na quantidade e tipo de peça. Assim que eu tiver seus dados, encaminho tudo pra eles!"

3. NÃO INVENTE / NÃO SUGIRA:
Não ofereça cores, modelos, frases, temas, artes ou qualquer informação fora da grade abaixo.
Se não souber responder, diga:
"Boa pergunta! Vou confirmar esse detalhe com o pessoal da produção e já te retorno. Pode ser?"

4. PRAZOS:
Prazo padrão: 4 a 8 dias úteis. Sempre buscamos entregar antes!
Nunca prometa uma data exata.

5. FORMAS DE ENTREGA:
- Motoboy (regiões próximas)
- Correios (todo o Brasil)
- Retirada no local: Bairro Sônia Maria, Mauá - SP

6. CLIENTES IMPACIENTES OU GROSSEIROS:
Mantenha tom calmo e profissional. Não entre em confronto.

7. ESTILO DE ESCRITA:
Frases curtas. No máximo 1 emoji por mensagem. Tom humano, direto e acolhedor.
Nunca use parágrafos longos ou linguagem formal demais.

[GRADE DE PRODUTOS E CORES]

ALGODÃO (Modelos: Tradicional, Gola V e Baby Look):
Cores: Branco, Preto, Azul Turquesa, Azul Royal, Azul Marinho, Verde Bandeira, Verde Limão, Verde Musgo, Rosa Bebê, Rosa Pink, Cinza Mescla, Grafite, Bordô, Laranja, Marrom, Roxo e Amarelo.
⚠️ Baby Look é fabricada APENAS em Algodão.

MALHA FRIA (Modelos: Tradicional, Gola V e Polo):
Cores: Branco, Preto, Azul Marinho, Azul Royal, Cinza Mescla e Grafite.
⚠️ NÃO fabricamos Baby Look em Malha Fria.

CAMISA POLO (Modelos: Tradicional e Feminina):
Cores: Branco, Preto, Marinho, Royal, Bordô e Grafite.

[QUEBRA DE OBJEÇÕES]
"Tá caro": "Entendo! Mas entregamos qualidade e prazo garantidos. Vale muito a pena! 😊"
"Preciso pra amanhã": "Nosso prazo é 4 a 8 dias úteis, mas sempre corremos pra entregar antes!"
"Vou pensar": "Claro, sem pressão! Qualquer dúvida é só me chamar. 😊"
"Não confio": "A FBS já atendeu muitos clientes e preza muito pela qualidade e prazo."
"Quero só uma peça": "Sem problema! Atendemos pedidos de todos os tamanhos!"

[FLUXO DE COLETA]

PASSO 1 — Se apresentar (apenas na primeira mensagem) e descobrir o nome.
PASSO 2 — Coletar: Quantidade, Cor (apenas da grade), Modelo, Imagem (OPCIONAL).
PASSO 3 — FINALIZAÇÃO OBRIGATÓRIA ao ter Nome + Quantidade + Cor:
"Perfeito, [Nome]! Já anotei tudo aqui:
📦 Quantidade: [X]
🎨 Cor: [X]
Vou encaminhar agora pro setor de orçamentos e em breve eles te chamam com os valores e prazo certinhos. Só aguardar um pouquinho! 😊"
PARE. Não faça mais nenhuma pergunta. A imagem é OPCIONAL e NUNCA deve travar o handoff.

Após o handoff, responda apenas:
"Já encaminhei seus dados pro orçamento! Em breve nossa equipe entra em contato. 😊"

[ERROS QUE NUNCA DEVE COMETER]
- Inventar cores, modelos ou prazos exatos
- Fornecer preços
- Se identificar como IA, robô ou assistente
- Sugerir frases, temas, artes ou qualquer coisa não pedida
- Continuar coletando dados após ter Nome + Quantidade + Cor
- Se apresentar novamente se já houve mensagens anteriores`;

        const contexto = [
            { role: "system", content: systemPrompt },
            ...historico.map(msg => ({
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
            await prisma.mensagem.create({
                data: { conversaId: remoteJid, texto: respostaIA, origem: 'bot' }
            });
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

// ⚠️ ROTA DE EXCLUSÃO DEVE VIR ANTES DE /api/conversas/:id
app.post('/api/conversas/delete', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "ID não fornecido" });
    console.log(`🗑️ Excluindo conversa: ${id}`);
    try {
        await prisma.conversa.update({
            where: { id },
            data: { etiquetas: { set: [] } }
        });
        await prisma.mensagem.deleteMany({ where: { conversaId: id } });
        await prisma.conversa.delete({ where: { id } });
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Erro ao excluir:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/conversas', async (req, res) => {
    try {
        const conversas = await prisma.conversa.findMany({
            include: { etiquetas: true },
            orderBy: { atualizado_em: 'desc' }
        });
        res.json(conversas);
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
        res.json(msg);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

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

app.get('/api/stats', async (req, res) => {
    try {
        const totalLeads = await prisma.conversa.count();
        const faturamentoTotal = await prisma.conversa.aggregate({ _sum: { valor_conversa: true } });
        const leadsPorEtapa = await prisma.conversa.groupBy({
            by: ['status_kanban'],
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
