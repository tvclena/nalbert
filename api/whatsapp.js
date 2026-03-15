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
function agoraBahia(){

return new Date(
new Date().toLocaleString("en-US",{ timeZone:"America/Bahia" })
)

}

/* ================= RELATORIO AUTOMATICO ================= */

async function enviarRelatorioAutomatico(){

const ADMIN_NUMERO = "557798253249"

const agoraBahia = new Date(
new Date().toLocaleString("en-US",{ timeZone:"America/Bahia" })
)

const hoje = agoraBahia.toISOString().split("T")[0]
const {data:reservas} = await supabase
.from("reservas_mercatto")
.select("*")
.gte("datahora", hoje+"T00:00")
.lte("datahora", hoje+"T23:59")
.order("datahora",{ascending:true})

let resposta = "📊 *Relatório automático de reservas (Hoje)*\n\n"

if(!reservas || !reservas.length){

resposta += "Nenhuma reserva encontrada para hoje."

}else{

let totalPessoas = 0

reservas.forEach((r,i)=>{

const hora = r.datahora.split("T")[1].substring(0,5)

resposta += `${i+1}️⃣\n`
resposta += `Nome: ${r.nome}\n`
resposta += `Pessoas: ${r.pessoas}\n`
resposta += `Hora: ${hora}\n`
resposta += `Mesa: ${r.mesa}\n\n`

totalPessoas += Number(r.pessoas || 0)

})

resposta += `👥 Total de pessoas reservadas: ${totalPessoas}\n`
resposta += `📅 Total de reservas: ${reservas.length}`

}

return resposta

}

/* ================= AGENDA MUSICOS ================= */

async function buscarAgendaDoDia(dataISO){

const { data, error } = await supabase
.from("agenda_musicos")
.select("*")
.eq("data", dataISO)
.order("hora",{ascending:true})

if(error){
console.log("Erro agenda:",error)
return []
}

return data || []

}

function calcularCouvert(musicos){

if(!musicos.length) return 0

let maior = 0

musicos.forEach(m=>{
const valor = Number(m.valor) || 0
if(valor > maior) maior = valor
})

return maior

}

function pegarPoster(musicos){

const comFoto = musicos.find(m=>m.foto)

return comFoto ? comFoto.foto : null

}

/* ================= AGENDA PERIODO ================= */

async function buscarAgendaPeriodo(dataInicio,dataFim){

const { data, error } = await supabase
.from("agenda_musicos")
.select("*")
.gte("data",dataInicio)
.lte("data",dataFim)
.order("data",{ascending:true})
.order("hora",{ascending:true})

if(error){
console.log("Erro agenda período:",error)
return []
}

return data || []

}


module.exports = async function handler(req,res){

/* ================= CARDAPIO ================= */

async function buscarCardapio(){

const { data, error } = await supabase
.from("buffet")
.select("id,nome,tipo,descricao,preco_venda,foto_url")
.eq("cardapio", true)
.eq("ativo", true)
.order("tipo",{ascending:true})
.order("nome",{ascending:true})

if(error){
console.log("Erro cardapio:",error)
return []
}

return data || []

}
/* ================= CRON RELATORIO ================= */

if(req.query.cron === "relatorio"){

const phone_number_id = process.env.WHATSAPP_PHONE_ID

const url = `https://graph.facebook.com/v19.0/${phone_number_id}/messages`

const resposta = await enviarRelatorioAutomatico()

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
messaging_product:"whatsapp",
to:"557798253249",
type:"text",
text:{body:resposta}
})
})

return res.status(200).send("Relatório enviado")

}
/* ================= WEBHOOK VERIFY ================= */

if(req.method==="GET"){

const verify_token = process.env.VERIFY_TOKEN
const mode = req.query["hub.mode"]
const token = req.query["hub.verify_token"]
const challenge = req.query["hub.challenge"]

if(mode && token===verify_token){
console.log("Webhook verificado")
return res.status(200).send(challenge)
}

return res.status(403).end()

}

/* ================= CHAT ADMIN ================= */

if(req.method === "POST" && req.body?.admin_chat){

if(req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`){
return res.status(403).json({erro:"Acesso negado"})
}

const pergunta = req.body.pergunta || ""

console.log("PERGUNTA ADMIN:",pergunta)

const completion = await openai.chat.completions.create({

model:"gpt-4.1-mini",

messages:[

{
role:"system",
content:`
Você é o agente administrador do Mercatto Delícia.

A pessoa que está conversando agora é o ADMINISTRADOR do sistema.

Você pode responder perguntas sobre:

• reservas
• agenda de músicos
• cardápio
• clientes
• histórico de conversas
• funcionamento do restaurante
• relatórios

Responda sempre de forma clara e direta.
`
},

{
role:"user",
content:pergunta
}

]

})

return res.json({
resposta: completion.choices[0].message.content
})

}

  
/* ================= RECEBER MENSAGEM ================= */

if(req.method==="POST"){

const body=req.body

console.log("Webhook recebido:",JSON.stringify(body,null,2))

try{

const change = body.entry?.[0]?.changes?.[0]?.value

if(!change){
console.log("Evento inválido")
return res.status(200).end()
}

/* IGNORA EVENTOS DE STATUS */

if(!change.messages){
console.log("Evento sem mensagem (status)")
return res.status(200).end()
}

const msg = change.messages[0]

const mensagem = msg.text?.body
const cliente = msg.from

/* ================= VERIFICAR PAUSA BOT ================= */

const { data: pausaBot } = await supabase
.from("controle_bot")
.select("*")
.eq("telefone", cliente)
.maybeSingle()

if(pausaBot?.pausado){

// pausa permanente
if(!pausaBot.pausado_ate){
console.log("BOT PAUSADO PERMANENTEMENTE PARA:",cliente)
return res.status(200).end()
}

// pausa temporária
const agora = new Date()
const pausaAte = new Date(pausaBot.pausado_ate)

if(agora < pausaAte){
console.log("BOT PAUSADO ATÉ:",pausaBot.pausado_ate)
return res.status(200).end()
}

}

  
/* ================= MEMORIA CLIENTE ================= */


const { data: memoriaCliente } = await supabase
.from("memoria_clientes")
.select("*")
.eq("telefone",cliente)
.maybeSingle()

let nomeMemoria = memoriaCliente?.nome || null
const ADMIN_NUMERO = "557798253249"
const message_id = msg.id
const phone_number_id = change.metadata.phone_number_id
const url = `https://graph.facebook.com/v19.0/${phone_number_id}/messages`
if(!mensagem){
console.log("Mensagem vazia")
return res.status(200).end()
}

console.log("Cliente:",cliente)
console.log("Mensagem:",mensagem)

const texto = mensagem.toLowerCase()

/* ================= DETECTAR NOME AUTOMATICO ================= */

let nomeDetectado = null

const regexNome = mensagem.match(
/(?:meu nome completo é|meu nome é|me chamo|sou|aqui é|pode chamar de)\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?)/i
)

const regexAqui = mensagem.match(
/^([A-Za-zÀ-ÿ]+)\s+aqu[ií]/i
)

if(regexNome){
nomeDetectado = regexNome[1]
}

if(regexAqui){
nomeDetectado = regexAqui[1]
}

if(nomeDetectado){

nomeDetectado = nomeDetectado
.split(" ")
.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
.join(" ")

console.log("Nome detectado:", nomeDetectado)

await supabase
.from("memoria_clientes")
.upsert({
telefone:cliente,
nome:nomeDetectado,
ultima_interacao:new Date().toISOString()
})

}
if(
texto === "sim" ||
texto === "ok" ||
texto === "confirmar"
){
console.log("CONFIRMAÇÃO SIMPLES DETECTADA")
// não interrompe fluxo
}
/* ================= RELATORIO ADMIN ================= */

if(cliente === ADMIN_NUMERO && texto.includes("relatorio_reservas_dia")){

const agoraBahia = new Date(
new Date().toLocaleString("en-US",{ timeZone:"America/Bahia" })
)

const hoje = agoraBahia.toISOString().split("T")[0]
const {data:reservas} = await supabase
.from("reservas_mercatto")
.select("*")
.gte("datahora", hoje+"T00:00")
.lte("datahora", hoje+"T23:59")
.order("datahora",{ascending:true})

let resposta = "📊 *Reservas do dia*\n\n"

if(!reservas || !reservas.length){
resposta += "Nenhuma reserva encontrada."
}else{

reservas.forEach((r,i)=>{

const hora = r.datahora?.split("T")[1]?.substring(0,5) || "—"
const data = r.datahora?.split("T")[0] || "—"

resposta += `${i+1}️⃣\n`
resposta += `Nome: ${r.nome || "-"}\n`
resposta += `Telefone: ${r.telefone || "-"}\n`
resposta += `Pessoas: ${r.pessoas || "-"}\n`
resposta += `Data: ${data}\n`
resposta += `Hora: ${hora}\n`
resposta += `Mesa: ${r.mesa || "-"}\n`
resposta += `Status: ${r.status || "-"}\n`
resposta += `Comanda individual: ${r.comandaIndividual || "-"}\n`
resposta += `Origem: ${r.origem || "-"}\n`
resposta += `Observações: ${r.observacoes || "-"}\n\n`

})

}

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"text",
text:{body:resposta}
})
})

return res.status(200).end()

}
let assuntoMusica = false

if(
texto.includes("tocando") ||
texto.includes("quem toca") ||
texto.includes("quem canta") ||
texto.includes("banda") ||
texto.includes("show") ||
texto.includes("dj") ||
texto.includes("música")
){
assuntoMusica = true
}

  
/* ================= CONTROLE MUSICA ================= */

const { data: estadoMusica } = await supabase
.from("estado_conversa")
.select("*")
.eq("telefone",cliente)
.eq("tipo","musica")
.maybeSingle()

const jaFalouMusica = !!estadoMusica
console.log("JA ENVIOU PROGRAMAÇÃO:", jaFalouMusica)
let dataConsulta = new Date(
new Date().toLocaleString("en-US",{ timeZone:"America/Bahia" })
)
if(texto.includes("amanhã")){
dataConsulta.setDate(dataConsulta.getDate()+1)
}

if(texto.includes("ontem")){
dataConsulta.setDate(dataConsulta.getDate()-1)
}
let textoDia = "hoje"

if(texto.includes("ontem")){
textoDia = "ontem"
}

if(texto.includes("amanhã")){
textoDia = "amanhã"
}
const dataISO = dataConsulta.toISOString().split("T")[0]

const agendaDia = await buscarAgendaDoDia(dataISO)
  
const agora = new Date()

const agoraBahia = new Date(
agora.toLocaleString("en-US",{ timeZone:"America/Bahia" })
)

const horaAtual =
agoraBahia.getHours().toString().padStart(2,"0") +
":" +
agoraBahia.getMinutes().toString().padStart(2,"0")

  
const couvertHoje = calcularCouvert(agendaDia)

const posterHoje = pegarPoster(agendaDia)

/* ================= AGENDA PARA IA ================= */

const hojeBahia = new Date(
new Date().toLocaleString("en-US",{ timeZone:"America/Bahia" })
)

const hojeISO = hojeBahia.toISOString().split("T")[0]

const seteDias = new Date(hojeBahia)

seteDias.setDate(hojeBahia.getDate()+7)

const seteDiasISO = seteDias.toISOString().split("T")[0]

const agendaSemana = await buscarAgendaPeriodo(hojeISO,seteDiasISO)

let agendaTexto = ""

agendaSemana.forEach(m => {

agendaTexto += `
DATA: ${m.data}
ARTISTA: ${m.cantor}
HORARIO: ${m.hora}
ESTILO: ${m.estilo}
COUVERT: ${m.valor}
POSTER: ${m.foto || "sem"}
----------------------------------
`

})

let agendaHojeTexto = "SEM SHOW HOJE"

if(agendaDia.length){

agendaHojeTexto = ""

agendaDia.forEach(m => {

agendaHojeTexto += `
ARTISTA: ${m.cantor}
HORARIO: ${m.hora}
ESTILO: ${m.estilo}
COUVERT: ${m.valor}
`

})

}
/* ================= INTENÇÕES ================= */

const querReserva =
texto.includes("reserv") ||
texto.includes("mesa")

const querCardapio =
texto.includes("cardap") ||
texto.includes("menu")

const querVideo =
texto.includes("video") ||
texto.includes("vídeo")

const querFotos =
texto.includes("foto") ||
texto.includes("imagem")

const querEndereco =
texto.includes("onde fica") ||
texto.includes("endereço") ||
texto.includes("localização")

const querMusica =
texto.includes("musica") ||
texto.includes("música") ||
texto.includes("cantor") ||
texto.includes("cantora") ||
texto.includes("banda") ||
texto.includes("show") ||
texto.includes("ao vivo") ||
texto.includes("dj") ||
texto.includes("quem canta") ||
texto.includes("quem vai cantar") ||
texto.includes("quem vai tocar") ||
texto.includes("quem toca") ||
texto.includes("tocando") ||
texto.includes("quem está tocando") ||
texto.includes("quem ta tocando") ||
texto.includes("tem musica") ||
texto.includes("tem música") ||
texto.includes("tem banda") ||
texto.includes("tem show") ||
texto.includes("vai ter musica") ||
texto.includes("vai ter música") ||
texto.includes("programação") ||
texto.includes("programacao") ||
texto.includes("agenda") ||
texto.includes("quem canta hoje") ||
texto.includes("qual o couvert") ||
texto.includes("couvert")



  
console.log("DETECTOU MUSICA:", querMusica)
assuntoMusica = querMusica

if(querMusica){
console.log("FORÇANDO ASSUNTO MUSICA")
}
/* ================= BLOQUEAR DUPLICIDADE ================= */

const { data: jaProcessada } = await supabase
.from("mensagens_processadas")
.select("*")
.eq("message_id", message_id)
.single()

if(jaProcessada){
console.log("Mensagem duplicada ignorada")
return res.status(200).end()
}

await supabase
.from("mensagens_processadas")
.insert({ message_id })

/* ================= SALVAR MENSAGEM CLIENTE ================= */

await supabase
.from("conversas_whatsapp")
.insert({
telefone:cliente,
mensagem:mensagem,
role:"user"
})

if(querEndereco){

const resposta = `📍 Estamos localizados em:

Mercatto Delícia
Avenida Rui Barbosa 1264
Barreiras - BA

Mapa:
https://maps.app.goo.gl/mQcEjj8s21ttRbrQ8`

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"text",
text:{body:resposta}
})
})
await supabase
.from("conversas_whatsapp")
.insert({
telefone:cliente,
mensagem:resposta,
role:"assistant"
})
return res.status(200).end()

}
  

/* ================= MUSICA AO VIVO ================= */

if(querMusica && !jaFalouMusica){

console.log("RESPONDENDO AUTOMATICO MUSICA")

let resposta=""

if(agendaDia.length){

if(textoDia==="ontem"){
resposta = `🎶 Ontem tivemos música ao vivo no Mercatto:\n\n`
}
else if(textoDia==="amanhã"){
resposta = `🎶 Música ao vivo amanhã no Mercatto:\n\n`
}
else{
resposta = `🎶 Música ao vivo hoje no Mercatto:\n\n`
}
agendaDia.forEach(m=>{

resposta += `🎤 ${m.cantor}\n`
resposta += `🕒 ${m.hora}\n`
resposta += `🎵 ${m.estilo}\n\n`

})

resposta += `💰 Couvert artístico: R$ ${couvertHoje.toFixed(2)}`
}else{

if(textoDia==="ontem"){
resposta = "Ontem não tivemos música ao vivo no Mercatto."
}
else if(textoDia==="amanhã"){
resposta = "Ainda não temos música ao vivo programada para amanhã."
}
else{
resposta = "Hoje não temos música ao vivo programada."
}
}

/* ENVIA POSTER */

if(posterHoje && posterHoje.startsWith("http")){
await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"image",
image:{
link:posterHoje,
caption:`🎶 Música ao vivo ${textoDia} no Mercatto`
}
})
})

}

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"text",
text:{body:resposta}
})
})
await supabase
.from("conversas_whatsapp")
.insert({
telefone:cliente,
mensagem:resposta,
role:"assistant"
})
await supabase
.from("estado_conversa")
.upsert({
telefone:cliente,
tipo:"musica"
})
return res.status(200).end()

}

if(querVideo){
  
await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"video",
video:{
link:"https://dxkszikemntfusfyrzos.supabase.co/storage/v1/object/public/MERCATTO/WhatsApp%20Video%202026-03-10%20at%2021.08.40.mp4",
caption:"Conheça o Mercatto Delícia"
}
})
})
await supabase
.from("conversas_whatsapp")
.insert({
telefone:cliente,
mensagem:"[VIDEO DO RESTAURANTE ENVIADO]",
role:"assistant"
})
return res.status(200).end()

}
  

  
  
if(querCardapio){

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"document",
document:{
link:"https://SEU_CARDAPIO.pdf",
filename:"Cardapio_Mercatto.pdf"
}
})
})

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"text",
text:{body:"Aqui está nosso cardápio completo 😊"}
})
})
await supabase
.from("conversas_whatsapp")
.insert({
telefone:cliente,
mensagem:"[CARDAPIO ENVIADO]",
role:"assistant"
})
return res.status(200).end()

} 


/* ================= HISTÓRICO ================= */

const {data:historico} = await supabase
.from("conversas_whatsapp")
.select("*")
.eq("telefone",cliente)
.order("created_at",{ascending:false})
.limit(20)

const mensagens = (historico || [])
.reverse()
.map(m => ({
  role: m.role === "assistant" ? "assistant" : "user",
  content: m.mensagem
}))
.slice(-6)
  
if(assuntoMusica){
mensagens.unshift({
role:"system",
content:"ATENÇÃO: A mensagem atual do cliente é sobre música ao vivo. Ignore reservas e responda usando a agenda fornecida."
})
}
let resposta=""
/* ================= BUSCAR CARDAPIO ================= */

const cardapio = await buscarCardapio()

let cardapioTexto = ""

cardapio.forEach(p => {

cardapioTexto += `
PRATO: ${p.nome}
TIPO: ${p.tipo}
PRECO: ${p.preco_venda}
DESCRICAO: ${p.descricao || "sem descrição"}
FOTO: ${p.foto_url || "sem"}
-------------------------
`

})
/* ================= OPENAI ================= */

try{

const agora = new Date()

const agoraBahia = new Date(
agora.toLocaleString("en-US", { timeZone: "America/Bahia" })
)

const dataAtual = agoraBahia.toLocaleDateString("pt-BR")

const horaAtualSistema =
agoraBahia.getHours().toString().padStart(2,"0") +
":" +
agoraBahia.getMinutes().toString().padStart(2,"0")

const dataAtualISO =
agoraBahia.toISOString().split("T")[0]

  
/* ================= BUSCAR PROMPT ================= */

const { data: prompts } = await supabase
.from("prompts_mercatto")
.select("prompt")
.eq("ativo", true)
.order("ordem",{ascending:true})

const promptSistema = (prompts || [])
.map(p => p.prompt)
.join("\n\n")


const completion = await openai.chat.completions.create({

model:"gpt-4.1-mini",

messages:[

{
role:"system",
content:`
REGRAS DE PRIORIDADE DO AGENTE

1. O prompt do sistema sempre tem prioridade máxima.
2. Se houver conflito entre respostas antigas e o prompt atual, siga sempre o prompt atual.
3. Respostas anteriores do assistente servem apenas como contexto da conversa.
4. Nunca use respostas antigas como regra se o prompt atual disser algo diferente.
`
},

{
role:"system",
content: assuntoMusica 
? "A pergunta atual do cliente é sobre música ao vivo. Ignore reservas."
: "A pergunta atual do cliente não é sobre música."
},

{
role:"system",
content: nomeMemoria
? `O nome do cliente é ${nomeMemoria}. Use o nome dele se for natural na conversa.`
: "O nome do cliente ainda não é conhecido."
},


{
role:"system",
content: promptSistema
},

{
role:"system",
content:`
CONTEXTO DO SISTEMA

DATA ATUAL: ${dataAtual}
HORA ATUAL: ${horaAtualSistema}
DATA ISO: ${dataAtualISO}

Use essas informações para interpretar datas relativas como:
hoje, amanhã, ontem, final de semana, etc.
`
},
{
role:"system",
content:`
CARDÁPIO DO MERCATTO DELÍCIA

Abaixo está a lista de pratos disponíveis.

${cardapioTexto}

Regras importantes:

- Utilize apenas pratos desta lista.
- Nunca invente pratos.
- Se o cliente perguntar preço use PRECO.
- Se pedir foto de um prato responda com ENVIAR_FOTO_PRATO.
`
},
...mensagens

]

})

resposta = completion.choices[0].message.content
/* ================= DETECTAR MIDIA ================= */

if(resposta.includes("ENVIAR_CARDAPIO")){

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body: JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"document",
document:{
link:"https://SEU_CARDAPIO.pdf",
filename:"Cardapio_Mercatto.pdf"
}
})
})

resposta = resposta.replace(/ENVIAR_CARDAPIO/g,"").trim()
}

if(resposta.includes("ENVIAR_FOTOS")){

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body: JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"image",
image:{
link:"https://dxkszikemntfusfyrzos.supabase.co/storage/v1/object/public/MERCATTO/images%20(1).jpg",
caption:"Mercatto Delícia"
}
})
})

await supabase
.from("conversas_whatsapp")
.insert({
telefone:cliente,
mensagem:"[FOTOS DO RESTAURANTE ENVIADAS]",
role:"assistant"
})

resposta = resposta.replace(/ENVIAR_FOTOS/g,"").trim()

}
if(resposta.includes("ENVIAR_FOTOS_SALA_VIP")){

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body: JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"image",
image:{
link:"https://dxkszikemntfusfyrzos.supabase.co/storage/v1/object/public/MERCATTO/salas_vip/sala1.jpg",
caption:"Sala VIP Mercatto Delícia"
}
})
})

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body: JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"image",
image:{
link:"https://dxkszikemntfusfyrzos.supabase.co/storage/v1/object/public/MERCATTO/salas_vip/sala2.jpg",
caption:"Ambiente da Sala VIP"
}
})
})

resposta = resposta.replace(/ENVIAR_FOTOS_SALA_VIP/g,"").trim()

}

if(resposta.includes("ENVIAR_POSTER")){

if(posterHoje){

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body: JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"image",
image:{
link:posterHoje,
caption:"🎶 Música ao vivo no Mercatto"
}
})
})

}

resposta = resposta.replace(/ENVIAR_POSTER/g,"").trim()

}

  
if(resposta.includes("ENVIAR_VIDEO")){

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body: JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"video",
video:{
link:"https://dxkszikemntfusfyrzos.supabase.co/storage/v1/object/public/MERCATTO/WhatsApp%20Video%202026-03-10%20at%2021.08.40.mp4",
caption:"Conheça o Mercatto Delícia"
}
})
})

resposta = resposta.replace(/ENVIAR_VIDEO/g,"").trim()
}

if(resposta.includes("ENVIAR_FOTO_PRATO")){

const respostaLower = resposta.toLowerCase()

const prato = cardapio.find(p => 
respostaLower.includes(p.nome.toLowerCase())
)

if(prato && prato.foto_url){

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body: JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"image",
image:{
link:prato.foto_url,
caption:prato.nome
}
})
})

await supabase
.from("conversas_whatsapp")
.insert({
telefone:cliente,
mensagem:`[FOTO DO PRATO ENVIADA: ${prato.nome}]`,
role:"assistant"
})

}

resposta = resposta.replace(/ENVIAR_FOTO_PRATO/g,"").trim()

}
console.log("Resposta IA:",resposta)

}catch(e){

console.log("ERRO OPENAI",e)

resposta=
`👋 Bem-vindo ao Mercatto Delícia

Digite:

1️⃣ Cardápio
2️⃣ Reservas
3️⃣ Endereço`

}

/* ================= RESERVA SALA VIP ================= */

const vipMatch = resposta?.match(/RESERVA_SALA_VIP_JSON:\s*({[\s\S]*?})/)
if(vipMatch){

let reservaVip

try{
reservaVip = JSON.parse(vipMatch[1])
}catch(err){
console.log("Erro JSON VIP", err)
}

if(reservaVip){

let salaBanco = "Sala VIP 1"
/* ================= VALIDAR DATA ================= */

const [ano, mes, dia] = reservaVip.data.split("-").map(Number)

const dataTest = new Date(ano, mes - 1, dia)

console.log("VALIDANDO DATA VIP:", reservaVip.data, reservaVip.hora)

/* VERIFICAR SE DATA EXISTE */

if(
dataTest.getFullYear() !== ano ||
dataTest.getMonth() + 1 !== mes ||
dataTest.getDate() !== dia
){

console.log("DATA IMPOSSIVEL:", reservaVip.data)

resposta = "⚠️ Essa data não existe no calendário. Pode confirmar a data novamente?"

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"text",
text:{ body:resposta }
})
})

return res.status(200).end()

}
/* BLOQUEAR DATA PASSADA */

const agora = new Date()

if(dataTest < agora){
console.log("DATA PASSADA")

resposta = "⚠️ Não é possível reservar para uma data passada. Pode escolher outra data?"

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"text",
text:{ body:resposta }
})
})

return res.status(200).end()
}

/* BLOQUEAR HORÁRIO APÓS 19:00 */

const horaReserva = parseInt(reservaVip.hora.split(":")[0])

if(horaReserva > 19){
console.log("HORARIO INVALIDO")

resposta = "⚠️ As reservas podem ser feitas apenas até às 19:00. Pode escolher outro horário?"

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"text",
text:{ body:resposta }
})
})

return res.status(200).end()
}


if(reservaVip.sala?.toLowerCase().includes("2")){
salaBanco = "Sala VIP 2"
}

console.log("Reserva VIP detectada:", reservaVip)

/* ================= ATUALIZAR MEMORIA CLIENTE ================= */

if(reservaVip?.nome){

await supabase
.from("memoria_clientes")
.upsert({
telefone:cliente,
nome:reservaVip.nome,
ultima_interacao:new Date().toISOString()
})

}
/* SALVAR NO SUPABASE */

const datahora = reservaVip.data + "T" + reservaVip.hora

const { error } = await supabase
.from("reservas_mercatto")
.insert({

acao: "cadastrar",
status: "Pendente",

nome: reservaVip.nome,
email: "",
telefone: cliente,

pessoas: parseInt(reservaVip.pessoas) || 1,

mesa: salaBanco,
cardapio: "",

observacoes: "Reserva sala VIP via WhatsApp",

datahora: datahora,

valorEstimado: 0,
pagamentoAntecipado: 0,
valorFinalPago: 0,

banco: "",

comandaindividual: false,
comandaIndividual: reservaVip.comandaIndividual || "Não",

origem: "whatsapp"

})

if(error){
console.log("ERRO AO SALVAR VIP:", error)
}else{
console.log("Reserva VIP salva com sucesso")
}

/* DATA FORMATADA */

const [anoVip, mesVip, diaVip] = reservaVip.data.split("-")

const dataCliente = `${diaVip}/${mesVip}/${anoVip}`
/* RESPOSTA PARA CLIENTE */

resposta = `✅ *Pré-reserva da sala confirmada!*

Nome: ${reservaVip.nome}
Sala: ${salaBanco}
Pessoas: ${reservaVip.pessoas}
Data: ${dataCliente}
Hora: ${reservaVip.hora}

📍 Mercatto Delícia
Avenida Rui Barbosa 1264

Nossa equipe entrará em contato para finalizar a reserva da sala VIP.`

}

}
try{
const alterarMatch = resposta.match(/ALTERAR_RESERVA_JSON:\s*({[\s\S]*?})/)

if(alterarMatch){

let reserva

try{
reserva = JSON.parse(alterarMatch[1])
}catch(err){
console.log("Erro JSON alteração:", err)
}

/* BLOQUEAR ALTERAÇÃO VAZIA */

if(
!reserva.nome &&
!reserva.pessoas &&
!reserva.data &&
!reserva.hora &&
!reserva.area &&
!reserva.comandaIndividual
){
console.log("ALTERAÇÃO IGNORADA - JSON VAZIO")
return res.status(200).end()
}

console.log("Alteração detectada:", reserva)

await supabase
.from("reservas_mercatto")
.update({
nome: reserva.nome,
pessoas: parseInt(reserva.pessoas) || 1,
comandaIndividual: reserva.comandaIndividual || "Não"
})
.eq("telefone", cliente)
.eq("status","Pendente")
.order("datahora",{ascending:false})
.limit(1)

resposta = `✅ *Reserva atualizada!*

Nome: ${reserva.nome}
Pessoas: ${reserva.pessoas}
Data: ${reserva.data}
Hora: ${reserva.hora}

Sua reserva foi atualizada.`

}
const match = resposta.match(/RESERVA_JSON:\s*({[\s\S]*?})/)
if(match){

let reserva

try{
  reserva = JSON.parse(match[1])
}
catch(err){
  console.log("Erro ao interpretar JSON da reserva:", match[1])
  resposta = "Desculpe, tive um problema ao processar sua reserva. Pode confirmar novamente?"
}
console.log("Reserva detectada:",reserva)

/* ================= ATUALIZAR MEMORIA CLIENTE ================= */

if(reserva?.nome){

await supabase
.from("memoria_clientes")
.upsert({
telefone:cliente,
nome:reserva.nome,
ultima_interacao:new Date().toISOString()
})

}
  
/* NORMALIZAR DATA */

/* NORMALIZAR DATA */

let dataISO = reserva.data

if(reserva.data && reserva.data.includes("/")){

const [dia,mes] = reserva.data.split("/")

const agoraBahia = new Date(
new Date().toLocaleString("en-US",{ timeZone:"America/Bahia" })
)

const ano = agoraBahia.getFullYear()

dataISO = `${ano}-${mes}-${dia}`

}

/* NORMALIZAR AREA */

let mesa="Salão Central"
const areaTexto=(reserva.area || "").toLowerCase()

if(
areaTexto.includes("extern") ||
areaTexto.includes("fora") ||
areaTexto.includes("sacada")
){
mesa="Área Externa"
}

if(
areaTexto.includes("vip") ||
areaTexto.includes("paulo augusto 1")
){
mesa="Sala VIP 1"
}

if(
areaTexto.includes("vip 2") ||
areaTexto.includes("paulo augusto 2")
){
mesa="Sala VIP 2"
}

/* DATAHORA */

const datahora = dataISO+"T"+reserva.hora

/* SALVAR RESERVA */

const {error} = await supabase
.from("reservas_mercatto")
.insert({

nome:reserva.nome,
email:"",
telefone:cliente,
pessoas: parseInt(reserva.pessoas) || 1,
mesa:mesa,
cardapio:"",
comandaIndividual: reserva.comandaIndividual || "Não",
  datahora:datahora,
observacoes:"Reserva via WhatsApp",
valorEstimado:0,
pagamentoAntecipado:0,
banco:"",
status:"Pendente"

})

if(!error){


const [anoR, mesR, diaR] = dataISO.split("-")

const dataClienteReserva = `${diaR}/${mesR}/${anoR}`

resposta =
`✅ *Reserva confirmada!*

Nome: ${reserva.nome}
Pessoas: ${reserva.pessoas}
Data: ${dataClienteReserva}
Hora: ${reserva.hora}
Área: ${mesa}

📍 Mercatto Delícia
Avenida Rui Barbosa 1264

Sua mesa estará reservada.
Aguardamos você!`

}
}

}catch(e){

console.log("Erro ao processar reserva:",e)

}

/* ================= SALVAR RESPOSTA ================= */

await supabase
.from("conversas_whatsapp")
.insert({
telefone:cliente,
mensagem:resposta,
role:"assistant"
})

/* ================= ENVIAR WHATSAPP ================= */


await fetch(url,{

method:"POST",

headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},

body:JSON.stringify({

messaging_product:"whatsapp",

to:cliente,

type:"text",

text:{
body:resposta
}

})

})

}catch(error){

console.log("ERRO GERAL:",error)

return res.status(200).end()

}

return res.status(200).end()

}

}
