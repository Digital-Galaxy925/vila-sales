import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const ACCOUNT = 'vilanova';
const BASE = `https://${ACCOUNT}.vtexcommercestable.com.br`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const VTEX_APP_KEY = Deno.env.get('VTEX_APP_KEY');
    const VTEX_APP_TOKEN = Deno.env.get('VTEX_APP_TOKEN');
    if (!VTEX_APP_KEY || !VTEX_APP_TOKEN) {
      throw new Error('VTEX credentials not configured');
    }

    const url = new URL(req.url);
    let code = (url.searchParams.get('code') || '').trim();
    if (!code && (req.method === 'POST')) {
      try {
        const body = await req.json();
        code = String(body?.code || '').trim();
      } catch { /* ignore */ }
    }
    if (!code) {
      return new Response(JSON.stringify({ error: 'code obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers = {
      'X-VTEX-API-AppKey': VTEX_APP_KEY,
      'X-VTEX-API-AppToken': VTEX_APP_TOKEN,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    // Try by RefId (most common for ERP/SKU codes), then fallback to SKU id
    const tryUrls = [
      `${BASE}/api/catalog_system/pub/products/search?fq=alternateIds_RefId:${encodeURIComponent(code)}`,
      `${BASE}/api/catalog_system/pub/products/search?fq=skuId:${encodeURIComponent(code)}`,
      `${BASE}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(code)}`,
    ];

    let product: any = null;
    let lastStatus = 0;
    for (const u of tryUrls) {
      const r = await fetch(u, { headers });
      lastStatus = r.status;
      if (!r.ok) continue;
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        product = data[0];
        break;
      }
    }

    if (!product) {
      return new Response(JSON.stringify({ found: false, status: lastStatus }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const item = product.items?.[0];
    const image = item?.images?.[0]?.imageUrl || null;

    return new Response(
      JSON.stringify({
        found: true,
        productId: product.productId,
        productName: product.productName,
        brand: product.brand,
        link: product.link,
        image,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('vtex-product-image error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
