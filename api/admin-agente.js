const OpenAI = require("openai")
const { createClient } = require("@supabase/supabase-js")

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
)

const ADMIN_TOKEN = process.env.ADMIN_TOKEN

module.exports = async function handler(req, res){

try{

/* ================= AUTORIZAÇÃO ================= */

if(req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`){
return res.status(403).json({erro:"acesso negado"})
}

/* ================= BODY ================= */

const body =
typeof req.body === "string"
? JSON.parse(req.body)
: req.body

const pergunta = body?.pergunta || ""
const confirmar = body?.confirmar || null

/* ================= CONFIRMAR AÇÃO ================= */

if(confirmar){

try{

const acao = confirmar

if(acao.operacao === "insert"){

await supabase
.from(acao.tabela)
.insert(acao.dados)

}

if(acao.operacao === "update"){

await supabase
.from(acao.tabela)
.update(acao.dados)
.match(acao.filtro)

}

if(acao.operacao === "delete"){

await supabase
.from(acao.tabela)
.delete()
.match(acao.filtro)

}

await supabase
.from("administrador_chat")
.insert({
role:"assistant",
mensagem:"✅ Ação executada com sucesso"
})

return res.json({
resposta:"✅ Ação executada com sucesso"
})

}catch(e){

console.error("Erro executar ação:",e)

return res.json({
resposta:"Erro ao executar ação"
})

}

}

/* ================= SALVAR PERGUNTA ================= */

await supabase
.from("administrador_chat")
.insert({
role:"user",
mensagem:pergunta
})

/* ================= HISTÓRICO ================= */

const {data:historico} = await supabase
.from("administrador_chat")
.select("*")
.order("created_at",{ascending:false})
.limit(20)

const mensagens = (historico || [])
.reverse()
.map(m => ({
role: m.role,
content: m.mensagem
}))

/* ================= BUSCAR DADOS SISTEMA ================= */

const {data:reservas} = await supabase
.from("reservas_mercatto")
.select("*")
.limit(100)

const {data:agenda} = await supabase
.from("agenda_musicos")
.select("*")
.limit(100)

const {data:clientes} = await supabase
.from("memoria_clientes")
.select("*")
.limit(100)

const {data:conversas} = await supabase
.from("conversas_whatsapp")
.select("*")
.limit(50)

const {data:buffet} = await supabase
.from("buffet")
.select("*")
.limit(100)

/* ================= OPENAI ================= */

const completion = await openai.chat.completions.create({

model:"gpt-4.1-mini",

messages:[

{
role:"system",
content:`
Você é o **Agente Administrador Inteligente do Mercatto Delícia**.

Seu papel é responder ao administrador do sistema com **informações organizadas, claras e profissionais**.

IMPORTANTE:

Sempre organize as respostas seguindo estas regras:

1. Use **emojis para separar seções**.
2. Nunca responda com texto solto ou bagunçado.
3. Sempre organize as informações em blocos.
4. Quando citar itens (pratos, reservas, eventos) use listas.
5. Quando existir mídia (foto ou vídeo), envie o link da mídia na resposta.
6. Nunca invente dados que não estejam no sistema.
7. Se o administrador pedir foto ou vídeo, sempre envie a mídia correspondente.
8. Sempre destaque números importantes (totais, valores, contagens).

---

FORMATO PADRÃO DE RESPOSTA

Toda resposta deve seguir este formato:

📊 TÍTULO DA RESPOSTA

📌 Informações principais

• item 1
• item 2
• item 3

📈 Resumo

Total: X
Valor: X

---

EXEMPLO DE RESPOSTA CORRETA

📊 Reservas do dia

👥 Total de reservas: 12
👨‍👩‍👧‍👦 Pessoas previstas: 48

📌 Próximas reservas

1️⃣ João Silva
Pessoas: 4
Hora: 19:30

2️⃣ Maria Souza
Pessoas: 6
Hora: 20:00

---

ENVIO DE IMAGENS

Quando for necessário enviar uma foto, use:

📷 Foto do prato:

https://site.com/imagem.jpg

---

ENVIO DE VÍDEOS

Quando for necessário enviar vídeo:

🎥 Vídeo do ambiente:

https://site.com/video.mp4

---

CARDÁPIO

Quando o administrador pedir cardápio ou prato:

🍽️ Nome do prato

Descrição
Preço

📷 Foto:

URL_DA_IMAGEM

---

AGENDA MUSICAL

🎶 Música ao vivo

🎤 Artista
🕒 Horário
🎵 Estilo

📷 Poster do evento:

URL_DA_IMAGEM

---

RELATÓRIOS

📊 Relatório

Reservas: X
Clientes: X
Eventos: X

---

PROIBIDO

Nunca responder:

texto sem formatação
dados soltos
listas confusas
respostas sem organização

Sempre organize a resposta visualmente.

`
},

{
role:"system",
content:`RESERVAS:\n${JSON.stringify(reservas || [])}`
},

{
role:"system",
content:`AGENDA:\n${JSON.stringify(agenda || [])}`
},

{
role:"system",
content:`CLIENTES:\n${JSON.stringify(clientes || [])}`
},

{
role:"system",
content:`CONVERSAS:\n${JSON.stringify(conversas || [])}`
},

{
role:"system",
content:`CARDAPIO:\n${JSON.stringify(buffet || [])}`
},

...mensagens

]

})

let resposta = completion.choices[0].message.content

/* ================= DETECTAR AÇÃO ================= */

const match = resposta.match(/ALTERAR_REGISTRO_JSON:\s*({[\s\S]*?})/)

let acao = null

if(match){

try{

acao = JSON.parse(match[1])

resposta += "\n\n⚠️ Confirme para executar esta ação."

}catch(e){

console.log("Erro parse JSON ação")

}

}

/* ================= SALVAR RESPOSTA ================= */

await supabase
.from("administrador_chat")
.insert({
role:"assistant",
mensagem:resposta,
acao_json:acao
})

return res.json({
resposta,
acao
})

}catch(e){

console.error("ERRO GERAL:",e)

return res.status(500).json({
erro:"erro interno"
})

}

}
