require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());
// Frontend estatico foi movido para o final do arquivo

// Multer setup (in memory, for quick upload to API)
const upload = multer({ storage: multer.memoryStorage() });

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'no_key');

const SYSTEM_PROMPT = `Persona: Atendente virtual da FBS Camisetas (Mauá-SP). Humano, simples e educado.

Missão: Coletar NOME, QUANTIDADE e CEP.

Regra de Ouro: Peça o NOME antes de qualquer coisa. Se já sabe o nome (e o cliente já se identificou antes no histórico da conversa), nunca pergunte de novo. Use frases curtas e no máximo 1 emoji por frase.

Produtos: Algodão, Malha Fria, Gola V, Baby Look, Polo. (Atenção: Malha fria não tem Baby Look!).

Preços: Nunca dê preço direto. Peça Quantidade e CEP primeiro para a equipe orçar.

Localização: Mauá - SP (Atende o Brasil todo).

Qualidade: Reforce sempre: "Material de alta qualidade, tecido resistente e acabamento caprichado".`;

const enviarMensagemEvolution = async (number, text) => {
    try {
        if (!text) throw new Error("Texto vazio bloqueado antes do envio.");
        
        const url = `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`;
        const payload = {
            number: String(number),
            options: { delay: 1200 },
            text: String(text)
        };
        
        console.log("📦 PAYLOAD PARA EVOLUTION:", JSON.stringify(payload));
        
        await axios.post(url, payload, { headers: { 'apikey': process.env.EVOLUTION_API_KEY } });
        return true;
    } catch (error) {
        console.error("❌ MOTIVO DA REJEIÇÃO:", JSON.stringify(error.response?.data || error.message));
        return false;
    }
};

const gerarRespostaIA = async (conversaId, nomeCliente, novaPergunta) => {
    try {
        const msgs = await prisma.mensagem.findMany({ where: { conversaId: conversaId }, orderBy: { criado_em: 'asc' }, take: 15 });
        const historico = msgs.map(m => ({ role: m.origem === 'cliente' ? 'user' : 'model', parts: [{ text: m.texto }] }));
        
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: SYSTEM_PROMPT });
        const userMsg = historico.pop();
        
        const chat = model.startChat({ history: historico, generationConfig: { maxOutputTokens: 150, temperature: 0.7 }});
        const result = await chat.sendMessage(userMsg.parts[0].text);
        return result.response.text();
    } catch(err) {
        console.error('Erro no Gemini', err); return null;
    }
}

// Nova rota de verificação de status exigida
app.get('/api/status', (req, res) => {
    res.json({ status: "API ONLINE e RESPONDENDO" });
});

// ==========================================
// WEBHOOK OBRIGATÓRIA E CORRIGIDA
// ==========================================
app.post('/api/webhook', async (req, res) => {
    console.log('📬 [WEBHOOK RECEBIDO]:', JSON.stringify(req.body, null, 2));
    res.status(200).send('OK');

    const body = req.body;
    if (!body || !body.data || !body.data.message) return;
    
    const messageData = body.data;
    const remoteJid = messageData.key.remoteJid;
    const fromMe = messageData.key.fromMe;
    if (fromMe || remoteJid.includes('@g.us')) return;

    const pushName = messageData.pushName || 'Desconhecido';
    const number = remoteJid.split('@')[0];

    // Extrair texto e mídia
    let msgText = ''; let mediaUrl = null; let mediaType = null;
    const messageObj = messageData.message;

    if (messageObj?.conversation) {
        msgText = messageObj.conversation;
    } else if (messageObj?.extendedTextMessage?.text) {
        msgText = messageObj.extendedTextMessage.text;
    } else if (messageObj?.imageMessage) {
        msgText = messageObj.imageMessage.caption || '📷 Imagem'; 
        mediaType = 'image';
        // Caso a API retorne a URL da midia (exemplo basico, varie dependendo da sua conv Evolution)
        mediaUrl = messageData.message.imageMessage?.url || messageData.messageType || 'image_received';
    } else if (messageObj?.audioMessage) {
        msgText = '🎵 Áudio Recebido';
        mediaType = 'audio';
        mediaUrl = 'audio_received'; // Em um setup real, voce baixaria ou extrairia o base64 daqui
    } else if (messageObj?.videoMessage) {
        msgText = '🎥 Vídeo Recebido';
        mediaType = 'video';
        mediaUrl = 'video_received';
    } else if (messageObj?.documentMessage) {
        msgText = messageObj.documentMessage.fileName || '📄 Documento Recebido';
        mediaType = 'document';
        mediaUrl = 'document_received';
    } else {
         msgText = '📎 [Mídia/Outro Formato]';
    }

    if (!msgText && !mediaType) return;

    try {
        const conversa = await prisma.conversa.upsert({
            where: { id: remoteJid },
            update: { nome: pushName, ultima_mensagem: msgText, atualizado_em: new Date() },
            create: { id: remoteJid, nome: pushName, telefone: number, ultima_mensagem: msgText, status_bot: true, status_kanban: "Novos" }
        });

        await prisma.mensagem.create({
            data: { conversaId: conversa.id, texto: msgText, mediaUrl: mediaUrl, mediaType: mediaType, origem: 'cliente' }
        });

        const ultimaMensagemHumano = await prisma.mensagem.findFirst({
            where: { conversaId: conversa.id, origem: 'loja' }, orderBy: { criado_em: 'desc' }
        });

        let silencio = false;
        if (ultimaMensagemHumano) {
            const minH = (new Date() - ultimaMensagemHumano.criado_em) / 60000;
            if (minH <= 10) {
                // O humano falou a menos de 10 min. 
                // SÓ forçamos o silêncio se o botão do Bot NÃO foi religado pelo humano.
                if (conversa.status_bot === false) {
                    silencio = true;
                }
            } else {
                // Já passou 10 minutos! O robô deve voltar a trabalhar automaticamente!
                if (conversa.status_bot === false) {
                    await prisma.conversa.update({ where: { id: conversa.id }, data: { status_bot: true }});
                    conversa.status_bot = true; // Atualiza pro ciclo atual
                }
            }
        }

        if (conversa.status_bot === true && !silencio && !mediaType) {
            console.log('🤖 Checando chave do Gemini para Acionar IA...');
            if(!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'no_key') {
                console.log('❌ IA CANCELADA: GEMINI_API_KEY não foi encontrada nas variáveis de ambiente!');
                return;
            }
            
            console.log('🤖 Acionando IA para responder...');
            const respostaIA = await gerarRespostaIA(conversa.id, pushName, msgText);
            
            if(respostaIA) {
                console.log('✅ Resposta da IA gerada, enviando via Evolution...');
                await enviarMensagemEvolution(number, respostaIA);
                await prisma.mensagem.create({ data: { conversaId: conversa.id, texto: respostaIA, origem: 'bot' } });
            } else {
                 console.log('❌ Resposta da IA retornou vazia ou com erro.');
            }
        } else {
            console.log('🛑 IA ignorada. Motivo:', { status_bot: conversa.status_bot, silencio_10m: silencio, contem_midia: !!mediaType });
        }
    } catch (err) { console.error('Erro DB webhook:', err); }
});

// ==========================================
// ROTAS EXISTENTES
// ==========================================
app.get('/api/dashboard', async (req, res) => {
    try {
        const [totalConversas, pedidosProd, aggregation, msgPendentes] = await Promise.all([
            prisma.conversa.count(),
            prisma.pedido.count({ where: { status: 'Em Produção' } }),
            prisma.pedido.aggregate({ _sum: { valor_total: true }, where: { criado_em: { gte: new Date(new Date().setHours(0,0,0,0)) }, status: { not: 'Pendente' } } }),
            prisma.conversa.count({ where: { status_bot: false } })
        ]);
        res.json({ totalConversas, pedidosEmProducao: pedidosProd, vendasHoje: aggregation._sum.valor_total || 0, mensagensPendentes: msgPendentes });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/conversas', async (req, res) => {
    const conversas = await prisma.conversa.findMany({ orderBy: { atualizado_em: 'desc' } });
    res.json(conversas);
});

app.get('/api/conversas/:id', async (req, res) => {
    const mensagens = await prisma.mensagem.findMany({ where: { conversaId: req.params.id }, orderBy: { criado_em: 'asc' } });
    const pedidos = await prisma.pedido.findMany({ where: { conversaId: req.params.id }, orderBy: { criado_em: 'desc' } });
    res.json({ mensagens, pedidos });
});

app.post('/api/conversas/:id/pausar', async (req, res) => {
    await prisma.conversa.update({ where: { id: req.params.id }, data: { status_bot: false } });
    res.json({ success: true });
});

app.post('/api/conversas/:id/ativar', async (req, res) => {
    await prisma.conversa.update({ where: { id: req.params.id }, data: { status_bot: true } });
    res.json({ success: true });
});

app.post('/api/conversas/:id/enviar', async (req, res) => {
    try {
        const conversa = await prisma.conversa.findUnique({ where: { id: req.params.id } });
        const enviado = await enviarMensagemEvolution(conversa.telefone, req.body.texto);
        if (enviado) {
            await prisma.mensagem.create({ data: { conversaId: conversa.id, texto: req.body.texto, origem: 'loja' } });
            await prisma.conversa.update({ where: { id: req.params.id }, data: { status_bot: false, ultima_mensagem: req.body.texto, atualizado_em: new Date() } });
            res.json({ success: true });
        } else { res.status(500).json({ error: 'Falha API' }); }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// NOVAS ROTAS (FASE 5) - KANBAN, TAGS, RESPOSTAS E MIDIA
// ==========================================

// Kanban Status Update
app.post('/api/conversas/:id/kanban', async (req, res) => {
    try {
        await prisma.conversa.update({ where: { id: req.params.id }, data: { status_kanban: req.body.status } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Tags Update
app.post('/api/conversas/:id/tags', async (req, res) => {
    try {
        await prisma.conversa.update({ where: { id: req.params.id }, data: { tags: req.body.tags } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Envio de Mídia C/ Multer
app.post('/api/conversas/:id/enviar-midia', upload.single('file'), async (req, res) => {
    try {
        if(!req.file) return res.status(400).json({ error: 'Nenhum arquivo' });
        const conversa = await prisma.conversa.findUnique({ where: { id: req.params.id } });
        
        // Encode para Base64 da Evolution API
        const base64Content = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;
        const msgText = req.body.caption || req.file.originalname;

        const url = `${process.env.EVOLUTION_API_URL}/message/sendMedia/${process.env.EVOLUTION_INSTANCE}`;
        await axios.post(url, {
            number: conversa.telefone,
            options: { delay: 1000 },
            mediaMessage: {
                mediatype: mimeType.split('/')[0] === 'image' ? 'image' : 'document',
                fileName: req.file.originalname,
                caption: req.body.caption || '',
                media: base64Content
            }
        }, { headers: { 'apikey': process.env.EVOLUTION_API_KEY } });

        await prisma.mensagem.create({ 
            data: { conversaId: conversa.id, texto: msgText, mediaType: mimeType.split('/')[0], origem: 'loja' } 
        });
        
        await prisma.conversa.update({ where: { id: req.params.id }, data: { status_bot: false, atualizado_em: new Date(), ultima_mensagem: `📎 ${msgText}` } });
        res.json({ success: true });
    } catch (err) { 
        console.error('erro envio midia', err?.response?.data || err);
        res.status(500).json({ error: err.message }); 
    }
});

// Respostas Rápidas Manuseio
app.get('/api/respostas', async (req, res) => {
    const respostas = await prisma.respostaRapida.findMany();
    res.json(respostas);
});

app.post('/api/respostas', async (req, res) => {
    const { atalho, texto } = req.body;
    const r = await prisma.respostaRapida.create({ data: { atalho, texto } });
    res.json(r);
});

// Pedidos ERP
app.post('/api/conversas/:id/pedidos', async (req, res) => {
    try {
        const body = req.body;
        const saldo = Math.max(0, parseFloat(body.valor_total || 0) - parseFloat(body.sinal_pago || 0));
        const pedido = await prisma.pedido.create({
            data: {
                conversaId: req.params.id, quantidade: parseInt(body.quantidade) || 1, tamanho: body.tamanho, cor: body.cor,
                local_estampa: body.local_estampa, valor_total: parseFloat(body.valor_total) || 0,
                sinal_pago: parseFloat(body.sinal_pago) || 0, saldo_devedor: saldo, status: body.status || 'Pendente'
            }
        });
        res.json(pedido);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Deixando regras de frontend ABAIXO exclusivas aqui:
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));
