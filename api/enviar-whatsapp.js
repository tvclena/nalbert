import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {

    console.log("🔥 API OK");

    if (req.headers.authorization !== `Bearer ${process.env.ADMIN_TOKEN}`) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    const { telefone, mensagem } = req.body;

    if (!telefone || !mensagem) {
      return res.status(400).json({ error: "Dados inválidos" });
    }

    let numero = telefone.replace(/\D/g, "");

    if (!numero.startsWith("55")) {
      numero = "55" + numero;
    }

    console.log("📲 Enviando:", numero);

    /* ===== ENVIO META ===== */
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
          to: numero,
          type: "text",
          text: { body: mensagem }
        })
      }
    );

    const data = await response.json();

    console.log("📩 META:", data);

    if (!response.ok) {
      return res.status(500).json({
        error: "Erro WhatsApp",
        detalhe: data
      });
    }

    /* ===== SALVAR ===== */
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE
    );

    await supabase.from("conversas_whatsapp").insert({
      telefone: numero,
      mensagem,
      role: "assistant"
    });

    return res.status(200).json({ ok: true });

  } catch (err) {

    console.log("❌ ERRO:", err.message);

    return res.status(500).json({
      error: "Erro interno",
      detalhe: err.message
    });
  }
}
