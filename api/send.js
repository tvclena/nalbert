import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
)

export default async function handler(req, res) {

  try {

    /* ================= MÉTODO ================= */

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Método não permitido" })
    }

    /* ================= BODY ================= */

    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body

    const { telefone, mensagem, media_url, tipo, nome_arquivo } = body

    if (!telefone) {
      return res.status(400).json({ error: "Telefone obrigatório" })
    }

    /* ================= ENV ================= */

    const PHONE_ID = process.env.WHATSAPP_PHONE_ID
    const TOKEN = process.env.WHATSAPP_TOKEN

    if (!PHONE_ID || !TOKEN) {
      return res.status(500).json({ error: "Credenciais não configuradas" })
    }

    /* ================= NORMALIZAR ================= */

    const numero = telefone.replace(/\D/g, "")

    let payload = {
      messaging_product: "whatsapp",
      to: numero
    }

    /* =====================================================
       🔥 MÍDIA
    ===================================================== */

    if (media_url) {

      const tipoDetectado = tipo || detectarTipo(media_url, nome_arquivo)

      console.log("📎 Enviando mídia:", tipoDetectado)

      /* ===== IMAGEM ===== */
      if (tipoDetectado === "imagem") {
        payload.type = "image"
        payload.image = {
          link: media_url,
          caption: mensagem || ""
        }
      }

      /* ===== VIDEO ===== */
      else if (tipoDetectado === "video") {
        payload.type = "video"
        payload.video = {
          link: media_url,
          caption: mensagem || ""
        }
      }

      /* ===== AUDIO ===== */
      else if (tipoDetectado === "audio") {
        payload.type = "audio"
        payload.audio = {
          link: media_url
        }
      }

      /* ===== DOCUMENTO ===== */
      else {
        payload.type = "document"
        payload.document = {
          link: media_url,
          filename: nome_arquivo || "arquivo",
          caption: mensagem || ""
        }
      }

    }

    /* =====================================================
       🔥 TEXTO
    ===================================================== */

    else if (mensagem) {

      payload.type = "text"
      payload.text = {
        body: mensagem
      }

    }

    else {
      return res.status(400).json({
        error: "Nada para enviar"
      })
    }

    /* =====================================================
       🚀 ENVIO WHATSAPP
    ===================================================== */

    const response = await fetch(
      `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    )

    const data = await response.json()

    console.log("📤 RESPOSTA META:", data)

    /* =====================================================
       ❌ ERRO WHATSAPP
    ===================================================== */

    if (data.error) {
      return res.status(200).json({
        ok: false,
        erro: data.error.message,
        detalhe: data.error.error_data?.details || null
      })
    }

    /* =====================================================
       💾 SALVAR NO SUPABASE
    ===================================================== */

    const tipoFinal = tipo || (
      media_url
        ? detectarTipo(media_url, nome_arquivo)
        : "texto"
    )

    const { error: erroBanco } = await supabase
      .from("conversas_whatsapp")
      .insert({
        telefone: numero,
        mensagem: mensagem || `[${tipoFinal.toUpperCase()}]`,
        media_url: media_url || null,
        tipo: tipoFinal,
        nome_arquivo: nome_arquivo || null,
        role: "assistant"
      })

    if (erroBanco) {
      console.error("❌ ERRO AO SALVAR:", erroBanco)
    } else {
      console.log("✅ SALVO NO BANCO")
    }

    /* =====================================================
       ✅ SUCESSO
    ===================================================== */

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

/* =====================================================
   🔍 DETECTAR TIPO AUTOMATICAMENTE
===================================================== */

function detectarTipo(url, nome){

  const ref = (url || "") + " " + (nome || "")
  const lower = ref.toLowerCase()

  if (lower.match(/\.(jpg|jpeg|png|webp|gif)/)) return "imagem"
  if (lower.match(/\.(mp4|mov|webm)/)) return "video"
  if (lower.match(/\.(mp3|wav|ogg|m4a)/)) return "audio"

  return "documento"
}
