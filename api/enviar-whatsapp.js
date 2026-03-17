import { createClient } from "@supabase/supabase-js";
import axios from "axios";

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

  console.log("🔥 API INICIADA");

  try {

    /* ===== AUTH ===== */
    const auth = req.headers.authorization;

    if (auth !== `Bearer ${process.env.ADMIN_TOKEN}`) {
      console.log("❌ TOKEN INVÁLIDO");
      return res.status(401).json({ error: "Não autorizado" });
    }

    /* ===== BODY ===== */
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    let { telefone, mensagem } = body;

    if (!telefone || !mensagem) {
      console.log("❌ DADOS INVÁLIDOS");
      return res.status(400).json({ error: "Telefone ou mensagem inválidos" });
    }

    /* ===== NORMALIZAR TELEFONE ===== */
    telefone = telefone.replace(/\D/g, "");

    if (!telefone.startsWith("55")) {
      telefone = "55" + telefone;
    }

    console.log("📲 Enviando para:", telefone);
    console.log("💬 Mensagem:", mensagem);

    /* ===== ENVIO WHATSAPP ===== */
    console.log("🔥 PASSOU AQUI 1 (ANTES DO ENVIO)");

    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: telefone,
        type: "text",
        text: { body: mensagem }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("🔥 PASSOU AQUI 2 (DEPOIS DO ENVIO)");
    console.log("📩 RESPOSTA META:", JSON.stringify(response.data));

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
      console.log("❌ ERRO SUPABASE:", erroSupabase.message);
    }

    /* ===== SUCESSO ===== */
    return res.status(200).json({
      ok: true,
      enviado_para: telefone,
      meta: response.data
    });

  } catch (err) {

    console.log("🔥 ERRO GERAL");

    if (err.response) {
      console.log("📩 ERRO META:", JSON.stringify(err.response.data));

      return res.status(500).json({
        error: "Erro WhatsApp",
        detalhe: err.response.data
      });
    }

    console.log("❌ ERRO:", err.message);

    return res.status(500).json({
      error: "Erro interno",
      detalhe: err.message
    });
  }
}
