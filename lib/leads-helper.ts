/**
 * Normaliza a origem do lead.
 * Prioridade:
 * 1. Origem explícita (campaignSource)
 * 2. Dedução via UTM (utmSource)
 * 3. Fallback (Direto/Sem Origem)
 *
 * Sources suportados:
 * - Google (Google Ads, AdWords)
 * - Meta (Facebook Ads genérico)
 * - WhatsApp (Click-to-WhatsApp campaigns / mensagens via WABA)
 * - Direct (Instagram Direct / DM campaigns)
 * - ChatGPT (OpenAI)
 * - Claude (Anthropic)
 * - Gemini (Google AI)
 * - Grok (xAI)
 * - AI Search (Copilot, Perplexity, outras IAs)
 * - Orgânicos (SEO, tráfego orgânico)
 * - Captação Ativa (prospecção ativa)
 */
/**
 * Normaliza um título de coluna para comparação: sem acento, minúsculo, sem espaço
 * nas pontas e com espaços internos colapsados. Usado para casar o nome que veio de
 * fora (webhook, agente de IA) com a coluna real do quadro, já que ninguém digita
 * "Consulta Agendada" sempre igual. O colapso de espaço importa porque texto gerado
 * por IA vem com espaço duplo com frequência.
 */
export const normalizeColumnTitle = (raw: string | null | undefined): string =>
    (raw || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

/**
 * Acha a coluna do quadro pelo título informado de fora. Devolve null quando não
 * existe: quem chama decide o fallback (nunca deixar o lead sem coluna).
 */
export const findColumnByTitle = <T extends { title: string }>(
    colunas: T[],
    titulo: string | null | undefined,
): T | null => {
    const alvo = normalizeColumnTitle(titulo);
    if (!alvo) return null;
    return colunas.find((c) => normalizeColumnTitle(c.title) === alvo) || null;
};

/**
 * Normaliza uma string de origem para os padrões do sistema.
 */
export const normalizeSourceString = (raw: string): string | null => {
    if (!raw) return null;
    const lower = raw.toLowerCase().trim();

    // ============================================================
    // IAs (DEVE vir ANTES de Google/Meta para evitar conflitos)
    // Cada IA principal tem seu source próprio
    // ============================================================

    // ChatGPT / OpenAI
    if (lower.includes('chatgpt') || lower.includes('openai') || lower === 'gpt' || lower.includes('gpt-')) {
        return "ChatGPT";
    }

    // Claude / Anthropic
    if (lower.includes('claude') || lower.includes('anthropic')) {
        return "Claude";
    }

    // Gemini / Google AI (ANTES de Google Ads!)
    if (lower.includes('gemini') || lower.includes('bard') || lower.includes('google_ai') || lower === 'google-ai') {
        return "Gemini";
    }

    // Grok / xAI
    if (lower.includes('grok') || lower.includes('xai') || lower === 'x.ai') {
        return "Grok";
    }

    // Outras IAs genéricas → AI Search
    if (
        lower.includes('copilot') ||
        lower.includes('perplexity') ||
        lower === 'ai' ||
        lower === 'ia' ||
        lower.includes('ai_search') ||
        lower.includes('ai-search') ||
        lower.includes('inteligencia artificial') ||
        lower.includes('inteligência artificial') ||
        lower.includes('bing_chat') ||
        lower.includes('you.com') ||
        lower.includes('phind')
    ) {
        return "AI Search";
    }

    // ============================================================
    // Tráfego pago e redes
    // ============================================================

    // Google / Ads
    if (lower.includes('google') || lower.includes('adwords') || lower.includes('gads')) {
        return "Google";
    }

    // WhatsApp (DEVE vir ANTES de "Meta")
    if (
        lower === 'whatsapp' ||
        lower === 'waba' ||
        lower === 'wpp' ||
        lower.includes('click-to-whatsapp') ||
        lower.includes('ctwa')
    ) {
        return "WhatsApp";
    }

    // Instagram Direct (DEVE vir ANTES de "Meta")
    if (
        lower === 'direct' ||
        lower === 'dm' ||
        lower === 'ig_direct' ||
        lower === 'instagram_direct' ||
        lower === 'instagram_dm' ||
        lower === 'ig_dm'
    ) {
        return "Direct";
    }

    // Meta / Facebook / Instagram genérico (Ads, forms, etc.)
    if (
        lower.includes('meta') ||
        lower.includes('facebook') ||
        lower.includes('face') ||
        lower.includes('fb') ||
        lower.includes('instagram') ||
        lower.includes('insta') ||
        lower.includes('ig') ||
        lower.includes('bio')
    ) {
        return "Meta";
    }

    // Orgânico / SEO (removido "direct" daqui - agora é Instagram Direct)
    if (
        lower.includes('organic') ||
        lower.includes('organico') ||
        lower.includes('orgânico') ||
        lower.includes('direto') ||
        lower.includes('seo')
    ) {
        return "Orgânicos";
    }

    // Captação Ativa
    if (lower.includes('captacao') || lower.includes('captação') || lower.includes('ativa')) {
        return "Captação Ativa";
    }

    return null;
};

/**
 * Normaliza a origem do lead para exibição.
 */
export const getLeadSource = (lead: any) => {
    // 1. Tenta normalizar o campaignSource existente
    if (lead.campaignSource) {
        const normalized = normalizeSourceString(lead.campaignSource);
        if (normalized) return normalized;
        // Se não normalizou (ex: "Indicação"), retorna o original
        return lead.campaignSource;
    }

    // 2. Tenta deduzir via UTM
    if (lead.utmSource) {
        const normalized = normalizeSourceString(lead.utmSource);
        if (normalized) return normalized;
        // Se tem UTM mas não bateu regra, retorna a UTM
        return lead.utmSource;
    }

    // 3. Fallback
    return "Direto";
};
