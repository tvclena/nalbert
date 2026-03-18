export default async function handler(req,res){

if(req.method !== "POST"){
return res.status(405).end()
}

const data = req.body

/* aqui você salva na planilha ou banco */

console.log("Nova reserva:", data)

/* EXEMPLO resposta */

return res.status(200).json({
ok:true
})

}
