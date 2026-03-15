const { createClient } = require("@supabase/supabase-js")

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

/* TOKEN */

if(req.headers.authorization !== `Bearer ${process.env.ADMIN_TOKEN}`){
return res.status(403).json({erro:"Acesso negado"})
}

try{

const body =
typeof req.body === "string"
? JSON.parse(req.body)
: req.body

const telefone = body.telefone
const mensagem = body.mensagem

if(!telefone || !mensagem){
return res.status(400).json({erro:"telefone ou mensagem faltando"})
}

/* WHATSAPP */

const url =
`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`

const resposta = await fetch(url,{

method:"POST",

headers:{
Authorization:`Bearer ${process.env.WHATSAPP_TOKEN}`,
"Content-Type":"application/json"
},

body:JSON.stringify({

messaging_product:"whatsapp",
to:telefone,
type:"text",
text:{
body:mensagem
}

})

})

const json = await resposta.json()

console.log("WHATSAPP RESPONSE:",json)

/* SALVAR HISTORICO */

await supabase
.from("conversas_whatsapp")
.insert({
telefone:telefone,
mensagem:mensagem,
role:"assistant"
})

return res.json({
ok:true,
whatsapp:json
})

}catch(e){

console.log("ERRO ENVIO:",e)

return res.status(500).json({
erro:"erro envio whatsapp"
})

}

}
