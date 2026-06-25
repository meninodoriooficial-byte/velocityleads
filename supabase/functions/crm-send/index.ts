// Envia mensagem do CRM via Evolution API (texto, mídia, áudio, documento, botões).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return j({ ok: false, error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: u } = await userClient.auth.getUser();
    const user = u?.user;
    if (!user) return j({ ok: false, error: "Unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Verificar add-on whatsapp_crm ativo
    const { data: addon } = await admin
      .from("user_addons")
      .select("*")
      .eq("user_id", user.id)
      .eq("addon_slug", "whatsapp_crm")
      .eq("status", "active")
      .maybeSingle();
    if (!addon) return j({ ok: false, error: "Add-on WhatsApp CRM não ativo" }, 403);

    if (addon.monthly_quota != null && (addon.monthly_used || 0) >= addon.monthly_quota) {
      return j({ ok: false, error: "Cota mensal do CRM atingida" }, 429);
    }

    const { data: inst } = await admin
      .from("user_whatsapp_instances")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!inst) return j({ ok: false, error: "WhatsApp não conectado" }, 400);

    const { data: cfgRow } = await admin
      .from("system_settings").select("setting_value").eq("setting_key", "evolution_api").maybeSingle();
    const cfg: any = cfgRow?.setting_value;
    if (!cfg?.api_url) return j({ ok: false, error: "Evolution API não configurada" }, 400);
    const baseUrl = String(cfg.api_url).replace(/\/+$/, "");
    const headers = { apikey: cfg.api_key, "Content-Type": "application/json" };

    const body = await req.json().catch(() => ({}));
    const conversationId = String(body.conversationId || "");
    if (!conversationId) return j({ ok: false, error: "conversationId obrigatório" }, 400);

    const { data: conv } = await admin
      .from("crm_conversations").select("*").eq("id", conversationId).eq("user_id", user.id).maybeSingle();
    if (!conv) return j({ ok: false, error: "Conversa não encontrada" }, 404);
    if (conv.opted_out) return j({ ok: false, error: "Contato optou por não receber mensagens" }, 400);

    const type = String(body.type || "text");
    const text = String(body.text || "");
    const mediaUrl = body.mediaUrl ? String(body.mediaUrl) : null;
    const mediaMime = body.mediaMime || null;
    const mediaFilename = body.mediaFilename || null;
    const buttons = body.buttons || null;
    const phone = conv.phone;
    const instance = inst.instance_name;

    // Nota interna: só salva no DB
    if (type === "note") {
      const { data: nm } = await admin.from("crm_messages").insert({
        conversation_id: conv.id, user_id: user.id,
        direction: "note", type: "note", body: text,
        sender_user_id: user.id, status: "sent",
      }).select().single();
      return j({ ok: true, message: nm });
    }

    let endpoint = `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`;
    let payload: any = { number: phone, text };

    if (type === "image" || type === "video" || type === "document") {
      endpoint = `${baseUrl}/message/sendMedia/${encodeURIComponent(instance)}`;
      const mediaType = type === "image" ? "image" : type === "video" ? "video" : "document";
      // Baixar a mídia e converter para base64 (Evolution falha ao buscar signedUrls de buckets privados)
      let mediaPayload: string | null = mediaUrl;
      let detectedMime = mediaMime;
      try {
        if (mediaUrl) {
          const mr = await fetch(mediaUrl);
          if (!mr.ok) throw new Error(`download_${mr.status}`);
          detectedMime = detectedMime || mr.headers.get("content-type") || "application/octet-stream";
          const buf = new Uint8Array(await mr.arrayBuffer());
          let bin = "";
          const CHUNK = 8192;
          for (let i = 0; i < buf.length; i += CHUNK) {
            bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)));
          }
          mediaPayload = btoa(bin);
        }
      } catch (err) {
        console.error("crm-send media download failed", err);
        return j({ ok: false, error: "Falha ao baixar mídia para envio: " + (err as Error).message }, 400);
      }
      payload = {
        number: phone,
        mediatype: mediaType,
        mimetype: detectedMime,
        caption: text || undefined,
        media: mediaPayload,
        fileName: mediaFilename || (type === "image" ? "image.jpg" : type === "video" ? "video.mp4" : "file.bin"),
      };
    } else if (type === "audio") {
      endpoint = `${baseUrl}/message/sendWhatsAppAudio/${encodeURIComponent(instance)}`;
      let audioPayload: string | null = mediaUrl;
      try {
        if (mediaUrl) {
          const mr = await fetch(mediaUrl);
          if (!mr.ok) throw new Error(`download_${mr.status}`);
          const buf = new Uint8Array(await mr.arrayBuffer());
          let bin = "";
          const CHUNK = 8192;
          for (let i = 0; i < buf.length; i += CHUNK) {
            bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)));
          }
          audioPayload = btoa(bin);
        }
      } catch (err) {
        console.error("crm-send audio download failed", err);
        return j({ ok: false, error: "Falha ao baixar áudio para envio: " + (err as Error).message }, 400);
      }
      payload = { number: phone, audio: audioPayload };
    } else if (type === "buttons") {
      endpoint = `${baseUrl}/message/sendButtons/${encodeURIComponent(instance)}`;
      payload = {
        number: phone, title: body.title || "", description: text,
        footer: body.footer || "",
        buttons: (buttons || []).map((b: any, i: number) => ({
          buttonId: b.id || `btn_${i}`, buttonText: { displayText: b.text },
          type: 1,
        })),
      };
    }

    const r = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
    const tx = await r.text();
    let parsed: any = null; try { parsed = JSON.parse(tx); } catch {}

    const ok = r.ok;
    const { data: saved } = await admin.from("crm_messages").insert({
      conversation_id: conv.id, user_id: user.id,
      direction: "out",
      type: type === "buttons" ? "button" : type,
      body: text || null,
      media_url: mediaUrl, media_mime: mediaMime, media_filename: mediaFilename,
      buttons: type === "buttons" ? buttons : null,
      sender_user_id: user.id,
      status: ok ? "sent" : "failed",
      error: ok ? null : (parsed?.message || tx.slice(0, 400)),
      evolution_message_id: parsed?.key?.id || null,
    }).select().single();

    await admin.from("crm_conversations").update({
      last_message_at: new Date().toISOString(),
      last_message_preview: (text || `[${type}]`).slice(0, 120),
      unread_count: 0,
    }).eq("id", conv.id);

    if (ok) {
      await admin.from("user_addons").update({ monthly_used: (addon.monthly_used || 0) + 1 }).eq("id", addon.id);
    }

    return j({ ok, message: saved, error: ok ? null : (parsed?.message || tx.slice(0, 400)) });
  } catch (e: any) {
    console.error("crm-send error", e);
    return j({ ok: false, error: e?.message || String(e) }, 500);
  }
});

function j(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}