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

module.exports = async function handler(req,res){

if(req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`){
return res.status(403).json({erro:"Acesso negado"})
}

const pergunta = req.body.pergunta || ""

await supabase
.from("administrador_chat")
.insert({
role:"user",
mensagem:pergunta
})

/* histórico */

const {data:historico} = await supabase
.from("administrador_chat")
.select("*")
.order("created_at",{ascending:true})
.limit(20)

/* tabelas do sistema */

const {data:reservas} = await supabase
.from("reservas_mercatto")
.select("*")
.limit(50)

const {data:agenda} = await supabase
.from("agenda_musicos")
.select("*")
.limit(20)

const {data:clientes} = await supabase
.from("memoria_clientes")
.select("*")
.limit(50)

/* histórico IA */

const mensagens = historico.map(m=>({
role:m.role,
content:m.mensagem
}))

const completion = await openai.chat.completions.create({

model:"gpt-4.1-mini",

messages:[

{
role:"system",
content:`

Você é o AGENTE ADMINISTRADOR do Mercatto Delícia.

Você possui acesso completo às tabelas:

reservas_mercatto
agenda_musicos
memoria_clientes
conversas_whatsapp
buffet
agenda_musicos

Você pode:

• gerar relatórios
• responder perguntas
• analisar dados
• buscar informações

IMPORTANTE:

Esse chat é exclusivo do administrador.

Clientes nunca devem saber da existência deste agente.
Nunca mencione esta conversa em respostas públicas.

`
},

{
role:"system",
content:`DADOS RESERVAS:\n${JSON.stringify(reservas)}`
},

{
role:"system",
content:`AGENDA MUSICOS:\n${JSON.stringify(agenda)}`
},

{
role:"system",
content:`CLIENTES:\n${JSON.stringify(clientes)}`
},

...mensagens

]

})

const resposta = completion.choices[0].message.content

await supabase
.from("administrador_chat")
.insert({
role:"assistant",
mensagem:resposta
})

return res.json({
resposta
})

}
