const express = require('express');
const path = require('path');
const fs = require('fs');
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

// Prevenir cache em rotas da API para garantir tempo real no dashboard e chat
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});
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
// Debounce map: evita resposta múltipla quando o cliente manda mensagens em rajada
const debounceTimers = new Map();

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
        const systemPrompt = `🎭 IDENTIDADE E COMPORTAMENTO

Você é Deise, atendente da FBS Camisetas, de Mauá - SP.
Você é uma pessoa real da equipe.
É proibido dizer que é robô, IA, assistente virtual ou atendimento automático.
Se perguntarem se você é robô, responda naturalmente que não.

Exemplo:
"Não, sou a Deise mesmo 😊 tô aqui pra te ajudar."

Seu jeito de falar:
- calorosa e simpática, como uma colega de trabalho gente boa
- natural e descontraída, sem ser informal demais
- empática: se o cliente parecer empolgado, demonstre entusiasmo
- objetiva: não enrola, mas sem ser grossa ou seca
- sem parecer robô, script ou telemarketing

Regras de escrita:
- MÁXIMO 2 frases por resposta. Nunca mais que isso.
- linguagem de WhatsApp: simples, direta, humana
- proibido listas ou bullet points
- sem excesso de pontuação
- nunca repita na mesma mensagem o que já foi dito antes

😊 USO DE EMOJIS
- use emojis com moderação para dar calor humano (máx 1 por mensagem)
- preferência para: 😊 🙂 👍 😄
- não use emoji em toda mensagem, só quando trouxer leveza natural

📌 OBJETIVO PRINCIPAL

Seu objetivo é qualificar o atendimento e coletar de forma natural, sempre que fizer sentido:
- nome do cliente
- modelo
- quantidade
- cor
- tamanho, se necessário
- cidade/CEP, se a dúvida for entrega
- arte/logo/estampa, se o cliente já tiver

Você deve conduzir a conversa com naturalidade até ter informações suficientes para encaminhar ao setor comercial/orçamento.

🚫 REGRAS DE SEGURANÇA

Você nunca pode:
- informar preços
- inventar valores
- negociar preço
- prometer desconto
- fechar venda sozinha
- inventar prazo
- inventar cor
- inventar modelo
- inventar informação de frete
- dizer que é IA

Prazo padrão:
"de 4 a 8 dias úteis"

🧠 MEMÓRIA E CONTEXTO

Você deve prestar atenção em tudo que o cliente já falou.

Regras:
- nunca perguntar de novo algo que o cliente já informou
- se o cliente já falou a quantidade, não perguntar quantidade novamente
- se o cliente já falou a cor, não perguntar cor novamente
- se o cliente já falou o modelo, não perguntar modelo novamente
- se o cliente já informou o nome, usar esse nome naturalmente nas próximas respostas
- se houver conflito, considerar a informação mais recente
- se o cliente voltar depois, retomar de onde a conversa parou

Se o cliente enviar várias mensagens seguidas, considere todas como parte de uma única fala.
Nunca responda cada mensagem separadamente se forem partes da mesma ideia.
Considere a intenção final do bloco de mensagens e responda uma vez só.

👤 NOME DO CLIENTE

Sempre que iniciar uma nova conversa (se não houver histórico anterior ou se for a primeira mensagem do cliente), sua prioridade ABSOLUTA é se apresentar e pedir o nome de forma calorosa.

Exemplo de primeira mensagem:
"Oi! Eu sou a Deise da FBS Camisetas. 😊 Com quem eu falo?" ou "Olá! Sou a Deise. Como você se chama pra eu te ajudar melhor?"

Depois que o cliente informar o nome:
- use o nome de forma natural ao longo da conversa
- não repita o nome em todas as sentenças
- use o nome principalmente em confirmações e na finalização

Exemplos:
"Perfeito. E qual seu nome?"
"Entendi, Gisele."
"Perfeito, Gisele! Já anotei tudo aqui."

🛠️ MODELOS DISPONÍVEIS

Você trabalha com:

Camiseta Algodão masculina
- mais confortável
- melhor qualidade de impressão
- mais opções de cores

Baby Look Algodão feminina
- modelagem feminina
- mesmas cores do algodão

Camiseta Infantil
- tamanhos do 0 ao 16
- masculina e feminina
- mesmas cores do algodão

Malha Fria
- mais leve
- mais econômica
- menos opções de cores

Oversized
- modelagem ampla
- estilo moderno
- cores específicas

Polo Piquet Masculina
- modelo social
- ideal para empresa
- mesmas cores do algodão

Polo Piquet Feminina
- modelo social feminino
- ideal para empresa
- mesmas cores do algodão

Camiseta manga longa, com gola redonda
- Modelo: Gola Careca
- Tamanhos: P | M | G | GG | EG
- Tecido: 100% algodão, exceto cinza mescla, que é 88% algodão e 12% poliéster.
- Cores: Amarelo, Azul Marinho, Azul Royal, Azul Turquesa, Bordô, Branco, Cinza Mescla, Cinza Grafite, Laranja, Preto, Verde Bandeira, Verde Limão, Verde Musgo, Vermelho


🎨 CORES DISPONÍVEIS

Algodão, Baby Look, Infantil e Polo Piquet:
Branco, Preto, Marrom, Cinza Mescla, Cinza Chumbo, Azul Royal, Azul Marinho, Azul Turquesa, Verde Bandeira, Verde Musgo, Vermelho, Bordô, Rosa Claro, Rosa Pink, Amarelo, Laranja, Roxo, Bege

Oversized:
Preto, Azul, Off White, Branco

Malha Fria:
Branco, Preto, Azul Marinho, Grafite

Nunca invente cor fora dessa grade.

📏 TAMANHOS

Adulto:
P, M, G, GG, XGG

Infantil:
0, 2, 4, 6, 8, 10, 12, 14, 16

🚚 ENTREGA / CEP

Se o cliente demonstrar dúvida sobre distância, entrega, envio, outra cidade ou outro estado, mude a prioridade da conversa para entrega.

Sinais de contexto:
- "é longe"
- "vocês entregam aqui?"
- "sou de outra cidade"
- "sou de outro estado"
- "manda para minha cidade?"
- "como funciona a entrega?"
- "tem entrega?"

Nesses casos:
- informar que a FBS entrega para todo o Brasil
- pedir o CEP antes de continuar a qualificação normal

Exemplo:
"Entregamos sim para todo o Brasil. Me passa seu CEP que eu verifico certinho pra você."

Depois disso:
- responder naturalmente
- voltar para modelo, quantidade e cor, se ainda faltarem

🎨 ARTE / LOGO / ESTAMPA

Se o cliente mencionar:
- arte
- logo
- estampa
- personalização
- uniforme
- silk
- sublimação
- impressão

Então peça a arte de forma natural, se ele já tiver.

Exemplos:
"Se você já tiver a arte ou logo, pode me enviar por aqui."
"Se já tiver a estampa, pode mandar que eu encaminho junto."
"Se ainda não tiver pronta, sem problema, pode enviar depois."

Se o cliente não mencionar arte, mas a conversa indicar personalização, você pode perguntar isso depois de coletar as informações principais.

💬 FORMA CORRETA DE CONDUZIR

Você deve responder primeiro a dúvida principal do cliente e depois avançar para a próxima informação necessária.

Regra:
- se a dúvida principal for preço, pedir modelo + quantidade + cor
- se a dúvida principal for entrega, pedir CEP primeiro
- se a dúvida principal for prazo, responder o prazo e depois voltar à qualificação
- se a dúvida principal for localização, responder e puxar a próxima etapa comercial
- se a dúvida principal for modelo, explicar e depois pedir quantidade/cor

Nunca seguir um roteiro engessado se a conversa pedir outra prioridade.

📞 ORDEM IDEAL DA CONVERSA

Na maioria dos casos, seguir esta lógica:
1. entender o que o cliente quer
2. pedir o nome cedo, se ainda não tiver
3. pedir modelo, se faltar
4. pedir quantidade, se faltar
5. pedir cor, se faltar
6. pedir tamanho, se fizer sentido
7. pedir arte, se já tiver
8. pedir CEP, se a conversa envolver entrega/distância
9. finalizar e encaminhar

⚠️ REGRAS DE NATURALIDADE

- não repetir saudação
- não reiniciar a conversa se o cliente mandar "bom dia" no meio
- se o cliente mandar só uma saudação, responder e continuar do ponto onde parou
- evitar respostas genéricas demais
- sempre puxar o próximo passo útil da conversa
- se o cliente já informou algo, aproveite essa informação
- se o cliente falar várias coisas em mensagens separadas, junte tudo mentalmente antes de responder

✅ EXEMPLOS DE BOAS RESPOSTAS

Se o cliente perguntar preço:
"Os valores variam conforme o modelo e a quantidade. Me fala qual modelo, quantas peças e a cor que você quer."

Se o cliente falar:
"Quero 2 pretas"
resposta ideal:
"Perfeito. E qual modelo você quer?"

Se o cliente perguntar de onde vocês são:
"Somos de Mauá, em São Paulo. Você já sabe qual modelo está procurando?"

Se o cliente disser que é longe:
"Entregamos sim para todo o Brasil. Me passa seu CEP que eu verifico certinho pra você."

Se o cliente mencionar empresa/uniforme:
"Perfeito. Se você já tiver a logo da empresa, pode me enviar por aqui."

Se o cliente já informou o nome:
"Entendi, Gisele. E qual cor você quer?"

🧾 RESPOSTAS ESPECÍFICAS

Se perguntar preço:
"Os valores variam conforme o modelo e a quantidade. Me fala qual modelo, quantas peças e a cor que você quer."

Se perguntar prazo:
"Nosso prazo padrão é de 4 a 8 dias úteis."

Se perguntar localização:
"Somos de Mauá, em São Paulo."

Se perguntar entrega:
"Entregamos para todo o Brasil. Me passa seu CEP que eu verifico certinho pra você."

Se perguntar tamanhos:
"Adulto temos P, M, G, GG e XGG. Infantil temos do 0 ao 16."

Se perguntar modelos:
"Temos algodão, baby look, infantil, malha fria, oversized e polo piquet masculina e feminina."

🏁 FINALIZAÇÃO

Quando tiver nome, modelo, cor e quantidade: envie a mensagem de encaminhamento UMA ÚNICA VEZ.

Mensagem padrão:
"Perfeito, [Nome]! Vou encaminhar pro setor de orçamentos. Em breve eles entram em contato com os valores. Só aguardar 😊"

🚨 REGRA CRÍTICA PÓS-HANDOFF:
Se você JÁ enviou a mensagem de encaminhamento (aparece no histórico uma mensagem sua falando em encaminhar ou orçamento), então:
- NÃO repita o resumo do pedido
- NÃO mande outra mensagem de finalização
- Se o cliente disser "ok", "obrigado", "entendi", "certo", "tá bom" ou qualquer coisa de confirmação, responda SOMENTE com uma frase curta tipo: "Pode deixar!" ou simplesmente não responda
- NUNCA repita o que você já disse antes

⚠️ REGRA IA x HUMANO

Se o histórico mostrar que o encaminhamento já foi feito:
- não repita mensagem de finalização
- não continue puxando assunto
- aguardar o humano assumir

🎯 OBJETIVO FINAL

Atender de forma natural, humana e organizada.
Coletar as informações certas sem repetir perguntas.
Fazer o cliente se sentir bem atendido.
Encaminhar corretamente para o setor de orçamentos.`;
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
                    max_tokens: 150,
                    temperature: 0.5
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

// ==========================================
// TRANSCRIÇÃO DE ÁUDIO (WHISPER)
// ==========================================
async function transcreverAudio(audioUrl) {
    if (!openai) {
        console.log('⚠️ OpenAI não configurada — transcrição de áudio indisponível.');
        return null;
    }
    try {
        console.log('🎤 Baixando áudio para transcrição...');
        const response = await axios({
            url: audioUrl,
            method: 'GET',
            responseType: 'arraybuffer',
            headers: { 'apikey': process.env.EVOLUTION_API_KEY }
        });

        const tmpPath = path.join(__dirname, 'tmp', `audio_${Date.now()}.ogg`);
        fs.mkdirSync(path.join(__dirname, 'tmp'), { recursive: true });
        fs.writeFileSync(tmpPath, Buffer.from(response.data));

        console.log('🎙️ Transcrevendo áudio com Whisper...');
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tmpPath),
            model: 'whisper-1',
            language: 'pt'
        });

        fs.unlinkSync(tmpPath); // Remove arquivo temporário
        console.log(`✅ Transcrição: ${transcription.text}`);
        return transcription.text;
    } catch (err) {
        console.error('❌ Erro na transcrição de áudio:', err.message);
        return null;
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
// AUTENTICAÇÃO
// ==========================================
app.post('/api/login', async (req, res) => {
    const { email, senha } = req.body;
    
    // Login padrão para emergência
    if (email === 'admin@fbs.com' && senha === 'fbs123') {
        return res.json({ success: true, token: 'token-admin-fbs-camiseta-2024' });
    }

    try {
        const usuario = await prisma.usuario.findUnique({ where: { email } });
        if (usuario && usuario.senha === senha) {
            return res.json({ success: true, token: `token-${usuario.id}-${Date.now()}` });
        }
        res.status(401).json({ success: false, error: 'E-mail ou senha incorretos' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

    // 1) Ignorar eventos de sistema puros ou ações sem texto/mídia
    if (!texto && !mediaType) return res.sendStatus(200);

    // 2) Ignorar avisos automáticos do sistema do Facebook/Instagram sobre Ads
    if (texto.includes('Esta conversa foi iniciada em um anúncio') || texto.includes('O compartilhamento de dados')) {
        console.log('🛡️ Ignorando mensagem automática de Ads do Facebook.');
        return res.sendStatus(200);
    }

    // Se for mensagem enviada pela "loja" (pode ser o humano OU webhook do bot)
    if (isFromMe) {
        // Verifica se a Deise acabou de enviar essa mensagem (evita auto-silenciamento)
        const lastBotSent = recentSystemMessages.get(number);
        if (lastBotSent && (Date.now() - lastBotSent) < 10000) {
            console.log('🤖 Ignorando webhook de mensagem recém enviada pela Deise.');
            return res.sendStatus(200);
        }

        // Se chegou aqui, é realmente um humano digitando ou enviando arquivo
        await prisma.conversa.upsert({
            where: { id: remoteJid },
            update: { assumido_por: 'humano', ultima_mensagem: texto || `[Arquivo ${mediaType}]`, atualizado_em: new Date() },
            create: { id: remoteJid, nome: pushName, telefone: number, ultima_mensagem: texto || `[Arquivo ${mediaType}]`, assumido_por: 'humano' }
        });
        
        await prisma.mensagem.create({
            data: { conversaId: remoteJid, texto: texto || '', mediaType, origem: 'loja' }
        });
        
        return res.sendStatus(200);
    }

    const conversa = await prisma.conversa.upsert({
        where: { id: remoteJid },
        update: { nome: pushName, ultima_mensagem: texto || `[Arquivo ${mediaType}]`, atualizado_em: new Date() },
        create: { id: remoteJid, nome: pushName, telefone: number, ultima_mensagem: texto || `[Arquivo ${mediaType}]` }
    });

    // Transcrição de áudio: se for áudio do cliente, tenta transcrever com Whisper
    let textoPraIA = texto;
    if (mediaType === 'audio' && !isFromMe && conversa.status_bot && conversa.status_kanban === 'Novos' && !conversa.assumido_por) {
        try {
            const mediaMsg = data.data.message?.audioMessage;
            const audioUrl = mediaMsg?.url || data.data.message?.base64;
            if (audioUrl && audioUrl.startsWith('http')) {
                const transcricao = await transcreverAudio(audioUrl);
                if (transcricao) {
                    textoPraIA = transcricao;
                    texto = transcricao; // salvar no banco como texto
                    console.log(`🎤 Áudio transcrito: "${transcricao}"`);
                }
            }
        } catch (audioErr) {
            console.error('❌ Erro ao processar áudio:', audioErr.message);
        }
    }

    if (texto || mediaType) {
        await prisma.mensagem.create({
            data: { conversaId: remoteJid, texto: texto || '', mediaType, origem: 'cliente' }
        });
    }

    // Deise só responde se: bot ON + estágio Novos + sem humano assumido
    if ((textoPraIA || texto) && conversa.status_bot && conversa.status_kanban === 'Novos' && !conversa.assumido_por) {
        // Debounce: se o cliente mandar várias mensagens rápido, espera 5s sem nova msg antes de responder
        if (debounceTimers.has(remoteJid)) {
            clearTimeout(debounceTimers.get(remoteJid));
            console.log(`⏱️ Debounce resetado para ${remoteJid} — nova mensagem chegou antes do timer.`);
        }
        // Acumula as últimas msgs para enviar no contexto completo
        const timer = setTimeout(async () => {
            debounceTimers.delete(remoteJid);
            // Busca a última mensagem do cliente (já pode ter chegado mais com o histórico)
            const ultimaMsgs = await prisma.mensagem.findMany({
                where: { conversaId: remoteJid, origem: 'cliente' },
                orderBy: { criado_em: 'desc' },
                take: 5
            });
            const textoFinal = ultimaMsgs.reverse().map(m => m.texto).filter(Boolean).join(' ');
            await processarIA(remoteJid, textoFinal || texto);
        }, 12000); // Espera 12 segundos (mais humano)
        debounceTimers.set(remoteJid, timer);
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
    try {
        const etiquetas = await prisma.etiqueta.findMany({ orderBy: { nome: 'asc' } });
        res.json(etiquetas);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/etiquetas', async (req, res) => {
    try {
        const { nome, cor, followup_texto, followup_horas } = req.body;
        const etiqueta = await prisma.etiqueta.create({ 
            data: { 
                nome, 
                cor, 
                followup_texto: followup_texto || null, 
                followup_horas: parseInt(followup_horas) || null 
            } 
        });
        res.json(etiqueta);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/etiquetas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, cor, followup_texto, followup_horas } = req.body;
        const etiqueta = await prisma.etiqueta.update({
            where: { id: parseInt(id) },
            data: { 
                nome, 
                cor, 
                followup_texto: followup_texto || null, 
                followup_horas: parseInt(followup_horas) || null 
            }
        });
        res.json(etiqueta);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/etiquetas/:id', async (req, res) => {
    try {
        await prisma.etiqueta.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
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

// ==========================================
// PIPELINE EDITÁVEL
// ==========================================
const DEFAULT_PIPELINE = [
    { nome: 'Novos', cor: 'hsl(210,80%,55%)', ordem: 0 },
    { nome: 'Em Negociação', cor: 'hsl(38,92%,50%)', ordem: 1 },
    { nome: 'Aguardando Pagamento', cor: 'hsl(145,63%,42%)', ordem: 2 },
    { nome: 'Pedido Aprovado', cor: 'hsl(262,83%,58%)', ordem: 3 },
    { nome: 'Pedido Entregue', cor: 'hsl(220,15%,70%)', ordem: 4 },
];

app.get('/api/pipeline', async (req, res) => {
    try {
        let columns = await prisma.pipelineColumn.findMany({ orderBy: { ordem: 'asc' } });
        // Seed: se não tem colunas, cria as padrão
        if (columns.length === 0) {
            for (const col of DEFAULT_PIPELINE) {
                await prisma.pipelineColumn.create({ data: col });
            }
            columns = await prisma.pipelineColumn.findMany({ orderBy: { ordem: 'asc' } });
        }
        res.json(columns);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/pipeline', async (req, res) => {
    const { nome, cor } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    try {
        const maxOrdem = await prisma.pipelineColumn.aggregate({ _max: { ordem: true } });
        const col = await prisma.pipelineColumn.create({
            data: { nome, cor: cor || 'hsl(210,80%,55%)', ordem: (maxOrdem._max.ordem || 0) + 1 }
        });
        res.json(col);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/pipeline/:id', async (req, res) => {
    const { nome, cor, ordem } = req.body;
    try {
        const data = {};
        if (nome !== undefined) data.nome = nome;
        if (cor !== undefined) data.cor = cor;
        if (ordem !== undefined) data.ordem = ordem;
        const col = await prisma.pipelineColumn.update({ where: { id: parseInt(req.params.id) }, data });
        res.json(col);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/pipeline/:id', async (req, res) => {
    try {
        const col = await prisma.pipelineColumn.findUnique({ where: { id: parseInt(req.params.id) } });
        if (!col) return res.status(404).json({ error: 'Coluna não encontrada' });
        // Move leads dessa coluna para "Novos"
        await prisma.conversa.updateMany({
            where: { status_kanban: col.nome },
            data: { status_kanban: 'Novos' }
        });
        await prisma.pipelineColumn.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/pipeline/reorder', async (req, res) => {
    const { ordem } = req.body; // [{ id: 1, ordem: 0 }, { id: 2, ordem: 1 }, ...]
    try {
        for (const item of ordem) {
            await prisma.pipelineColumn.update({ where: { id: item.id }, data: { ordem: item.ordem } });
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
// FOLLOW-UP MANUAL (CRUD)
// ==========================================
app.get('/api/followups', async (req, res) => {
    try {
        const followups = await prisma.followUp.findMany({
            include: { conversa: { select: { nome: true, telefone: true, profile_pic_url: true, status_kanban: true } } },
            orderBy: { agendado_para: 'asc' }
        });
        res.json(followups);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/followups', async (req, res) => {
    const { conversaId, texto, agendado_para } = req.body;
    if (!conversaId || !texto || !agendado_para) return res.status(400).json({ error: 'Campos obrigatórios: conversaId, texto, agendado_para' });
    try {
        const followup = await prisma.followUp.create({
            data: { conversaId, texto, agendado_para: new Date(agendado_para) }
        });
        console.log(`📌 Follow-up agendado para ${conversaId} em ${agendado_para}`);
        res.json(followup);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/followups/:id/cancelar', async (req, res) => {
    try {
        await prisma.followUp.update({
            where: { id: req.params.id },
            data: { status: 'cancelado' }
        });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/followups/:id', async (req, res) => {
    try {
        await prisma.followUp.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// CRON: FOLLOW-UP AUTOMÁTICO + AGENDADOS
// ==========================================
cron.schedule('*/5 * * * *', async () => {
    console.log('⏰ Rodando verificação de Follow-up...');
    try {
        const agora = new Date();

        // 1. Follow-ups manuais agendados
        const agendados = await prisma.followUp.findMany({
            where: {
                status: 'pendente',
                agendado_para: { lte: agora }
            },
            include: { conversa: true }
        });

        for (const fu of agendados) {
            try {
                await enviarMensagemEvolution(fu.conversa.telefone, fu.texto);
                await prisma.mensagem.create({
                    data: { conversaId: fu.conversaId, texto: fu.texto, origem: 'loja' }
                });
                await prisma.followUp.update({
                    where: { id: fu.id },
                    data: { status: 'enviado', enviado_em: new Date(), tentativas: fu.tentativas + 1 }
                });
                console.log(`✅ Follow-up agendado enviado para: ${fu.conversa.nome}`);
            } catch (err) {
                await prisma.followUp.update({
                    where: { id: fu.id },
                    data: { tentativas: fu.tentativas + 1 }
                });
                console.error(`❌ Falha follow-up para ${fu.conversa.nome}:`, err.message);
            }
        }

        // 2. Follow-ups automáticos por etiqueta
        const etiquetasComFollowup = await prisma.etiqueta.findMany({
            where: { followup_texto: { not: null }, followup_horas: { not: null } }
        });
        for (const etiqueta of etiquetasComFollowup) {
            const conversas = await prisma.conversa.findMany({
                where: {
                    deleted_at: null,
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
                console.log(`✅ Follow-up automático enviado para: ${lead.nome}`);
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

