'use strict';
/**
 * src/scrapers/automechanika.js
 *
 * Responsabilidad única: hablar con la API de Messe Frankfurt,
 * transformar cada hit al modelo interno y devolverlo.
 * No sabe nada de SQL.
 */
const config = require('../../config');
const http   = require('../services/httpClient');

const API_URL = 'https://api.messefrankfurt.com/service/esb_api/exhibitor-service/api/2.1/public/exhibitor/search';

const HEADERS = {
    Apikey:             config.ams.apiKey,
    Accept:             'application/json',
    'accept-language':  'en-US,en;q=0.9',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

/** Transforma un hit JSON de la API al modelo de dominio interno */
function parseHit(hit) {
    const ex  = hit.exhibitor ?? {};
    const adr = ex.address    ?? {};
    const iso3 = (adr.country?.iso3 ?? '').toUpperCase();

    if (config.ams.filterCountry && iso3 !== config.ams.filterCountry) return null;

    const categories = (ex.categories ?? []).flatMap(cat =>
        (cat.subCategories?.length ? cat.subCategories : [null]).map(sub => ({
            category_id:     cat.id   ?? null,
            category_name:   cat.name ?? null,
            subcategory_id:  sub?.id   ?? null,
            subcategory_name:sub?.name ?? null,
        }))
    );
    if (!categories.length) categories.push({ category_id: null, category_name: null, subcategory_id: null, subcategory_name: null });

    const stands = (ex.presentationLinks ?? []).flatMap(pl =>
        (pl.pstands?.length ? pl.pstands : [{}]).map(ps => ({
            presentation_name:     pl.presentationName    ?? null,
            exhibitor_url_rewrite: pl.exhibitorUrlRewrite ?? null,
            hall_and_level:        ps.hallAndLevel         ?? null,
            first_booth_number:    ps.firstBoothNumber     ?? null,
        }))
    );
    if (!stands.length) stands.push({ presentation_name: null, exhibitor_url_rewrite: null, hall_and_level: null, first_booth_number: null });

    return {
        exhibitor_id:           ex.id,
        score:                  hit.score          ?? null,
        jump_label_id:          hit.jumpLabelId    ?? null,
        rewrite_id:             ex.rewriteId       ?? null,
        exhibitor_name:         ex.name,
        sort_key:               ex.sortKey         ?? null,
        href:                   ex.href            ?? null,
        logo:                   ex.logo            ?? null,
        address_street:         adr.street         ?? null,
        address_city:           adr.city           ?? null,
        address_zip:            adr.zip            ?? null,
        address_tel:            adr.tel            ?? null,
        address_country_iso3:   iso3               || null,
        address_country_label:  adr.country?.label ?? null,
        address_email:          adr.email          ?? null,
        categories,
        stands,
    };
}

/**
 * Genera (yields) todos los hits de la API paginados.
 * Caller decide qué hacer con cada uno.
 */
async function* fetchAll() {
    let page = 1;
    let totalPages = null;

    while (true) {
        const url = `${API_URL}?language=en-GB&q=&orderBy=name&pageNumber=${page}&pageSize=${config.ams.pageSize}&orSearchFallback=false&showJumpLabels=true&findEventVariable=AUTOMECHANIKASHANGHAI`;

        const resp   = await http.get(url, { headers: HEADERS });
        const result = resp.data?.result;

        if (!result?.hits?.length) break;

        if (!totalPages) {
            const meta = result.metaData ?? {};
            totalPages = Math.ceil((meta.hitsTotal ?? 1) / (meta.hitsPerPage ?? config.ams.pageSize));
            yield { type: 'meta', hitsTotal: meta.hitsTotal, totalPages };
        }

        for (const hit of result.hits) {
            const record = parseHit(hit);
            if (record) yield { type: 'record', data: record };
            else        yield { type: 'skipped' };
        }

        yield { type: 'page', page, totalPages };
        if (page >= totalPages) break;
        page++;
    }
}

module.exports = { fetchAll };
