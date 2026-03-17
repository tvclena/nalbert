import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {

  /* ===== CORS ===== */
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

    /* ===== AUTH ===== */
    const auth = req.headers.authorization;

    if (auth !== `Bearer ${process.env.ADMIN_TOKEN}`) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    /* ===== BODY ===== */
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    let { telefone, mensagem } = body;

    if (!telefone || !mensagem) {
      return res.status(400).json({ error: "Telefone ou mensagem inválidos" });
    }

    /* ===== NORMALIZAR TELEFONE ===== */
    telefone = telefone.replace(/\D/g, "");

    if (!telefone.startsWith("55")) {
      telefone = "55" + telefone;
    }

    console.log("📲 Enviando para:", telefone);
    console.log("💬 Mensagem:", mensagem);

    /* ===== ENVIO WHATSAPP (META API) ===== */
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

    console.log("📩 RESPOSTA META:", JSON.stringify(data));

    if (!response.ok) {
      return res.status(500).json({
        error: "Erro ao enviar WhatsApp",
        detalhe: data
      });
    }

    /* ===== SUPABASE ===== */
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE
    );

    const { error: erroSupabase } = await supabase
      .from("conversas_whatsapp")
      .insert({
        telefone,
        mensagem,
        role: "assistant"
      });

    if (erroSupabase) {
      console.error("❌ ERRO SUPABASE:", erroSupabase);
    }

    /* ===== SUCESSO ===== */
    return res.status(200).json({
      ok: true,
      enviado_para: telefone,
      resposta_meta: data
    });

  } catch (err) {

    console.error("🔥 ERRO GERAL:", err);

    return res.status(500).json({
      error: "Erro interno",
      detalhe: err.message
    });

  }
}
