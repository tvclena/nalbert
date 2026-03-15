const axios = require("axios")
const { createClient } = require("@supabase/supabase-js")

/* SUPABASE */

const supabase = createClient(
process.env.SUPABASE_URL,
process.env.SUPABASE_SERVICE_ROLE
)

module.exports = async function handler(req,res){

/* CORS */

res.setHeader("Access-Control-Allow-Origin","*")
res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS")
res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization")

if(req.method === "OPTIONS"){
return res.status(200).end()
}

if(req.method !== "POST"){
return res.status(405).json({erro:"Método não permitido"})
}

/* TOKEN ADMIN */

const ADMIN_TOKEN = process.env.ADMIN_TOKEN

if(req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`){
return res.status(403).json({erro:"Acesso negado"})
}

try{

const {telefone,mensagem} = req.body

if(!telefone || !mensagem){

return res.status(400).json({
erro:"telefone ou mensagem faltando"
})

}

/* WHATSAPP */

const phone_number_id = process.env.WHATSAPP_PHONE_ID

const url =
`https://graph.facebook.com/v19.0/${phone_number_id}/messages`

const resposta = await axios.post(
url,
{
messaging_product:"whatsapp",
to:telefone,
type:"text",
text:{
body:mensagem
}
},
{
headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
}
}
)

/* LOG */

console.log("WHATSAPP RESPONSE:", JSON.stringify(resposta.data,null,2))
/* SALVAR CONVERSA */

await supabase
.from("conversas_whatsapp")
.insert({
telefone:telefone,
mensagem:mensagem,
role:"assistant"
})

return res.json({
ok:true,
whatsapp:resposta.data
})

}catch(e){

console.log("ERRO WHATSAPP:",e.response?.data || e)

return res.status(500).json({
erro:"erro envio whatsapp",
detalhe:e.response?.data || e
})

}

}
