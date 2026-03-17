export default async function handler(req, res) {

  /* ===== CORS ===== */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  /* ===== MÉTODO ===== */
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {

    /* ===== AUTH (SIMPLES) ===== */
    const auth = req.headers.authorization;

    if (!auth || auth !== "Bearer mercatto_admin_2026") {
      return res.status(401).json({ error: "Não autorizado" });
    }

    /* ===== BODY ===== */
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    let { telefone, mensagem } = body;

    if (!telefone || !mensagem) {
      return res.status(400).json({ error: "Telefone e mensagem são obrigatórios" });
    }

    /* ===== LIMPAR TELEFONE ===== */
    telefone = telefone.replace(/\D/g, "");

    console.log("📲 Enviando para:", telefone);
    console.log("💬 Mensagem:", mensagem);

    /* ===== VARIÁVEIS ===== */
    const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_ID;
    const TOKEN = process.env.WHATSAPP_TOKEN;

    if (!PHONE_NUMBER_ID || !TOKEN) {
      return res.status(500).json({
        error: "Variáveis de ambiente não configuradas"
      });
    }

    /* ===== ENVIO PARA META ===== */
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: telefone,
          type: "text",
          text: {
            body: mensagem
          }
        })
      }
    );

    const data = await response.json();

    console.log("📡 RESPOSTA META:", JSON.stringify(data));

    /* ===== ERRO META ===== */
    if (!response.ok) {

      console.error("❌ ERRO META:", data);

      return res.status(500).json({
        error: "Erro ao enviar mensagem",
        detalhes: data
      });
    }

    /* ===== SUCESSO ===== */
    return res.status(200).json({
      success: true,
      telefone,
      mensagem,
      meta: data
    });

  } catch (error) {

    console.error("💥 ERRO GERAL:", error);

    return res.status(500).json({
      error: "Erro interno",
      detalhe: error.message
    });

  }

}
