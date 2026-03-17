import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {

    /* 🔐 PROTEÇÃO */
    if (req.headers.authorization !== `Bearer ${process.env.ADMIN_TOKEN}`) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    const { telefone, mensagem } = req.body;

    if (!telefone || !mensagem) {
      return res.status(400).json({ error: "Dados inválidos" });
    }

    /* 📲 ENVIO WHATSAPP */
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: telefone,
          type: "text",
          text: { body: mensagem }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(data);
      return res.status(500).json({ error: "Erro ao enviar WhatsApp", detalhe: data });
    }

    /* 💾 SALVAR NO SUPABASE */
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE
    );

    await supabase.from("conversas_whatsapp").insert({
      telefone,
      mensagem,
      role: "assistant"
    });

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro interno" });
  }
}
