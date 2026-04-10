const express = require('express');
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
app.use(express.static('public'));

// Configurações de IA
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "no_key");
// Instancia OpenAI apenas se a chave existir para evitar Erro Crítico
let openai = null;
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else {
    console.log('⚠️ OPENAI_API_KEY não encontrada. ChatGPT desativado.');
}

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

        const promptNatalia = `[IDENTIDADE]
Você se chama Natalia e faz parte da equipe da FBS Camisetas (localizada em Mauá - SP). Você é uma pessoa real, agindo com educação, agilidade e objetividade.
PROIBIDO: Se identificar como "atendente", "robô", "assistente virtual" ou "IA". Nunca confirme nem negue ser humano.

[OBJETIVO PRINCIPAL]
Conduzir o cliente para coletar os dados necessários para o orçamento: Nome, Quantidade, Cor e Imagem da Estampa. Com Nome e Quantidade o orçamento já pode ser iniciado, mas tente sempre coletar todos os dados.

[DIRETRIZES DE ATENDIMENTO — REGRAS RÍGIDAS]
1. NOME EM PRIMEIRO LUGAR: Nunca forneça informações técnicas ou de disponibilidade antes de saber o nome do cliente.
2. SEM PREÇOS: Nunca forneça valores.
3. NÃO INVENTE: Não ofereça cores ou modelos fora da grade.
4. PRAZOS: 4 a 8 dias úteis (sempre buscar entregar antes).
5. ENTREGAS: Motoboy, Correios ou Retirada (Bairro Sônia Maria, Mauá - SP).
6. REGRAS DE ESCRITA: Frases curtas. No máximo 1 emoji por mensagem. Tom humano.

[GRADE DE PRODUTOS]
- ALGODÃO: Branco, Preto, Azul Turquesa, Azul Royal, Azul Marinho, Verde Bandeira, Verde Limão, Verde Musgo, Rosa Bebê, Rosa Pink, Cinza Mescla, Grafite, Bordô, Laranja, Marrom, Roxo e Amarelo.
- MALHA FRIA: Branco, Preto, Azul Marinho, Azul Royal, Cinza Mescla e Grafite. (Não fazemos Baby Look aqui).
- POLO: Branco, Preto, Marinho, Royal, Bordô e Grafite.

[HISTÓRICO DA CONVERSA]:
${contexto}

Cliente: ${mensagemTexto}
Natalia:`;

        let respostaIA = "";
        if (openai) {
            console.log('🔌 Natália acionada via GPT...');
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "Você é a Natalia da FBS Camisetas. Siga RIGOROSAMENTE o manual de atendimento fornecido." },
                    { role: "user", content: promptNatalia }
                ],
                max_tokens: 400,
                temperature: 0.7
            });
            respostaIA = completion.choices[0].message.content;
        } 
        // Se não tiver OpenAI mas tiver Gemini, usa Gemini como reserva
        else if (process.env.GEMINI_API_KEY) {
            console.log('🔌 Usando Gemini como fallback...');
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent(prompt);
            respostaIA = result.response.text();
        }

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
// ROTAS API
// ==========================================

app.get('/api/conversas', async (req, res) => {
    try {
        const conversas = await prisma.conversa.findMany({
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
            include: { 
                mensagens: { orderBy: { criado_em: 'asc' } },
                etiquetas: true
            }
        });
        res.json({ conversa, mensagens: conversa.mensagens, pedidos: [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/conversas/:id/kanban', async (req, res) => {
    try {
        const conversa = await prisma.conversa.update({
            where: { id: req.params.id },
            data: { status_kanban: req.body.status, atualizado_em: new Date() }
        });
        res.json(conversa);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/conversas/:id/ativar', async (req, res) => {
    await prisma.conversa.update({ where: { id: req.params.id }, data: { status_bot: true } });
    res.json({ success: true });
});

app.post('/api/conversas/:id/pausar', async (req, res) => {
    await prisma.conversa.update({ where: { id: req.params.id }, data: { status_bot: false } });
    res.json({ success: true });
});

app.post('/api/conversas/:id/enviar', async (req, res) => {
    const { id } = req.params;
    const { texto } = req.body;
    try {
        await enviarMensagemEvolution(id.split('@')[0], texto);
        const msg = await prisma.mensagem.create({
            data: { conversaId: id, texto, origem: 'loja' }
        });
        await prisma.conversa.update({
            where: { id },
            data: { ultima_mensagem: texto, atualizado_em: new Date(), status_bot: false }
        });
        res.json(msg);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/conversas/:id/valor', async (req, res) => {
    const { valor } = req.body;
    try {
        const conversa = await prisma.conversa.update({
            where: { id: req.params.id },
            data: { valor_conversa: parseFloat(valor) || 0 }
        });
        res.json(conversa);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/broadcast', async (req, res) => {
    const { ids, texto } = req.body;
    res.json({ message: `Iniciando disparo para ${ids.length} clientes...` });

    // Processamento em background para não travar a requisição
    (async () => {
        for (const id of ids) {
            try {
                await enviarMensagemEvolution(id.split('@')[0], texto);
                await prisma.mensagem.create({
                    data: { conversaId: id, texto, origem: 'loja' }
                });
                // Delay de 3 a 5 segundos entre cada mensagem (Segurança)
                const delay = Math.floor(Math.random() * 2000) + 3000;
                await new Promise(resolve => setTimeout(resolve, delay));
            } catch (err) { console.error(`Erro broadcast para ${id}:`, err.message); }
        }
        console.log('✅ Broadcast finalizado!');
    })();
});

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

        // Natália responde apenas se estiver em 'Novos'
        if (conversa.status_bot && conversa.status_kanban === 'Novos') {
            console.log(`🤖 Lead em 'Novos' detectado. Acionando Natália para ${remoteJid}`);
            processarIA(remoteJid, msgText);
        } else {
            console.log(`⏸️ IA não acionada: Bot=${conversa.status_bot}, Kanban=${conversa.status_kanban}`);
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

app.post('/api/conversas/:id/etiquetas', async (req, res) => {
    const { id } = req.params;
    const { etiquetaIds } = req.body; 
    
    try {
        await prisma.conversa.update({
            where: { id },
            data: {
                etiquetas: { set: etiquetaIds.map(eid => ({ id: eid })) }
            }
        });

        // Verifica se alguma etiqueta nova tem follow-up configurado
        const etiquetasFull = await prisma.etiqueta.findMany({
            where: { id: { in: etiquetaIds } }
        });

        for (const et of etiquetasFull) {
            if (et.followup_texto && et.followup_horas) {
                const dataEnvio = new Date();
                dataEnvio.setHours(dataEnvio.getHours() + et.followup_horas);

                // agenda o envio na tabela Mensagem
                await prisma.mensagem.create({
                    data: {
                        conversaId: id,
                        texto: et.followup_texto,
                        origem: 'bot',
                        agendado_para: dataEnvio,
                        status_envio: 'Pendente'
                    }
                });
                console.log(`⏰ Agendado follow-up para ${id} em ${et.followup_horas}h (Etiqueta: ${et.nome})`);
            }
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, senha } = req.body;
    
    // Login padrão para o Fabio (podemos mudar no banco depois)
    if (email === 'admin@fbs.com' && senha === 'fbs2024') {
        const token = jwt.sign({ user: 'Fabio' }, JWT_SECRET, { expiresIn: '7d' });
        return res.json({ success: true, token });
    }
    
    res.status(401).json({ error: 'E-mail ou senha incorretos' });
});

// ==========================================
// AUTOMAÇÃO: ENVIO DE AGENDADOS (A cada 5 minutos)
// ==========================================
cron.schedule('*/5 * * * *', async () => {
    try {
        const agora = new Date();
        const mensagensPendentes = await prisma.mensagem.findMany({
            where: {
                status_envio: 'Pendente',
                agendado_para: { lte: agora }
            }
        });

        for (const msg of mensagensPendentes) {
            console.log(`📤 Enviando agendado para ${msg.conversaId}...`);
            await enviarMensagemEvolution(msg.conversaId.split('@')[0], msg.texto);
            
            await prisma.mensagem.update({
                where: { id: msg.id },
                data: { status_envio: 'Enviado' }
            });

            await prisma.conversa.update({
                where: { id: msg.conversaId },
                data: { ultima_mensagem: msg.texto, atualizado_em: new Date() }
            });
        }
    } catch (err) { console.error('❌ Erro no Cron Agendados:', err.message); }
});

// ==========================================
// AUTOMAÇÃO: FOLLOW-UP AUTOMÁTICO (Novos Leads 09:00)
// ==========================================
cron.schedule('0 9 * * *', async () => {
    // ... logic for Novos leads remains checking the 'Novos' status_kanban
    console.log('🤖 Iniciando varredura de Follow-up Automático...');
    
    try {
        const ontem = new Date();
        ontem.setDate(ontem.getDate() - 1);

        // Busca conversas na coluna 'Novos' que não foram atualizadas há 24h
        const leadsParados = await prisma.conversa.findMany({
            where: {
                status_kanban: 'Novos',
                atualizado_em: { lte: ontem },
                status_bot: true
            },
            include: {
                mensagens: {
                    orderBy: { criado_em: 'desc' },
                    take: 1
                }
            }
        });

        console.log(`🔍 Encontrados ${leadsParados.length} leads para follow-up.`);

        for (const lead of leadsParados) {
            const ultimaMsg = lead.mensagens[0];
            
            // Só manda se a última mensagem NÃO foi do cliente
            if (ultimaMsg && ultimaMsg.origem !== 'cliente') {
                const msgFollowUp = `Oi ${lead.nome}! Passando só pra saber se você recebeu minha última mensagem. Ficou alguma dúvida sobre os modelos de camisetas? 😊`;
                
                await enviarMensagemEvolution(lead.telefone, msgFollowUp);
                
                await prisma.mensagem.create({
                    data: { conversaId: lead.id, texto: msgFollowUp, origem: 'bot' }
                });

                await prisma.conversa.update({
                    where: { id: lead.id },
                    data: { atualizado_em: new Date() }
                });
                
                console.log(`✅ Follow-up enviado para: ${lead.nome}`);
            }
        }
    } catch (err) {
        console.error('❌ Erro no Follow-up Automático:', err.message);
    }
}, {
    timezone: "America/Sao_Paulo"
});

app.listen(3000, () => console.log('🚀 FBS CRM rodando na porta 3000'));
