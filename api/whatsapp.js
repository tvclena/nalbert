const OpenAI = require("openai")
const { createClient } = require("@supabase/supabase-js")

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
)
const ADMINS = [
  "557798253249",
  "557798315510"
]




const TEMPLATES_PERMITIDOS = [
"confirmao_reserva",
"lembrete_reserva",
"confirmacao_pedido",
"video_mercatto",
"reserva_especial" // 👈 FALTAVA ISSO
]











function agoraBahia(){
  return new Date(
    new Date().toLocaleString("en-US",{ timeZone:"America/Bahia" })
  )
}

// Quando precisar da data, use assim:
const agora = agoraBahia();

/* ================= RELATORIO AUTOMATICO ================= */

async function enviarRelatorioAutomatico(){

const numerosAdmins = ADMINS
  
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

const hora = r.datahora?.split("T")[1]?.substring(0,5) || "--:--"
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

musicos.forEach(m => {

const valor = Number(m.valor) || 0

if(valor > maior){
maior = valor
}

})

return maior

}

function pegarPoster(musicos){

if(!musicos || !musicos.length) return null

const comPoster = musicos.find(m => 
m.foto && m.foto.startsWith("http")
)

return comPoster ? comPoster.foto : null

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
/* ================= BUSCAR CARDAPIO ================= */

async function buscarCardapio(){

const { data, error } = await supabase
.from("buffet")
.select("id,nome,tipo,descricao,preco_venda,foto_url")
.eq("ativo",true)
.eq("cardapio",true)
.order("tipo",{ascending:true})
.order("nome",{ascending:true})

if(error){
console.log("Erro cardápio:",error)
return []
}

return data || []

}
function getHojeBahia(){
  const agora = new Date().toLocaleString("sv-SE", {
    timeZone: "America/Bahia"
  })
  return agora.split(" ")[0]
}
/* ================= BUSCAR BUFFET (SIMPLES) ================= */



async function buscarBuffetHoje(){

const hojeISO = getHojeBahia()

console.log("DATA CONSULTADA (BAHIA):", hojeISO)

const { data, error } = await supabase
.from("buffet_lancamentos")
.select("produto_nome,tipo,data")
.eq("empresa","MERCATTO DELÍCIA")
.eq("tipo","MONTAGEM")
.gte("data", hojeISO)
.lte("data", hojeISO)

if(error){
console.log("❌ ERRO AO BUSCAR BUFFET:", error)
return []
}

if(!data || !data.length){
console.log("⚠️ SEM DADOS DO BUFFET PARA HOJE")
return []
}

/* REMOVE DUPLICADOS */
const unicos = []
const nomes = new Set()

for(const item of data){

if(!nomes.has(item.produto_nome)){
nomes.add(item.produto_nome)
unicos.push(item)
}

}

console.log("✅ ITENS DO BUFFET:", unicos)

return unicos
}


/* ================= VERIFICAR SE TEM PRODUTO (INTELIGENTE) ================= */

function normalizar(txt){
return txt
.toLowerCase()
.normalize("NFD")
.replace(/[\u0300-\u036f]/g,"")
}

function temProduto(buffet, texto){

const textoLimpo = normalizar(texto)

/* QUEBRA TEXTO EM PALAVRAS */
const palavras = textoLimpo.split(" ")

for(const item of buffet){

const nome = normalizar(item.produto_nome)

/* SE QUALQUER PALAVRA BATER */
const encontrou = palavras.some(p => nome.includes(p))

if(encontrou){
return item.produto_nome
}

}

return null
}
/* ================= CLASSIFICAR MENSAGEM ================= */

async function classificarMensagem(texto){

  const resp = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `
Classifique a mensagem do cliente em UMA dessas categorias:

- reclamacao
- feedback
- elogio
- neutro

Responda apenas com UMA palavra.
`
      },
      {
        role: "user",
        content: texto
      }
    ]
  })

  return resp.choices[0].message.content
    .toLowerCase()
    .trim()
}




module.exports = async function handler(req,res){
let resposta = ""


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

const mensagensRecebidas = change.messages || []

// ignora mensagens do próprio bot
if(mensagensRecebidas[0]?.from === change.metadata.phone_number_id){
console.log("Mensagem do próprio bot ignorada")
return res.status(200).end()
}

const mensagensTexto = mensagensRecebidas
  .map(m => m.text?.body)
  .filter(Boolean)

const mensagem = mensagensTexto.join(" ")

const cliente = mensagensRecebidas[0]?.from
const message_id = mensagensRecebidas[0]?.id
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
const phone_number_id = change.metadata.phone_number_id
const url = `https://graph.facebook.com/v19.0/${phone_number_id}/messages`
if(!mensagem){
console.log("Mensagem vazia")
return res.status(200).end()
}

console.log("Cliente:",cliente)
console.log("Mensagem:",mensagem)
const texto = mensagem.toLowerCase()
const textoNormalizado = normalizar(texto)
/* ================= DETECTAR RECLAMAÇÃO ================= */

const tipoMensagem = await classificarMensagem(mensagem)

console.log("CLASSIFICAÇÃO:", tipoMensagem)

if(
  tipoMensagem === "reclamacao" ||
  tipoMensagem === "feedback"
){

  console.log("🚨 RECLAMAÇÃO OU FEEDBACK DETECTADO")

  /* BUSCAR NOME */
  const nomeCliente = nomeMemoria || "Não identificado"

  /* MENSAGEM PARA ADMIN */
  const alertaAdmin = `
🚨 *ALERTA DE CLIENTE*

📱 Telefone: ${cliente}
👤 Nome: ${nomeCliente}

📝 Tipo: ${tipoMensagem.toUpperCase()}

💬 Mensagem:
"${mensagem}"
`

 /* ENVIAR PARA ADMINS */
for(const admin of ADMINS){

  console.log("ENVIANDO PARA ADMIN:", admin)

  const resp = await fetch(url,{
    method:"POST",
    headers:{
      Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify({
      messaging_product:"whatsapp",
      to: admin,
      type:"text",
      text:{ body: alertaAdmin }
    })
  })

  const data = await resp.json()
  console.log("RESPOSTA WHATSAPP:", data)

}

  /* SALVAR NO BANCO (OPCIONAL MAS RECOMENDO) */
  await supabase
  .from("feedback_clientes")
  .insert({
    telefone: cliente,
    nome: nomeCliente,
    mensagem: mensagem,
    tipo: tipoMensagem
  })

  /* RESPOSTA AUTOMÁTICA PARA CLIENTE */
  resposta = `🙏 Sentimos muito por isso, ${nomeCliente}.

Seu feedback é muito importante para nós e já foi encaminhado para nossa equipe.

Vamos resolver o mais rápido possível. 💛`

  /* ENVIA RESPOSTA */
  await fetch(url,{
    method:"POST",
    headers:{
      Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify({
      messaging_product:"whatsapp",
      to: cliente,
      type:"text",
      text:{ body: resposta }
    })
  })

  return res.status(200).end()
}
/* ================= PEDIDO DIRETO DO CLIENTE ================= */

const pedidoClienteMatch = mensagem.match(/PEDIDO_DELIVERY_JSON:\s*({[\s\S]*?})/)

if(pedidoClienteMatch){

console.log("PEDIDO RECEBIDO DIRETAMENTE DO CLIENTE")

let pedido

let jsonTexto = pedidoClienteMatch[1]

try{

pedido = JSON.parse(jsonTexto)

console.log("JSON DO CLIENTE OK:", pedido)

}catch(err){

console.log("ERRO JSON CLIENTE:", err)
console.log("JSON RECEBIDO:", jsonTexto)

return res.status(200).end()

}

/* CALCULAR TOTAL */

const valorTotal = (pedido.itens || []).reduce((s,i)=>{

const preco = Number(i.preco || 0)
const qtd = Number(i.quantidade || 1)

return s + (preco * qtd)

},0)

console.log("SALVANDO PEDIDO CLIENTE")

await supabase
.from("pedidos_pendentes")
.delete()
.eq("cliente_telefone",cliente)

const {error} = await supabase
.from("pedidos_pendentes")
.insert({
cliente_nome: pedido.nome,
cliente_telefone: cliente,
cliente_endereco: pedido.endereco || "",
cliente_bairro: pedido.bairro || "",
itens: pedido.itens || [],
valor_total: valorTotal,
forma_pagamento: pedido.pagamento || "",
observacao: pedido.observacao || ""
})

if(error){
console.log("ERRO AO SALVAR:",error)
}else{
console.log("PEDIDO SALVO")
}

/* ESTADO */

await supabase
.from("estado_conversa")
.upsert({
telefone:cliente,
tipo:"confirmacao_pedido"
})

resposta = `🧾 *Resumo do seu pedido*

${(pedido.itens || []).map(i=>`• ${i.quantidade}x ${i.nome}`).join("\n")}

💰 Total: R$ ${valorTotal.toFixed(2)}

Deseja confirmar o pedido?`

}

  
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
const confirmou =
texto.includes("sim") ||
texto.includes("ok") ||
texto.includes("confirm") ||
texto.includes("pode") ||
texto.includes("manda") ||
texto.includes("confirmar") ||
texto.includes("pode sim") ||
texto.includes("certo") ||
texto.includes("isso mesmo") ||  
texto.includes("enviar")




  
if(confirmou){

const { data: estado } = await supabase
.from("estado_conversa")
.select("*")
.eq("telefone",cliente)
.maybeSingle()

if(estado?.tipo === "confirmacao_pedido"){

console.log("CONFIRMAÇÃO DE PEDIDO")

const { data: pedidoPendente } = await supabase
.from("pedidos_pendentes")
.select("*")
.eq("cliente_telefone",cliente)
.order("created_at",{ascending:false})
.limit(1)
.single()


  
if(pedidoPendente){

const pedido = {
nome: pedidoPendente.cliente_nome,
endereco: pedidoPendente.cliente_endereco,
bairro: pedidoPendente.cliente_bairro,
itens: pedidoPendente.itens,
pagamento: pedidoPendente.forma_pagamento
}

  
console.log("ENVIANDO PEDIDO PARA API")

const api = await fetch(`${process.env.API_URL}/api/pedidos`,{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
pedido:{
...pedido,
telefone:cliente
}
})
})

const retorno = await api.json()

console.log("RETORNO API:",retorno)

resposta = `✅ *Pedido enviado com sucesso!*

🧾 Número do pedido: ${retorno.pedido_id}

Nossa cozinha já recebeu seu pedido.`

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
.from("pedidos_pendentes")
.delete()
.eq("cliente_telefone",cliente)

await supabase
.from("pedidos")
.insert([{
cliente_nome: pedido.nome,
cliente_telefone: cliente,
cliente_endereco: pedido.endereco || "",
cliente_bairro: pedido.bairro || "",
tipo: pedido.tipo || "entrega",
itens: pedido.itens || [],
valor_total: pedido.itens.reduce((s,i)=>s+(i.preco*i.quantidade),0),
forma_pagamento: pedido.pagamento || "",
observacao: pedido.observacao || "",
status: "novo"
}])

return res.status(200).end()
/* limpar pedido pendente */

await supabase
.from("pedidos_pendentes")
.delete()
.eq("cliente_telefone",cliente)
}

/* limpar estado conversa */

await supabase
.from("estado_conversa")
.delete()
.eq("telefone",cliente)

}
}
/* ================= RELATORIO ADMIN ================= */

if(ADMINS.includes(cliente) && texto.includes("Reservas do dia")){
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
const couvertHoje = calcularCouvert(agendaDia)
const agora = new Date()

const agoraBahia = new Date(
agora.toLocaleString("en-US",{ timeZone:"America/Bahia" })
)

const horaAtual =
agoraBahia.getHours().toString().padStart(2,"0") +
":" +
agoraBahia.getMinutes().toString().padStart(2,"0")

  
resposta += `💰 Couvert artístico: R$ ${couvertHoje.toFixed(2)}`
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
textoNormalizado.includes("reserv") ||
textoNormalizado.includes("mesa")

const querCardapio =
textoNormalizado.includes("cardap") ||
textoNormalizado.includes("menu") ||
textoNormalizado.includes("pratos")

/* 🔥 BUFFET INTELIGENTE */
const querBuffet =
textoNormalizado.includes("buffet") ||
textoNormalizado.includes("buffer") ||
textoNormalizado.includes("almoco") ||
textoNormalizado.includes("comida") ||
textoNormalizado.includes("tem o que") ||
textoNormalizado.includes("tem hoje") ||
textoNormalizado.includes("o que tem") ||
textoNormalizado.startsWith("tem ")

const querVideo =
textoNormalizado.includes("video") ||
textoNormalizado.includes("vídeo")

const querFotos =
textoNormalizado.includes("foto") ||
textoNormalizado.includes("imagem")

const querEndereco =
textoNormalizado.includes("onde fica") ||
textoNormalizado.includes("endereco") ||
textoNormalizado.includes("endereço") ||
textoNormalizado.includes("localizacao") ||
textoNormalizado.includes("localização")


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

if(querMusica){

console.log("RESPONDENDO AUTOMATICO MUSICA")

resposta=""

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
resposta=""
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

/* ================= BUSCAR BUFFET ================= */

const buffet = await buscarBuffetHoje()

let buffetTexto = ""

if(!buffet.length){
  buffetTexto = "SEM ITENS NO BUFFET HOJE"
}else{
  buffet.forEach(item => {
    buffetTexto += `
ITEM: ${item.produto_nome}
CATEGORIA: ${item.tipo || "geral"}
`
  })
}


  
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

const diasSemana = [
"domingo",
"segunda-feira",
"terça-feira",
"quarta-feira",
"quinta-feira",
"sexta-feira",
"sábado"
]

const diaSemanaAtual = diasSemana[agoraBahia.getDay()]
  
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
DIA DA SEMANA: ${diaSemanaAtual}
HORA ATUAL: ${horaAtualSistema}
DATA ISO: ${dataAtualISO}

Hoje é ${diaSemanaAtual}.

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


{
role:"system",
content:`
BUFFET DE HOJE (DADOS REAIS):

${buffetTexto}

Regras:

- Esses são os itens reais do buffet de hoje
- Não invente itens
- Se o cliente perguntar "o que tem hoje", liste os itens
- Se perguntar "tem X", verifique nessa lista
- Organize de forma bonita
`
},



  
...mensagens

]

})

resposta = completion.choices[0].message.content

console.log("RESPOSTA IA COMPLETA:", resposta)



  
/* ================= DETECTAR MIDIA ================= */
const templateMatch = resposta.match(/ENVIAR_TEMPLATE:([a-zA-Z0-9_\-]+)/)


if(templateMatch){

  const templateNome = templateMatch[1]

  /* ✅ COLE AQUI */
  const TEMPLATE_IDIOMAS = {
    reserva_especial: "en",
    confirmacao_reserva: "pt_BR",
    lembrete_reserva: "pt_BR",
    confirmacao_pedido: "pt_BR",
    video_mercatto: "pt_BR"
  }

  const idiomaTemplate = TEMPLATE_IDIOMAS[templateNome] || "pt_BR"


  
  console.log("TENTANDO ENVIAR TEMPLATE:",templateNome)

  if(!TEMPLATES_PERMITIDOS.includes(templateNome)){
    console.log("Template não permitido:",templateNome)
  }else{

  const resp = await fetch(url,{
  method:"POST",
  headers:{
    Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
    "Content-Type":"application/json"
  },
  body: JSON.stringify({
    messaging_product:"whatsapp",
    to:cliente,
    type:"template",
    template:{
      name:templateNome,
      language:{ code: idiomaTemplate }
    }
  })
})

const data = await resp.json()

console.log("📩 RESPOSTA META TEMPLATE:", data)

    console.log("✅ TEMPLATE ENVIADO")

    // 🔥 ESSA LINHA RESOLVE TUDO
    return res.status(200).end()
  }

  resposta = resposta.replace(templateMatch[0],"").trim()
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

  
if(resposta.includes("ENVIAR_TEMPLATE_VIDEO")){

await fetch(url,{
method:"POST",
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},
body: JSON.stringify({
messaging_product:"whatsapp",
to:cliente,
type:"template",
template:{
name:"video_mercatto",
language:{
code:"pt_BR"
}
}
})
})

resposta = resposta.replace(/ENVIAR_TEMPLATE_VIDEO/g,"").trim()

}

const fotoMatch = resposta.match(/ENVIAR_FOTO_PRATO\s+(.+)/)

if(fotoMatch){

const nomePratoIA = fotoMatch[1].trim()

const prato = cardapio.find(p =>
normalizar(p.nome).includes(normalizar(nomePratoIA))
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

}else{
console.log("❌ PRATO NÃO ENCONTRADO:", nomePratoIA)
}

resposta = resposta.replace(/ENVIAR_FOTO_PRATO\s+(.+)/,"").trim()

}
console.log("Resposta IA:",resposta)

/* ================= PEDIDO DELIVERY ================= */

const pedidoMatch = resposta.match(/PEDIDO_DELIVERY_JSON:\s*({[\s\S]*?})/)

if(pedidoMatch){

let pedido = null

let jsonTexto = pedidoMatch[1]

console.log("JSON EXTRAIDO:", jsonTexto)

/* LIMPAR JSON */

jsonTexto = jsonTexto
.replace(/,\s*}/g,"}")
.replace(/,\s*]/g,"]")
.replace(/\n/g,"")
.replace(/\t/g,"")
.trim()

try{

pedido = JSON.parse(jsonTexto)

console.log("JSON DO PEDIDO OK:", pedido)

}catch(err){

console.log("ERRO AO PARSEAR JSON DO PEDIDO")
console.log("JSON RECEBIDO:", jsonTexto)
console.log("ERRO:", err)

}

if(pedido){

console.log("Pedido detectado:",pedido)

/* CALCULAR TOTAL */

const valorTotal = (pedido.itens || []).reduce((s,i)=>{

const preco = Number(i.preco || 0)
const qtd = Number(i.quantidade || 1)

return s + (preco * qtd)

},0)

console.log("TOTAL PEDIDO:",valorTotal)

/* SALVAR PEDIDO PENDENTE */

console.log("SALVANDO EM pedidos_pendentes")

await supabase
.from("pedidos_pendentes")
.delete()
.eq("cliente_telefone",cliente)

const {data,error} = await supabase
.from("pedidos_pendentes")
.insert({
cliente_nome: pedido.nome,
cliente_telefone: cliente,
cliente_endereco: pedido.endereco || "",
cliente_bairro: pedido.bairro || "",
itens: pedido.itens || [],
valor_total: valorTotal,
forma_pagamento: pedido.pagamento || "",
observacao: pedido.observacao || ""
})
.select()

if(error){
console.log("ERRO AO SALVAR PEDIDO:",error)
}else{
console.log("PEDIDO SALVO COM SUCESSO:",data)
}

/* MARCAR ESTADO */

await supabase
.from("estado_conversa")
.upsert({
telefone:cliente,
tipo:"confirmacao_pedido"
})

resposta = `🧾 *Resumo do seu pedido*

${(pedido.itens || []).map(i=>`• ${i.quantidade}x ${i.nome}`).join("\n")}

💰 Total: R$ ${valorTotal.toFixed(2)}

Deseja confirmar o pedido?`

}

}

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
observacoes:"Reserva via Automação WhatsApp",
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
/* ================= TEMPO NATURAL ================= */

const tempoDigitando = Math.min(
Math.max(resposta.length * 35, 1500), // mínimo 1.5s
6000 // máximo 6s
)

await new Promise(resolve => setTimeout(resolve, tempoDigitando))

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
