export default async function handler(req, res) {

  try {
    /* ===== VALIDAR MÉTODO ===== */
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Método não permitido" })
    }

    /* ===== BODY ===== */
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body

    const { telefone, mensagem } = body

    if (!telefone || !mensagem) {
      return res.status(400).json({ error: "Faltando telefone ou mensagem" })
    }

    /* ===== ENV ===== */
    const PHONE_ID = process.env.WHATSAPP_PHONE_ID
    const TOKEN = process.env.WHATSAPP_TOKEN

    if (!PHONE_ID) {
      console.error("❌ PHONE_ID não definido")
      return res.status(500).json({ error: "PHONE_ID não definido" })
    }

    if (!TOKEN) {
      console.error("❌ TOKEN não definido")
      return res.status(500).json({ error: "TOKEN não definido" })
    }

    /* ===== NORMALIZAR TELEFONE ===== */
    const numero = telefone.replace(/\D/g, "")

    /* ===== REQUEST ===== */
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: numero,
          type: "text",
          text: { body: mensagem }
        })
      }
    )

    const data = await response.json()

    console.log("📤 ENVIO:", data)

    /* ===== TRATAR ERRO DO WHATSAPP ===== */
    if (data.error) {

      return res.status(200).json({
        ok: false,
        erro: data.error.message,
        detalhe: data.error.error_data?.details || null
      })

    }

    /* ===== SUCESSO ===== */
    return res.status(200).json({
      ok: true,
      id: data.messages?.[0]?.id || null
    })

  } catch (err) {

    console.error("🔥 ERRO SERVIDOR:", err)

    return res.status(500).json({
      ok: false,
      error: "Erro interno no servidor"
    })

  }

}
