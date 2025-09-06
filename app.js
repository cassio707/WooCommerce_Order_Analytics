/* ===== WooCommerce Stats Dashboard – Hourly/Items/Discounts (Daily panel removed) ===== */

const els = {
    siteUrl: document.getElementById('siteUrl'),
    consumerKey: document.getElementById('consumerKey'),
    consumerSecret: document.getElementById('consumerSecret'),
    orderStatus: document.getElementById('orderStatus'),

    dateFilterType: document.getElementById('dateFilterType'),
    dateFilter: document.getElementById('dateFilter'),
    customDateRange: document.getElementById('customDateRange'),
    startDate: document.getElementById('startDate'),
    endDate: document.getElementById('endDate'),
    startDateJalali: document.getElementById('startDateJalali'),
    endDateJalali: document.getElementById('endDateJalali'),

    optHourly: document.getElementById('optHourly'),
    optItems: document.getElementById('optItems'),
    optDiscounts: document.getElementById('optDiscounts'),

    fetchOrders: document.getElementById('fetchOrders'),
    exportJSON: document.getElementById('exportJSON'),
    exportExcel: document.getElementById('exportExcel'),
    toggleTheme: document.getElementById('toggleTheme'),
    clearFilters: document.getElementById('clearFilters'),

    progressContainer: document.getElementById('progressContainer'),
    progressText: document.getElementById('progressText'),
    progressPercent: document.getElementById('progressPercent'),
    progressBar: document.getElementById('progressBar'),

    statsContainer: document.getElementById('statsContainer'),
    overviewStats: document.getElementById('overviewStats'),

    // Hourly / Items / Discounts tables
    panelHourly: document.getElementById('panelHourly'),
    hourlyTable: document.getElementById('hourlyTable'),
    panelItems: document.getElementById('panelItems'),
    itemsTable: document.getElementById('itemsTable'),
    panelDiscounts: document.getElementById('panelDiscounts'),
    discountCards: document.getElementById('discountCards'),
    discountsDailyTable: document.getElementById('discountsDailyTable'),

    // charts
    hourlyChart: document.getElementById('hourlyChart'),
};

let lastOrders = [];
let lastStats = null;
let lastCurrency = ''; // IRT/IRR/...

let hourlyChartInstance = null;

/* ---------- Theme ---------- */
(function initTheme() {
    const root = document.documentElement;
    const saved = localStorage.getItem('theme');
    if (saved) root.classList.toggle('dark', saved === 'dark');
    els.toggleTheme.addEventListener('click', () => {
        root.classList.toggle('dark');
        localStorage.setItem('theme', root.classList.contains('dark') ? 'dark' : 'light');
        if (hourlyChartInstance) hourlyChartInstance.update('none');
    });
})();

/* ---------- UI ---------- */
els.dateFilterType.addEventListener('change', () => {
    const isCustom = els.dateFilterType.value === 'custom';
    els.customDateRange.classList.toggle('hidden', !isCustom);
});
els.clearFilters.addEventListener('click', () => {
    els.orderStatus.value = '';
    els.dateFilterType.value = 'preset';
    els.dateFilter.value = 'today';
    els.startDate.value = els.endDate.value = '';
    els.startDateJalali.value = els.endDateJalali.value = '';
    els.customDateRange.classList.add('hidden');
    els.optHourly.checked = els.optItems.checked = els.optDiscounts.checked = true;
});

/* ---------- Helpers: Dates ---------- */
function toISOUTC(d) { if (!d) return null; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString(); }
function toJalaliString(localDate) {
    const gY = localDate.getFullYear(), gM = localDate.getMonth() + 1, gD = localDate.getDate();
    const j = window.jalaali.toJalaali(gY, gM, gD);
    const pad = (n) => String(n).padStart(2, '0');
    return `${j.jy}/${pad(j.jm)}/${pad(j.jd)}`;
}
function buildLocalDateFromInputs(dateStr, startOfDay) {
    if (!dateStr) return null;
    const [y, mo, d] = dateStr.split('-').map(Number);
    return new Date(y, mo - 1, d, startOfDay ? 0 : 23, startOfDay ? 0 : 59, startOfDay ? 0 : 59, startOfDay ? 0 : 999);
}
function buildLocalDateFromJalali(jStr, startOfDay) {
    if (!jStr) return null;
    const [jy, jm, jd] = jStr.split(/[\/\-]/).map(Number);
    const g = window.jalaali.toGregorian(jy, jm, jd);
    return new Date(g.gy, g.gm - 1, g.gd, startOfDay ? 0 : 23, startOfDay ? 0 : 59, startOfDay ? 0 : 59, startOfDay ? 0 : 999);
}
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function startOfWeekSaturday() {
    const d = new Date();
    const dow = d.getDay(); // 0=Sun..6=Sat
    const diff = (dow - 6 + 7) % 7;
    const s = new Date(d); s.setDate(d.getDate() - diff); s.setHours(0, 0, 0, 0);
    return s;
}
function buildDateParams() {
    if (els.dateFilterType.value === 'preset') {
        const now = new Date();
        let startLocal;
        const v = els.dateFilter.value;
        if (v === 'today') startLocal = startOfToday();
        else if (v === 'week') startLocal = startOfWeekSaturday();
        else { const months = Number(v || '1'); startLocal = new Date(); startLocal.setMonth(startLocal.getMonth() - months); startLocal.setHours(0, 0, 0, 0); }
        return { afterISO: toISOUTC(startLocal), beforeISO: toISOUTC(now) };
    }
    // custom (prefer Jalali)
    const hasJ = els.startDateJalali.value || els.endDateJalali.value;
    let startLocal = hasJ ? buildLocalDateFromJalali(els.startDateJalali.value, true)
        : buildLocalDateFromInputs(els.startDate.value, true);
    let endLocal = hasJ ? buildLocalDateFromJalali(els.endDateJalali.value, false)
        : buildLocalDateFromInputs(els.endDate.value, false);
    if (!startLocal && endLocal) { startLocal = new Date(endLocal); startLocal.setHours(0, 0, 0, 0); }
    if (startLocal && !endLocal) { endLocal = new Date(startLocal); endLocal.setHours(23, 59, 59, 999); }
    return { afterISO: startLocal ? toISOUTC(startLocal) : null, beforeISO: endLocal ? toISOUTC(endLocal) : null };
}

/* ---------- Helpers: Numbers & Currency ---------- */
function faNum(n, opts) { if (!Number.isFinite(n)) n = 0; return n.toLocaleString('fa-IR', opts || { maximumFractionDigits: 0 }); }
function detectCurrency(orders) {
    const freq = {};
    for (const o of orders) { const c = (o.currency || '').toUpperCase(); if (!c) continue; freq[c] = (freq[c] || 0) + 1; }
    let best = ''; let max = -1;
    for (const k in freq) if (freq[k] > max) { max = freq[k]; best = k; }
    return best || 'IRR';
}
function currencyLabel(code) { if (!code) return ''; if (code.toUpperCase() === 'IRT') return 'تومان'; if (code.toUpperCase() === 'IRR') return 'ریال'; return code.toUpperCase(); }
function formatMoneyFA(amount, code) {
    const decimals = (code === 'IRR' || code === 'IRT') ? 0 : 2;
    return `${amount.toLocaleString('fa-IR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${currencyLabel(code)}`;
}

/* ---------- Fetch (Paginated) ---------- */
async function fetchOrdersPaginated({ siteUrl, key, secret, status, afterISO, beforeISO }) {
    const perPage = 100;
    let page = 1, orders = [], totalPages = null;

    showProgress(true, 'دریافت صفحه ۱…');
    try {
        while (true) {
            const url = new URL(`${siteUrl.replace(/\/+$/, '')}/wp-json/wc/v3/orders`);
            url.searchParams.set('consumer_key', key);
            url.searchParams.set('consumer_secret', secret);
            url.searchParams.set('per_page', String(perPage));
            url.searchParams.set('page', String(page));
            url.searchParams.set('orderby', 'date');
            url.searchParams.set('order', 'desc');
            if (status) url.searchParams.set('status', status);
            if (afterISO) url.searchParams.set('after', afterISO);
            if (beforeISO) url.searchParams.set('before', beforeISO);

            const res = await fetch(url.toString());
            if (!res.ok) { const t = await res.text(); throw new Error(`HTTP ${res.status}: ${t}`); }

            if (totalPages == null) totalPages = Number(res.headers.get('X-WP-TotalPages')) || null;

            const batch = await res.json();
            if (!Array.isArray(batch) || batch.length === 0) { updateProgress(page, totalPages); break; }

            orders = orders.concat(batch);
            updateProgress(page, totalPages);
            page += 1;

            if (totalPages && page > totalPages) break;
            if (!totalPages && batch.length < perPage) break;
        }
    } finally {
        showProgress(false);
    }
    return orders;
}
function showProgress(show, text) {
    els.progressContainer.classList.toggle('hidden', !show);
    if (text) els.progressText.textContent = text;
    if (!show) { els.progressBar.style.width = '0%'; els.progressPercent.textContent = '0%'; }
}
function updateProgress(currentPage, totalPages) {
    let percent = 0;
    if (totalPages) {
        percent = Math.min(100, Math.round((currentPage / totalPages) * 100));
        els.progressText.textContent = `دریافت صفحه ${faNum(currentPage)} از ${faNum(totalPages)}…`;
    } else {
        percent = Math.min(90, currentPage * 10);
        els.progressText.textContent = `دریافت صفحه ${faNum(currentPage)}…`;
    }
    els.progressPercent.textContent = `${faNum(percent)}%`;
    els.progressBar.style.width = `${percent}%`;
}

/* ---------- Stats ---------- */
function computeStats(orders) {
    const stats = {
        totalOrders: 0,
        totalAmount: 0,
        avgOrder: 0,
        uniqueCustomers: 0,

        daily: {},    // نگه می‌داریم تا «پرفروش‌ترین روز» و تخفیف روزانه کار کند
        hourly: {},   // 0..23
        products: {},

        discountDaily: {},
        totalDiscount: 0,
        grossItems: 0,
        netItems: 0,
    };
    const seen = new Set();
    for (let h = 0; h < 24; h++) stats.hourly[h] = { count: 0, amount: 0 };

    orders.forEach(o => {
        const orderTotal = parseFloat(o.total || '0') || 0;
        stats.totalOrders += 1;
        stats.totalAmount += orderTotal;

        const cust = (o.billing?.email) || `id:${o.customer_id || 'guest'}`;
        seen.add(cust);

        // time (local)
        let ds = o.date_created_gmt || o.date_created;
        if (ds && o.date_created_gmt && !ds.endsWith('Z')) ds += 'Z';
        const d = ds ? new Date(ds) : null;
        let jKey = '—', hour = 0;
        if (d && !isNaN(d)) {
            const local = new Date(d.getTime());
            jKey = toJalaliString(local);
            hour = local.getHours();

            stats.daily[jKey] = stats.daily[jKey] || { count: 0, amount: 0 };
            stats.daily[jKey].count += 1;
            stats.daily[jKey].amount += orderTotal;

            stats.hourly[hour].count += 1;
            stats.hourly[hour].amount += orderTotal;
        }

        // items + discounts
        let lineSubtotalSum = 0;
        let lineTotalSum = 0;
        let lineDiscountSum = 0;

        (o.line_items || []).forEach(it => {
            const subtotal = parseFloat(it.subtotal || '0') || 0;
            const total = parseFloat(it.total || '0') || 0;
            const qty = Number(it.quantity || 0) || 0;

            lineSubtotalSum += subtotal;
            lineTotalSum += total;
            lineDiscountSum += Math.max(0, subtotal - total);

            const key = `${it.product_id || 0}::${it.sku || ''}::${it.name || ''}`;
            if (!stats.products[key]) stats.products[key] = { name: it.name || '—', sku: it.sku || '', qty: 0, amount: 0 };
            stats.products[key].qty += qty;
            stats.products[key].amount += total;
        });

        stats.grossItems += lineSubtotalSum;
        stats.netItems += lineTotalSum;

        const orderDiscField = parseFloat(o.discount_total || '0') || 0;
        const effectiveDisc = Math.max(orderDiscField, lineDiscountSum);
        stats.totalDiscount += effectiveDisc;

        if (jKey !== '—') {
            stats.discountDaily[jKey] = (stats.discountDaily[jKey] || 0) + effectiveDisc;
        }
    });

    stats.avgOrder = stats.totalOrders ? stats.totalAmount / stats.totalOrders : 0;
    stats.uniqueCustomers = seen.size;
    return stats;
}

/* ---------- Best hour/day helpers ---------- */
function getBestHour(stats) {
    let best = 0, max = -Infinity;
    for (let h = 0; h < 24; h++) {
        const amt = stats.hourly[h]?.amount || 0;
        if (amt > max) { max = amt; best = h; }
    }
    return { h: best, amount: Math.max(0, max) };
}
function getBestDay(stats) {
    let bestDate = '—', max = -Infinity;
    for (const [d, v] of Object.entries(stats.daily)) {
        const amt = v?.amount || 0;
        if (amt > max) { max = amt; bestDate = d; }
    }
    if (max === -Infinity) return { date: '—', amount: 0 };
    return { date: bestDate, amount: max };
}

/* ---------- Render ---------- */
function renderOverview(stats) {
    els.overviewStats.innerHTML = '';
    const card = (title, value, sub) => `
    <div class="p-4 rounded-lg bg-white dark:bg-gray-800 shadow border border-gray-100 dark:border-gray-700">
      <div class="text-sm text-gray-600 dark:text-gray-400">${title}</div>
      <div class="text-2xl font-extrabold text-gray-900 dark:text-gray-100 mt-1">${value}</div>
      ${sub ? `<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${sub}</div>` : ''}
    </div>
  `;
    els.overviewStats.insertAdjacentHTML('beforeend', card('تعداد سفارش', faNum(stats.totalOrders)));
    els.overviewStats.insertAdjacentHTML('beforeend', card('جمع فروش', formatMoneyFA(stats.totalAmount, lastCurrency)));
    els.overviewStats.insertAdjacentHTML('beforeend', card('میانگین هر سفارش', formatMoneyFA(stats.avgOrder, lastCurrency)));
    els.overviewStats.insertAdjacentHTML('beforeend', card('مشتریان یکتا', faNum(stats.uniqueCustomers)));

    const grossLbl = formatMoneyFA(stats.grossItems, lastCurrency);
    const discLbl = formatMoneyFA(stats.totalDiscount, lastCurrency);
    const netLbl = formatMoneyFA(stats.grossItems - stats.totalDiscount, lastCurrency);
    els.overviewStats.insertAdjacentHTML('beforeend', card('مجموع تخفیف', discLbl, 'بر اساس اقلام/کوپن'));
    els.overviewStats.insertAdjacentHTML('beforeend', card('جمع اقلام قبل از تخفیف', grossLbl));
    els.overviewStats.insertAdjacentHTML('beforeend', card('جمع اقلام پس از تخفیف', netLbl));

    const bh = getBestHour(stats);
    const bd = getBestDay(stats);
    els.overviewStats.insertAdjacentHTML('beforeend',
        card('پرفروش‌ترین ساعت', `${faNum(bh.h)} — ${formatMoneyFA(bh.amount, lastCurrency)}`));
    els.overviewStats.insertAdjacentHTML('beforeend',
        card('پرفروش‌ترین روز (ج)', `${bd.date} — ${formatMoneyFA(bd.amount, lastCurrency)}`));
}

function renderHourly(stats) {
    const best = getBestHour(stats);

    const rows = [];
    for (let h = 0; h < 24; h++) {
        const r = stats.hourly[h] || { count: 0, amount: 0 };
        const isBest = h === best.h;
        const highlight = isBest ? 'bg-amber-50 dark:bg-amber-900/20 font-semibold' : '';
        const star = isBest ? ' ⭐' : '';
        rows.push(`
      <tr class="border-b border-gray-200 dark:border-gray-700 ${highlight}">
        <td class="p-2">${faNum(h)}${star}</td>
        <td class="p-2">${faNum(r.count)}</td>
        <td class="p-2">${formatMoneyFA(r.amount, lastCurrency)}</td>
      </tr>
    `);
    }
    els.hourlyTable.innerHTML = rows.join('');
    els.panelHourly.classList.toggle('hidden', !els.optHourly.checked);

    const labels = Array.from({ length: 24 }, (_, i) => i);
    const amounts = labels.map(h => stats.hourly[h]?.amount || 0);
    updateHourlyChart(labels, amounts, best.h);
}

function renderItems(stats) {
    const list = Object.values(stats.products).sort((a, b) => b.amount - a.amount);
    const rows = list.map(p => `
    <tr class="border-b border-gray-200 dark:border-gray-700">
      <td class="p-2">${escapeHTML(p.name)}</td>
      <td class="p-2">${escapeHTML(p.sku || '—')}</td>
      <td class="p-2">${faNum(p.qty)}</td>
      <td class="p-2">${formatMoneyFA(p.amount, lastCurrency)}</td>
    </tr>
  `);
    els.itemsTable.innerHTML = rows.join('') || `<tr><td class="p-2" colspan="4">—</td></tr>`;
    els.panelItems.classList.toggle('hidden', !els.optItems.checked);
}

function renderDiscounts(stats) {
    els.discountCards.innerHTML = '';
    const card = (t, v) => `
    <div class="p-4 rounded-lg bg-white dark:bg-gray-800 shadow border border-gray-100 dark:border-gray-700">
      <div class="text-sm text-gray-600 dark:text-gray-400">${t}</div>
      <div class="text-2xl font-extrabold text-gray-900 dark:text-gray-100 mt-1">${v}</div>
    </div>
  `;
    els.discountCards.insertAdjacentHTML('beforeend', card('مجموع تخفیف', formatMoneyFA(stats.totalDiscount, lastCurrency)));
    els.discountCards.insertAdjacentHTML('beforeend', card('جمع اقلام قبل از تخفیف', formatMoneyFA(stats.grossItems, lastCurrency)));
    els.discountCards.insertAdjacentHTML('beforeend', card('جمع اقلام پس از تخفیف', formatMoneyFA(stats.grossItems - stats.totalDiscount, lastCurrency)));

    const rows = Object.entries(stats.discountDaily)
        .map(([date, amt]) => ({ date, amt }))
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map(r => `
      <tr class="border-b border-gray-200 dark:border-gray-700">
        <td class="p-2">${r.date}</td>
        <td class="p-2">${formatMoneyFA(r.amt, lastCurrency)}</td>
      </tr>
    `);
    els.discountsDailyTable.innerHTML = rows.join('') || `<tr><td class="p-2" colspan="2">—</td></tr>`;
    els.panelDiscounts.classList.toggle('hidden', !els.optDiscounts.checked);
}
function escapeHTML(s) { return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

/* ---------- Charts (Hourly only) ---------- */
function updateHourlyChart(labels, amounts, bestHour) {
    const ctx = els.hourlyChart.getContext('2d');

    const bg = amounts.map((_, i) => i === bestHour ? 'rgba(234,179,8,0.5)' : 'rgba(59,130,246,0.4)');
    const border = amounts.map((_, i) => i === bestHour ? 'rgba(234,179,8,1)' : 'rgba(59,130,246,1)');

    const data = {
        labels: labels.map(h => faNum(h)),
        datasets: [{
            label: 'مبلغ فروش ساعتی',
            data: amounts,
            backgroundColor: bg,
            borderColor: border,
            borderWidth: 1
        }]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        locale: 'fa-IR',
        plugins: {
            legend: { labels: { font: { family: 'Pinar' } } },
            tooltip: {
                callbacks: {
                    title: (items) => `ساعت: ${items[0].label}`,
                    label: (ctx) => ` مبلغ: ${formatMoneyFA(ctx.parsed.y || 0, lastCurrency)}`
                }
            }
        },
        scales: {
            x: { ticks: { font: { family: 'Pinar' } } },
            y: { ticks: { callback: (v) => formatMoneyFA(v, lastCurrency), font: { family: 'Pinar' } } }
        }
    };

    if (hourlyChartInstance) {
        hourlyChartInstance.data = data;
        hourlyChartInstance.options = options;
        hourlyChartInstance.update();
    } else {
        hourlyChartInstance = new Chart(ctx, { type: 'bar', data, options });
    }
}

/* ---------- Export ---------- */
function downloadJSON(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}
function exportExcel(orders, stats) {
    const wb = XLSX.utils.book_new();

    // Overview
    const wsOverview = XLSX.utils.json_to_sheet([
        { شاخص: 'تعداد سفارش', مقدار: stats.totalOrders },
        { شاخص: 'جمع فروش', مقدار: stats.totalAmount },
        { شاخص: 'میانگین هر سفارش', مقدار: stats.avgOrder },
        { شاخص: 'مشتریان یکتا', مقدار: stats.uniqueCustomers },
        { شاخص: 'مجموع تخفیف', مقدار: stats.totalDiscount },
        { شاخص: 'جمع اقلام قبل از تخفیف', مقدار: stats.grossItems },
        { شاخص: 'جمع اقلام پس از تخفیف', مقدار: stats.grossItems - stats.totalDiscount },
        { شاخص: 'واحد مبلغ', مقدار: currencyLabel(lastCurrency) },
    ]);
    XLSX.utils.book_append_sheet(wb, wsOverview, 'Overview');

    // Hourly
    const hourlyRows = Object.entries(stats.hourly).map(([h, v]) => ({
        'ساعت': Number(h), 'تعداد سفارش': v.count, 'جمع مبلغ': v.amount
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hourlyRows), 'Hourly');

    // Items (all)
    const itemsRows = Object.values(stats.products).sort((a, b) => b.amount - a.amount)
        .map(p => ({ 'نام': p.name, 'SKU': p.sku, 'تعداد': p.qty, 'مبلغ': p.amount }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemsRows), 'Items');

    // Discounts daily (شمسی باقیست)
    const discRows = Object.entries(stats.discountDaily).map(([date, amt]) => ({ 'تاریخ (ج)': date, 'مجموع تخفیف': amt }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(discRows), 'Discounts (Daily)');

    XLSX.writeFile(wb, 'woocommerce_reports.xlsx');
}

/* ---------- Main ---------- */
els.fetchOrders.addEventListener('click', async () => {
    const siteUrl = (els.siteUrl.value || '').trim();
    const key = (els.consumerKey.value || '').trim();
    const secret = (els.consumerSecret.value || '').trim();
    if (!siteUrl || !key || !secret) return alert('آدرس سایت، Key و Secret را وارد کنید.');

    const { afterISO, beforeISO } = buildDateParams();
    const status = els.orderStatus.value || '';

    try {
        lastOrders = await fetchOrdersPaginated({ siteUrl, key, secret, status, afterISO, beforeISO });
        lastCurrency = detectCurrency(lastOrders);

        lastStats = computeStats(lastOrders);
        renderOverview(lastStats);
        renderHourly(lastStats);
        renderItems(lastStats);
        renderDiscounts(lastStats);

        els.statsContainer.classList.remove('hidden');
    } catch (e) {
        console.error(e);
        alert('خطا در دریافت آمار:\n' + e.message);
    }
});

els.exportJSON.addEventListener('click', () => {
    if (!lastStats) return alert('ابتدا آمار را دریافت کنید.');
    downloadJSON('woocommerce_reports.json', {
        meta: { generated_at: new Date().toISOString(), currency: lastCurrency },
        stats: lastStats
    });
});

els.exportExcel.addEventListener('click', () => {
    if (!lastStats) return alert('ابتدا آمار را دریافت کنید.');
    exportExcel(lastOrders, lastStats);
});
