# Alterações para o server.js

## 1. No systemPrompt da Deise — ADICIONAR após "Polo Piquet Feminina" (após linha ~210):

Adicionar no bloco de MODELOS DISPONÍVEIS:

```
Camiseta Manga Longa Gola Careca
- gola redonda
- tamanhos: P, M, G, GG, EG
- tecido: 100% algodão (cinza mescla: 88% algodão e 12% poliéster)
- cores: Amarelo, Azul Marinho, Azul Royal, Azul Turquesa, Bordô, Branco, Cinza Mescla, Cinza Grafite, Laranja, Preto, Verde Bandeira, Verde Limão, Verde Musgo, Vermelho
```

## 2. No CRON schedule — melhorar para usar etapas do funil

O cron já roda a cada 5min — OK. Manter como está.

## 3. Adicionar rotas para o funil de follow-up

Já existem: /api/pipeline, /api/followups — perfeito.
