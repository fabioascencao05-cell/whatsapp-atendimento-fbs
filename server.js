const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const multer = require('multer');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { OpenAI } = require("openai");
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');
require('dotenv').config();

const app = express();
const prisma = new PrismaClient();
const upload = multer();

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

// Configurações de IA
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "AIzaSyCX7HR6JjtJaRVC9tjWST17aHK867EkUMQ");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Rastreio de mensagens para evitar loops
const recentSystemMessages = new Map();

// ==========================================
// FUNÇÃO DE INTELIGÊNCIA ARTIFICIAL (CORRIGIDA)
// ==========================================
async function processarIA(remoteJid, textoDaMensagem) {
    console.log(`🤖 Iniciando resposta via GPT para: ${remoteJid}`);
    
    try {
        const conversa = await prisma.conversa.findUnique({ where: { id: remoteJid } });
        if (!conversa || !conversa.status_bot) {
            console.log('🛑 Bot ignorado para esta conversa.');
            return;
        }

        const prompt = `Você é o atendente da FBS Camisetas. Responda de forma natural, curta e amigável. Para orçamentos, peça a quantidade e cor.\n\nCliente: ${textoDaMensagem}\nResposta:`;

        console.log('🔌 Chamando OpenAI gpt-4o-mini...');
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Você é o atendente da FBS Camisetas." },
                { role: "user", content: prompt }
            ],
            max_tokens: 300
        });

        const respostaIA = completion.choices[0].message.content;

        if (respostaIA) {
            console.log(`✅ GPT Respondeu: ${respostaIA}`);
            
            // Envia via Evolution API
            const url = `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`;
            await axios.post(url, {
                number: remoteJid.split('@')[0],
                options: { delay: 1200 },
                text: respostaIA
            }, { headers: { 'apikey': process.env.EVOLUTION_API_KEY } });

            // Salva no banco
            await prisma.mensagem.create({
                data: {
                    conversaId: remoteJid,
                    texto: respostaIA,
                    origem: 'bot'
                }
            });

            await prisma.conversa.update({
                where: { id: remoteJid },
                data: { ultima_mensagem: respostaIA, atualizado_em: new Date() }
            });

            // Evita loop no webhook
            recentSystemMessages.set(remoteJid.split('@')[0], Date.now());
        }
    } catch (err) {
        console.error('❌ Erro Crítico IA/Evolution:', err.message);
    }
}

// Helper para envios extras
const enviarMensagemEvolution = async (number, text) => {
    try {
        const url = `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`;
        await axios.post(url, {
            number: String(number).split('@')[0],
            options: { delay: 1000 },
            text: text
        }, { headers: { 'apikey': process.env.EVOLUTION_API_KEY } });
        recentSystemMessages.set(String(number).split('@')[0], Date.now());
        return true;
    } catch (e) { return false; }
};

// ==========================================
// WEBHOOK
// ==========================================
app.post('/api/webhook', async (req, res) => {
    res.status(200).send('OK');
    const body = req.body;
    if (!body || !body.data || !body.data.message) return;
    
    const messageData = body.data;
    const remoteJid = messageData.key.remoteJid;
    const fromMe = messageData.key.fromMe;
    if (remoteJid.includes('@g.us')) return;

    const number = remoteJid.split('@')[0];
    
    // Bloqueia loop de bot
    if (fromMe) {
        const lastSystemSend = recentSystemMessages.get(number);
        if (lastSystemSend && Date.now() - lastSystemSend < 15000) return;
    }

    const msgText = messageData.message.conversation || messageData.message.extendedTextMessage?.text;
    if (!msgText || fromMe) return;

    try {
        const conversa = await prisma.conversa.upsert({
            where: { id: remoteJid },
            update: { ultima_mensagem: msgText, atualizado_em: new Date() },
            create: { id: remoteJid, nome: messageData.pushName || number, telefone: number, status_bot: true, status_kanban: "Novos" }
        });

        await prisma.mensagem.create({
            data: { conversaId: remoteJid, texto: msgText, origem: 'cliente' }
        });

        if (conversa.status_bot) {
            processarIA(remoteJid, msgText);
        }
    } catch (err) { console.error('Erro Webhook:', err.message); }
});

// Outras rotas (CRUD, Kanban, etc) continuam abaixo...
app.get('/api/conversas', async (req, res) => {
    const conversas = await prisma.conversa.findMany({ orderBy: { atualizado_em: 'desc' } });
    res.json(conversas);
});

app.get('/api/conversas/:id', async (req, res) => {
    const conversa = await prisma.conversa.findUnique({ where: { id: req.params.id } });
    const mensagens = await prisma.mensagem.findMany({ where: { conversaId: req.params.id }, orderBy: { criado_em: 'asc' } });
    const pedidos = await prisma.pedido.findMany({ where: { conversaId: req.params.id } });
    res.json({ conversa, mensagens, pedidos });
});

app.post('/api/conversas/:id/pausar', async (req, res) => {
    await prisma.conversa.update({ where: { id: req.params.id }, data: { status_bot: false } });
    res.json({ success: true });
});

app.post('/api/conversas/:id/ativar', async (req, res) => {
    await prisma.conversa.update({ where: { id: req.params.id }, data: { status_bot: true } });
    res.json({ success: true });
});

app.post('/api/conversas/:id/kanban', async (req, res) => {
    await prisma.conversa.update({ where: { id: req.params.id }, data: { status_kanban: req.body.status } });
    res.json({ success: true });
});

app.get('/api/proxy-media', async (req, res) => {
    try {
        const response = await axios.get(req.query.url, {
            headers: { 'apikey': process.env.EVOLUTION_API_KEY },
            responseType: 'arraybuffer'
        });
        res.set('Content-Type', response.headers['content-type']);
        res.send(response.data);
    } catch (e) { res.status(500).send('Erro Proxy'); }
});

app.get('/api/respostas', async (req, res) => {
    const respostas = await prisma.respostaRapida.findMany();
    res.json(respostas);
});

app.post('/api/sync', async (req, res) => {
    res.json({ message: "Sincronização iniciada" });
});

app.listen(3000, () => console.log('🚀 FBS CRM rodando na porta 3000'));
