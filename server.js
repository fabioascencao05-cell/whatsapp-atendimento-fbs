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

// ==========================================
// ADMIN: MIGRAR TUDO PARA NOVOS
// ==========================================
app.post('/api/admin/migrate-all', async (req, res) => {
    try {
        const result = await prisma.conversa.updateMany({
            data: { status_kanban: 'Novos', status_bot: true }
        });
        res.json({ message: `${result.count} contatos movidos para Novos e IA ativada.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
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
        
        // REGRA DE OURO: Natália só fala se o Robô estiver ON
        if (!conversa || !conversa.status_bot) {
            console.log('🛑 Bot ignorado para esta conversa.');
            return;
        }

        // Busca histórico das últimas 10 mensagens para contexto
        const historico = await prisma.mensagem.findMany({
            where: { conversaId: remoteJid },
            orderBy: { criado_em: 'asc' },
            take: 10
        });

        // Prompt completo da Deise
        const systemPrompt = `[IDENTIDADE]
Você se chama Deise e faz parte da equipe da FBS Camisetas (localizada em Mauá - SP).
Você é uma pessoa real, agindo com educação, agilidade e objetividade.
PROIBIDO: Se identificar como "atendente", "robô", "assistente virtual" ou "IA". Nunca confirme nem negue ser humano.
Na primeira mensagem, se apresente: "Oi! Eu sou a Deise da FBS Camisetas. 😊 Me diz seu nome pra eu te ajudar!"

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
Se perguntado, diga:
"Nosso prazo é de 4 a 8 dias úteis, mas a gente sempre corre pra entregar antes! 😊"

5. FORMAS DE ENTREGA:
- Motoboy (regiões próximas)
- Correios (todo o Brasil)
- Retirada no local: Bairro Sônia Maria, Mauá - SP
O endereço completo será passado pelo setor de orçamentos.

6. CLIENTES IMPACIENTES OU GROSSEIROS:
Mantenha tom calmo e profissional. Não entre em confronto.
Exemplo: "Entendo sua pressa! Vou agilizar o máximo possível pra você. 😊"

7. ESTILO DE ESCRITA:
Frases curtas. No máximo 1 emoji por mensagem. Tom humano, direto e acolhedor.
Nunca use parágrafos longos ou linguagem formal demais.

[GRADE DE PRODUTOS E CORES — CONSULTE SEMPRE]

ALGODÃO (Modelos: Tradicional, Gola V e Baby Look):
Cores: Branco, Preto, Azul Turquesa, Azul Royal, Azul Marinho, Verde Bandeira, Verde Limão, Verde Musgo, Rosa Bebê, Rosa Pink, Cinza Mescla, Grafite, Bordô, Laranja, Marrom, Roxo e Amarelo.
⚠️ Baby Look é fabricada APENAS em Algodão.

MALHA FRIA (Modelos: Tradicional, Gola V e Polo):
Cores: Branco, Preto, Azul Marinho, Azul Royal, Cinza Mescla e Grafite.
⚠️ NÃO fabricamos Baby Look em Malha Fria.

CAMISA POLO (Modelos: Tradicional e Feminina):
Cores: Branco, Preto, Marinho, Royal, Bordô e Grafite.

[QUEBRA DE OBJEÇÕES]

"Tá caro" / "Tem mais barato":
→ "Entendo! Mas além do preço, entregamos qualidade e prazo garantidos. Vale muito a pena! 😊"

"Preciso pra amanhã" / "É urgente":
→ "Nosso prazo é 4 a 8 dias úteis, mas sempre corremos pra entregar antes. Me passa os dados e vemos o que conseguimos!"

"Vou pensar":
→ "Claro, sem pressão! Qualquer dúvida é só me chamar. Estou aqui! 😊"

"Nunca comprei de vocês, não sei se confio":
→ "Faz sentido querer segurança! A FBS já atendeu muitos clientes e preza muito pela qualidade e prazo."

"Quero só uma peça":
→ "Sem problema! Me passa os detalhes e encaminho pro orçamento. Atendemos pedidos de todos os tamanhos!"

[FLUXO DE COLETA DE DADOS]

PASSO 1 — Se apresentar e descobrir o nome do cliente.

PASSO 2 — Coletar nesta ordem:
- Quantidade de peças
- Cor desejada (apenas cores da grade)
- Modelo e tipo de camiseta
- Imagem/Logo (OPCIONAL): "Você já tem a imagem da estampa? Se tiver, pode enviar por aqui. Se não tiver, sem problema!"

PASSO 3 — FINALIZAÇÃO OBRIGATÓRIA:
Assim que tiver Nome + Quantidade + Cor, INDEPENDENTE DA IMAGEM, faça o handoff IMEDIATAMENTE:
"Perfeito, [Nome]! Já anotei tudo aqui:
📦 Quantidade: [X]
🎨 Cor: [X]
Vou encaminhar agora pro setor de orçamentos e em breve eles te chamam com os valores e prazo certinhos. Só aguardar um pouquinho! 😊"
PARE. Não faça mais nenhuma pergunta. Não espere a imagem para finalizar.

[REGRA ABSOLUTA DE FINALIZAÇÃO]
Nome + Quantidade + Cor = HANDOFF IMEDIATO. A imagem é OPCIONAL e NUNCA deve travar o handoff.
Após o handoff, se o cliente mandar mensagem, responda apenas:
"Já encaminhei seus dados pro orçamento! Em breve nossa equipe entra em contato. 😊"

[LOCALIZAÇÃO E ENTREGA]
- Bairro Sônia Maria, Mauá - SP
- Entregamos por Motoboy, Correios ou retirada no local
- Enviamos para todo o Brasil
- Prazo: 4 a 8 dias úteis (sempre buscamos entregar antes!)

[SITUAÇÕES FORA DO ESCOPO]
Se o cliente enviar algo não relacionado ao pedido, responda:
"Oi! Aqui é o canal de atendimento da FBS Camisetas. Posso te ajudar com pedidos e orçamentos de camisetas personalizadas. 😊 Me diz seu nome pra começar?"

[ERROS QUE NUNCA DEVE COMETER]
- Inventar cores, modelos ou prazos exatos
- Fornecer preços
- Se identificar como IA, robô ou assistente
- Ignorar o nome do cliente antes de dar informações
- Prometer data exata de entrega
- Usar parágrafos longos ou linguagem formal demais
- Responder fora da grade de produtos
- Sugerir frases, temas, artes ou qualquer coisa que não foi pedida
- Continuar coletando dados após ter Nome + Quantidade + Cor

[REGRA ABSOLUTA DE FINALIZAÇÃO]
Nome + Quantidade + Cor = HANDOFF IMEDIATO. A imagem é OPCIONAL e NUNCA deve travar o handoff.
Após o handoff, se o cliente mandar mensagem, responda apenas:
"Já encaminhei seus dados pro orçamento! Em breve nossa equipe entra em contato. 😊"`;

        // Monta o contexto com histórico real da conversa
        const contexto = [
            { role: "system", content: systemPrompt },
            ...historico.map(msg => ({
                role: msg.origem === 'bot' ? 'assistant' : 'user',
                content: msg.texto
            })),
            { role: "user", content: textoDaMensagem }
        ];

        let respostaIA = "";
        if (openai) {
            try {
                const completion = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: contexto,
                    max_tokens: 400,
                    temperature: 0.7
                });
                respostaIA = completion.choices[0].message.content;
            } catch (openaiErr) {
                console.error('❌ Erro OpenAI, tentando Gemini...', openaiErr.message);
                // Fallback Gemini
                if (process.env.GEMINI_API_KEY) {
                    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                    const result = await model.generateContent(
                        contexto.map(m => `${m.role}: ${m.content}`).join('\n')
                    );
                    respostaIA = result.response.text();
                }
            }
        }

        // Se a IA gerou resposta, enviamos para o WhatsApp via Evolution API
        if (respostaIA) {
            console.log(`✅ Natália Respondeu: ${respostaIA}`);
            await enviarMensagemEvolution(remoteJid.split('@')[0], respostaIA);
            
            // Salva a resposta da Natália no histórico do CRM
            await prisma.mensagem.create({
                data: { conversaId: remoteJid, texto: respostaIA, origem: 'bot' }
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
    if (remoteJid.includes('@g.us')) return; // Ignora Grupos

    const msgText = messageData.message.conversation || messageData.message.extendedTextMessage?.text;
    if (!msgText || fromMe) return; // Ignora mensagens vazias ou enviadas por você

    try {
        // Busca ou cria o cliente no CRM
        const conversa = await prisma.conversa.upsert({
            where: { id: remoteJid },
            update: { ultima_mensagem: msgText, atualizado_em: new Date() },
            create: { 
               id: remoteJid, 
               nome: messageData.pushName || remoteJid.split('@')[0], 
               telefone: remoteJid.split('@')[0], 
               status_bot: true, 
               status_kanban: "Novos" 
            }
        });

        // Salva a pergunta do cliente no banco
        await prisma.mensagem.create({
            data: { conversaId: remoteJid, texto: msgText, origem: 'cliente' }
        });

        // VERIFICAÇÃO FINAL: Natália responde apenas se estiver em 'Novos' e sem vendedor assumido
        if (conversa.status_bot && conversa.status_kanban === 'Novos' && !conversa.assumido_por) {
            console.log(`🤖 Lead em 'Novos' detectado. Acionando Natália para ${remoteJid}`);
            processarIA(remoteJid, msgText);
        } else {
            console.log(`⏸️ IA não acionada (Kanban: ${conversa.status_kanban} | Assumido por: ${conversa.assumido_por || 'ninguém'})`);
        }

    } catch (err) { 
        console.error('Erro Webhook:', err.message); 
    }
});

// Rotas de utilidades e proxy seguem abaixo...


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

app.post('/api/respostas', async (req, res) => {
    try {
        const { atalho, texto } = req.body;
        const resposta = await prisma.respostaRapida.create({
            data: { atalho, texto }
        });
        res.json(resposta);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const totalLeads = await prisma.conversa.count();
        const faturamento = await prisma.conversa.aggregate({ _sum: { valor_conversa: true } });
        const novos = await prisma.conversa.count({ where: { status_kanban: 'Novos' } });
        
        res.json({
            totalLeads,
            faturamentoTotal: faturamento._sum.valor_conversa || 0,
            novosLeads: novos,
            success: true
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/conversas/delete', async (req, res) => {
    const { id } = req.body; // Recebe o ID do corpo da requisição
    
    if (!id) return res.status(400).json({ error: "ID não fornecido" });
    
    console.log(`🗑️ Tentando excluir conversa ID via POST: ${id}`);
    
    try {
        // 1. Desconecta etiquetas via SQL direto (evita bug do Prisma no Many-to-Many)
        await prisma.$executeRawUnsafe(
            `DELETE FROM "_ConversaToEtiqueta" WHERE "A" = $1`, id
        );

        // 2. Apaga mensagens
        await prisma.mensagem.deleteMany({ where: { conversaId: id } });

        // 3. Apaga a conversa
        await prisma.conversa.delete({ where: { id } });

        res.json({ success: true, message: 'Conversa excluída com sucesso' });
    } catch (err) {
        console.error('❌ Erro ao excluir conversa:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sync', async (req, res) => {
    console.log('🔄 Iniciando sincronização via Evolution API...');
    try {
        // Busca contatos da Evolution API
        const url = `${process.env.EVOLUTION_API_URL}/contact/findContacts/${process.env.EVOLUTION_INSTANCE}`;
        const response = await axios.get(url, { headers: { 'apikey': process.env.EVOLUTION_API_KEY } });
        const contatos = response.data;

        let syncedCount = 0;
        if (Array.isArray(contatos)) {
            for (const c of contatos) {
                if (!c.id) continue;
                const remoteJid = c.id;
                const number = remoteJid.split('@')[0];
                
                await prisma.conversa.upsert({
                    where: { id: remoteJid },
                    update: { 
                        nome: c.pushName || c.name || number,
                        profile_pic_url: c.profilePictureUrl || null
                    },
                    create: {
                        id: remoteJid,
                        nome: c.pushName || c.name || number,
                        telefone: number,
                        profile_pic_url: c.profilePictureUrl || null,
                        status_bot: true,
                        status_kanban: "Novos"
                    }
                });
                syncedCount++;
            }
        }

        res.json({ message: `Sincronização concluída! ${syncedCount} contatos sincronizados.` });
    } catch (err) {
        console.error('Erro na sincronização:', err.message);
        res.status(500).json({ error: 'Falha ao sincronizar com WhatsApp: ' + err.message });
    }
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

                // Atualiza o status do cliente após o envio automático
                await prisma.conversa.update({
                    where: { id: lead.id },
                    data: { atualizado_em: new Date() }
                });
                console.log(`✅ Follow-up enviado para: ${lead.nome}`);

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

// SPA support: Fallback para o index.html em qualquer rota não-API
const path = require('path');
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.status(404).json({ error: 'Endpoint não encontrado' });
    }
});

app.listen(3000, () => console.log('🚀 FBS CRM rodando na porta 3000'));
