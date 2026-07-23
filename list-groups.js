(() => {
  'use strict';

  const style = document.createElement('style');
  style.textContent = `
    .country-summary{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}
    .country-pill{border:1px solid #b9cfc1;background:#fff;color:#174d32;border-radius:999px;padding:8px 11px;font-weight:800;cursor:pointer}
    .country-pill.active{background:#148557;color:#fff;border-color:#148557}
    .country-filter{width:100%;margin:0 0 10px;padding:11px 12px;border:1.5px solid #b9c8bf;border-radius:12px;background:#fff;font:inherit;font-weight:700}
    .country-group{border:1px solid #dfe8e2;border-radius:14px;overflow:hidden;background:#fff}
    .country-head{width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;border:0;background:#edf6f1;color:#173f2a;padding:13px 14px;font:inherit;font-weight:900;text-align:left;cursor:pointer}
    .country-head small{font-size:.78rem;color:#5f7367;font-weight:750}
    .country-body{padding:8px;display:grid;gap:7px}
    .country-body.hidden{display:none}
    .group-numbers{display:flex;flex-wrap:wrap;gap:6px;padding:2px 0 5px}
    .group-number{display:inline-grid;place-items:center;min-width:38px;height:34px;border-radius:9px;background:#e7f4ed;color:#075c3a;font-weight:900}
  `;
  document.head.appendChild(style);

  const filter = document.createElement('select');
  filter.id = 'countryFilter';
  filter.className = 'country-filter';
  filter.innerHTML = '<option value="">Alle Länder / Teams</option>';
  el.search.parentElement.insertAdjacentElement('afterend', filter);

  let selectedCountry = '';
  const openGroups = new Set();

  function countryKey(row) {
    return (row.country || row.code || 'Ohne Land').trim();
  }

  function refreshFilter() {
    const current = selectedCountry;
    const countries = [...new Set(rows.map(countryKey))].sort((a,b)=>a.localeCompare(b,'de'));
    filter.innerHTML = '<option value="">Alle Länder / Teams</option>' + countries.map(country =>
      `<option value="${esc(country)}">${esc(country)}</option>`
    ).join('');
    filter.value = countries.includes(current) ? current : '';
    if (!countries.includes(current)) selectedCountry = '';
  }

  function setCountry(country) {
    selectedCountry = country || '';
    filter.value = selectedCountry;
    render();
    document.getElementById('list')?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  filter.addEventListener('change', () => setCountry(filter.value));

  render = function() {
    refreshFilter();
    const query = el.search.value.trim().toLowerCase();
    const sorted = [...rows].sort((a,b)=>countryKey(a).localeCompare(countryKey(b),'de') || a.number-b.number);
    const filtered = sorted.filter(row => {
      const country = countryKey(row);
      const matchesCountry = !selectedCountry || country === selectedCountry;
      const matchesQuery = !query || `${country} ${row.code} ${row.number} ${row.state}`.toLowerCase().includes(query);
      return matchesCountry && matchesQuery;
    });

    const groups = new Map();
    for (const row of filtered) {
      const key = countryKey(row);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const allGroups = new Map();
    for (const row of sorted) {
      const key = countryKey(row);
      if (!allGroups.has(key)) allGroups.set(key, []);
      allGroups.get(key).push(row);
    }

    el.summary.innerHTML = rows.length
      ? `<b>${rows.length}</b> Sticker in <b>${allGroups.size}</b> Ländern/Teams gespeichert.<div class="country-summary">${[...allGroups.entries()].map(([country,items])=>`<button type="button" class="country-pill${selectedCountry===country?' active':''}" data-country="${esc(country)}">${esc(country)} · ${items.length}</button>`).join('')}</div>`
      : 'Noch keine Sticker erfasst.';

    el.counter.textContent = `${filtered.length} Einträge`;
    el.empty.classList.toggle('hidden', filtered.length > 0);
    el.list.classList.toggle('hidden', filtered.length === 0);

    el.list.innerHTML = [...groups.entries()].map(([country,items]) => {
      const code = items.find(item=>item.code)?.code || 'ohne Code';
      const isOpen = selectedCountry === country || openGroups.has(country) || groups.size === 1;
      const numbers = items.map(item=>item.number).sort((a,b)=>a-b);
      return `<section class="country-group">
        <button type="button" class="country-head" data-toggle-country="${esc(country)}">
          <span>${esc(country)} <small>${esc(code)}</small></span><span>${items.length} Sticker ${isOpen?'▴':'▾'}</span>
        </button>
        <div class="country-body${isOpen?'':' hidden'}">
          <div class="group-numbers">${numbers.map(number=>`<span class="group-number">${number}</span>`).join('')}</div>
          ${items.map(item=>`<div class="item"><div><div class="title">Sticker <span class="num">${item.number}</span></div><div class="sub">${esc(item.code||'ohne Code')} · ${esc(item.state)}</div></div><button class="x" data-id="${item.id}">×</button></div>`).join('')}
        </div>
      </section>`;
    }).join('');
  };

  el.summary.addEventListener('click', event => {
    const button = event.target.closest('[data-country]');
    if (button) setCountry(button.dataset.country);
  });

  el.list.addEventListener('click', event => {
    const toggle = event.target.closest('[data-toggle-country]');
    if (!toggle) return;
    const country = toggle.dataset.toggleCountry;
    if (openGroups.has(country)) openGroups.delete(country); else openGroups.add(country);
    render();
  });

  el.search.addEventListener('input', render);
  render();
})();
