export function page() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>墨锭试磨室</title>
  <style>
    :root { --bg:#f1f3ef; --panel:#fff; --ink:#20241f; --muted:#687066; --line:#d4ddd0; --accent:#526f43; --warn:#9b4937; --gold:#a58747; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:26px; } h2 { margin:0 0 12px; font-size:18px; } main { display:grid; grid-template-columns:380px 1fr; gap:22px; padding:22px 28px; }
    form,.panel,.card,.stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; } input,select,textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; background:#fff; } textarea { min-height:68px; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:10px 13px; font-weight:700; cursor:pointer; } button.secondary { background:#69736a; } button.gold { background:var(--gold); }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin-bottom:14px; } .stat strong { display:block; font-size:24px; }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; } .toolbar select,.toolbar input { width:auto; min-width:160px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; } .card { display:grid; gap:8px; }
    .meta { color:var(--muted); font-size:13px; } .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; } .pill.gold { background:#f8eed6; border-color:#d9c79a; color:#7a6430; }
    .logs { border-top:1px solid var(--line); padding-top:8px; max-height:90px; overflow:auto; } .warn { color:var(--warn); font-weight:700; }
    .tabs { display:flex; gap:6px; margin-bottom:14px; } .tab { padding:8px 14px; border-radius:6px; background:#e2e6dd; cursor:pointer; font-weight:700; color:var(--muted); } .tab.active { background:var(--accent); color:#fff; }
    table { width:100%; border-collapse:collapse; } th,td { text-align:left; padding:9px 8px; border-bottom:1px solid var(--line); font-size:14px; } th { color:var(--muted); font-weight:600; font-size:12px; }
    .progress { height:8px; background:#e2e6dd; border-radius:4px; overflow:hidden; } .progress-bar { height:100%; background:var(--accent); transition:width .3s; }
    .batch-code { font-family:monospace; font-weight:700; color:var(--gold); }
    .section-title { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
    .empty { text-align:center; color:var(--muted); padding:24px; }
    @media (max-width:900px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>墨锭试磨室</h1>
      <div class="meta">墨锭建档、批次管理、试磨记录和评分统计</div>
    </div>
    <button id="reload">刷新</button>
  </header>
  <main>
    <section>
      <div class="tabs">
        <div class="tab active" data-tab="items">墨锭管理</div>
        <div class="tab" data-tab="batches">批次管理</div>
        <div class="tab" data-tab="templates">试磨方案模板</div>
      </div>
      <div id="tab-items">
        <form id="createForm">
          <h2>新增墨锭</h2>
          <div id="fields"></div>
          <label>所属批次</label>
          <select name="batchId" id="batchSelect"><option value="">无（单独录入）</option></select>
          <label>初始状态</label>
          <select name="status" id="statusSelect"></select>
          <button>保存墨锭</button>
        </form>
        <form id="actionForm" style="margin-top:14px">
          <h2>创建试磨记录</h2>
          <label>选择墨锭</label>
          <select name="id" id="itemSelect"></select>
          <label>选择方案模板</label>
          <select id="templateSelect"><option value="">-- 手动填写 --</option></select>
          <div id="extraFields"></div>
          <label>研磨时长</label>
          <input name="grindingTime" id="grindingTime">
          <label>观察重点</label>
          <textarea name="observationPoints" id="observationPoints"></textarea>
          <button>提交记录</button>
        </form>
      </div>
      <div id="tab-batches" style="display:none">
        <form id="batchForm">
          <h2>新增批次</h2>
          <div id="batchFields"></div>
          <button>保存批次</button>
        </form>
      </div>
      <div id="tab-templates" style="display:none">
        <form id="templateForm">
          <h2>新增试磨方案模板</h2>
          <div id="templateFields"></div>
          <label style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" name="isDefault" id="templateDefault">
            <span style="margin:0">设为默认模板</span>
          </label>
          <button>保存模板</button>
        </form>
      </div>
    </section>
    <section>
      <div id="view-items">
        <div class="stats" id="stats"></div>
        <div class="toolbar">
          <select id="statusFilter"><option value="">全部状态</option></select>
          <select id="batchFilter"><option value="">全部批次</option></select>
          <input id="search" placeholder="搜索编号或关键词">
        </div>
        <div class="panel">
          <h2>选择墨锭后录入试磨记录，系统会保留多次试磨结果并更新评分状态。</h2>
          <div class="grid" id="cards"></div>
        </div>
      </div>
      <div id="view-batches" style="display:none">
        <div class="stats" id="batchStats"></div>
        <div class="panel">
          <div class="section-title">
            <h2>批次列表 — 同一来源、同一入库时间的墨锭分组</h2>
          </div>
          <table id="batchTable">
            <thead>
              <tr><th>批次编号</th><th>烟料来源</th><th>入库日期</th><th>样品数量</th><th>试磨进度</th><th>备注</th></tr>
            </thead>
            <tbody></tbody>
          </table>
          <div id="batchEmpty" class="empty" style="display:none">暂无批次数据，请在左侧新增批次。</div>
        </div>
      </div>
      <div id="view-templates" style="display:none">
        <div class="stats" id="templateStats"></div>
        <div class="panel">
          <div class="section-title">
            <h2>试磨方案模板列表 — 预先维护常用的试磨参数</h2>
          </div>
          <table id="templateTable">
            <thead>
              <tr><th>方案名称</th><th>试磨纸张</th><th>加水量</th><th>研磨时长</th><th>出墨速度</th><th>观察重点</th><th>操作</th></tr>
            </thead>
            <tbody></tbody>
          </table>
          <div id="templateEmpty" class="empty" style="display:none">暂无模板数据，请在左侧新增模板。</div>
        </div>
      </div>
    </section>
  </main>
  <script>
    const fields = [["code","墨锭编号","text"],["smokeSource","烟料来源","text"],["glueRatio","胶料比例","text"],["ageYears","存放年限","number"],["storage","存放位置","text"]];
    const stages = ["待试磨","已试磨","重点观察"];
    const extraFields = [["paper","试磨纸张"],["water","加水量"],["speed","出墨速度"],["colorLayer","墨色层次"],["sediment","沉淀情况"],["score","评分"]];
    const batchFields = [["code","批次编号","text"],["smokeSource","烟料来源","text"],["receiveDate","入库日期","date"],["note","备注说明","textarea"]];
    const templateFields = [["name","方案名称","text"],["paper","试磨纸张","text"],["water","加水量","text"],["grindingTime","研磨时长","text"],["speed","出墨速度","text"],["observationPoints","观察重点","textarea"]];

    const createForm = document.querySelector('#createForm');
    const actionForm = document.querySelector('#actionForm');
    const batchForm = document.querySelector('#batchForm');
    const templateForm = document.querySelector('#templateForm');
    const cards = document.querySelector('#cards');
    const statsEl = document.querySelector('#stats');
    const batchStatsEl = document.querySelector('#batchStats');
    const templateStatsEl = document.querySelector('#templateStats');
    const itemSelect = document.querySelector('#itemSelect');
    const batchSelect = document.querySelector('#batchSelect');
    const templateSelect = document.querySelector('#templateSelect');
    const batchFilter = document.querySelector('#batchFilter');
    const statusFilter = document.querySelector('#statusFilter');
    const statusSelect = document.querySelector('#statusSelect');
    const batchTable = document.querySelector('#batchTable tbody');
    const templateTable = document.querySelector('#templateTable tbody');
    const batchEmpty = document.querySelector('#batchEmpty');
    const templateEmpty = document.querySelector('#templateEmpty');

    let items = [];
    let batches = [];
    let templates = [];

    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers:{ 'Content-Type':'application/json' } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '请求失败');
      return data;
    }

    function switchTab(tab) {
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
      document.querySelector('#tab-items').style.display = tab === 'items' ? '' : 'none';
      document.querySelector('#tab-batches').style.display = tab === 'batches' ? '' : 'none';
      document.querySelector('#tab-templates').style.display = tab === 'templates' ? '' : 'none';
      document.querySelector('#view-items').style.display = tab === 'items' ? '' : 'none';
      document.querySelector('#view-batches').style.display = tab === 'batches' ? '' : 'none';
      document.querySelector('#view-templates').style.display = tab === 'templates' ? '' : 'none';
    }

    function renderForms() {
      document.querySelector('#fields').innerHTML = fields.map(([key,label,type]) => '<label>'+label+'</label><input name="'+key+'" type="'+type+'" '+(key==='code'?'required':'')+'>').join('');
      document.querySelector('#extraFields').innerHTML = extraFields.map(([key,label]) => '<label>'+label+'</label><input name="'+key+'">').join('');
      document.querySelector('#batchFields').innerHTML = batchFields.map(([key,label,type]) => {
        if (type === 'textarea') return '<label>'+label+'</label><textarea name="'+key+'"></textarea>';
        return '<label>'+label+'</label><input name="'+key+'" type="'+type+'" '+(key==='code'?'required':'')+(key==='receiveDate'?'required':'')+'>';
      }).join('');
      document.querySelector('#templateFields').innerHTML = templateFields.map(([key,label,type]) => {
        if (type === 'textarea') return '<label>'+label+'</label><textarea name="'+key+'"></textarea>';
        return '<label>'+label+'</label><input name="'+key+'" type="'+type+'" '+(key==='name'?'required':'')+'>';
      }).join('');
      statusFilter.innerHTML = '<option value="">全部状态</option>' + stages.map(s => '<option>'+s+'</option>').join('');
      statusSelect.innerHTML = stages.map(s => '<option>'+s+'</option>').join('');
    }

    function getBatchById(id) { return batches.find(b => b.id === id); }

    function applyTemplate(templateId) {
      const tpl = templates.find(t => t.id === templateId);
      if (!tpl) return;
      const formData = new FormData(actionForm);
      formData.set('paper', tpl.paper || '');
      formData.set('water', tpl.water || '');
      formData.set('speed', tpl.speed || '');
      formData.set('grindingTime', tpl.grindingTime || '');
      formData.set('observationPoints', tpl.observationPoints || '');
      for (const [key, value] of formData.entries()) {
        const el = actionForm.querySelector('[name="'+key+'"]');
        if (el) el.value = value;
      }
    }

    function render() {
      batchSelect.innerHTML = '<option value="">无（单独录入）</option>' + batches.map(b => '<option value="'+b.id+'">'+b.code+' · '+b.smokeSource+'</option>').join('');
      batchFilter.innerHTML = '<option value="">全部批次</option>' + batches.map(b => '<option value="'+b.id+'">'+b.code+' · '+b.smokeSource+'</option>').join('');
      itemSelect.innerHTML = items.map(item => '<option value="'+(item.id || item.code)+'">'+(item.code || item.id)+' · '+(item.name || item.shipType || item.source || item.plateSize || item.smokeSource || '')+'</option>').join('');
      templateSelect.innerHTML = '<option value="">-- 手动填写 --</option>' + templates.map(t => '<option value="'+t.id+'" '+(t.isDefault?'selected':'')+'>'+t.name+(t.isDefault?' (默认)':'')+'</option>').join('');

      const stats = Object.fromEntries(stages.map(s => [s, items.filter(i => i.status === s).length]));
      statsEl.innerHTML = Object.entries(stats).map(([k,v]) => '<div class="stat"><span>'+k+'</span><strong>'+v+'</strong></div>').join('');

      const batchStats = { '批次总数': batches.length, '墨锭总数': items.length, '已完成批次': batches.filter(b => { const it = items.filter(i => i.batchId === b.id); return it.length > 0 && it.every(i => i.status === '已试磨'); }).length };
      batchStatsEl.innerHTML = Object.entries(batchStats).map(([k,v]) => '<div class="stat"><span>'+k+'</span><strong>'+v+'</strong></div>').join('');

      const templateStats = { '模板总数': templates.length, '默认模板': templates.filter(t => t.isDefault).length };
      templateStatsEl.innerHTML = Object.entries(templateStats).map(([k,v]) => '<div class="stat"><span>'+k+'</span><strong>'+v+'</strong></div>').join('');

      const status = statusFilter.value;
      const q = document.querySelector('#search').value.trim();
      const batchId = batchFilter.value;
      const visible = items.filter(item => {
        if (status && item.status !== status) return false;
        if (batchId && item.batchId !== batchId) return false;
        if (q && !JSON.stringify(item).includes(q)) return false;
        return true;
      });
      cards.innerHTML = visible.map(item => cardHtml(item)).join('');
      document.querySelectorAll('[data-status]').forEach(sel => sel.onchange = async () => { await api('/api/items/'+sel.dataset.status, { method:'PATCH', body: JSON.stringify({ status: sel.value }) }); await load(); });
      document.querySelectorAll('[data-note]').forEach(btn => btn.onclick = async () => { const id = btn.dataset.note; const note = prompt('记录备注'); if (note) { await api('/api/items/'+id+'/logs', { method:'POST', body: JSON.stringify({ step:'备注', note }) }); await load(); } });

      if (batches.length === 0) {
        batchTable.parentElement.style.display = 'none';
        batchEmpty.style.display = '';
      } else {
        batchTable.parentElement.style.display = '';
        batchEmpty.style.display = 'none';
        batchTable.innerHTML = batches.map(b => {
          const prog = b.progress || { total: 0, tested: 0, percent: 0 };
          return '<tr><td class="batch-code">'+b.code+'</td><td>'+b.smokeSource+'</td><td>'+b.receiveDate+'</td><td>'+prog.total+' 件</td><td><div style="display:flex;align-items:center;gap:8px"><div class="progress" style="flex:1;min-width:80px"><div class="progress-bar" style="width:'+prog.percent+'%"></div></div><span class="meta">'+prog.tested+'/'+prog.total+' ('+prog.percent+'%)</span></div></td><td class="meta">'+(b.note || '-')+'</td></tr>';
        }).join('');
      }

      if (templates.length === 0) {
        templateTable.parentElement.style.display = 'none';
        templateEmpty.style.display = '';
      } else {
        templateTable.parentElement.style.display = '';
        templateEmpty.style.display = 'none';
        templateTable.innerHTML = templates.map(t => {
          return '<tr><td>'+(t.isDefault?'<span class="pill gold">默认</span> ':'')+t.name+'</td><td>'+(t.paper||'-')+'</td><td>'+(t.water||'-')+'</td><td>'+(t.grindingTime||'-')+'</td><td>'+(t.speed||'-')+'</td><td class="meta">'+(t.observationPoints||'-')+'</td><td><div style="display:flex;gap:6px"><button class="secondary" data-default="'+t.id+'" '+(t.isDefault?'disabled style="opacity:0.5"':'')+'>设为默认</button><button class="secondary" style="background:var(--warn)" data-delete="'+t.id+'">删除</button></div></td></tr>';
        }).join('');
        document.querySelectorAll('[data-default]').forEach(btn => btn.onclick = async () => { await api('/api/templates/'+btn.dataset.default+'/default', { method:'POST' }); await load(); });
        document.querySelectorAll('[data-delete]').forEach(btn => btn.onclick = async () => { if (confirm('确定删除此模板？')) { await api('/api/templates/'+btn.dataset.delete, { method:'DELETE' }); await load(); } });
      }
    }

    function cardHtml(item) {
      const main = fields.slice(0,4).map(([key,label]) => '<div><b>'+label+'</b> '+(item[key] ?? '')+'</div>').join('');
      const batch = item.batchId ? getBatchById(item.batchId) : null;
      const batchBadge = batch ? '<span class="pill gold">批次 '+batch.code+'</span>' : '';
      const tasks = (item.tasks || []).map(t => '<div class="meta">任务 '+t.position+' · '+t.status+' · '+t.tension+'</div>').join('');
      const logs = (item.logs || []).slice(-4).map(l => '<div>'+l.step+'：'+l.note+'</div>').join('');
      return '<article class="card"><h3>'+(item.code || item.id)+'</h3><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="pill">'+item.status+'</span>'+batchBadge+'</div>'+main+(batch ? '<div class="meta">批次来源：'+batch.smokeSource+'，入库 '+batch.receiveDate+'</div>' : '')+tasks+'<label>状态</label><select data-status="'+(item.id || item.code)+'">'+stages.map(s => '<option '+(s===item.status?'selected':'')+'>'+s+'</option>').join('')+'</select><button class="secondary" data-note="'+(item.id || item.code)+'">追加备注</button><div class="logs meta">'+(logs || '暂无记录')+'</div></article>';
    }

    async function load() {
      [items, batches, templates] = await Promise.all([api('/api/items'), api('/api/batches'), api('/api/templates')]);
      render();
      const defaultTpl = templates.find(t => t.isDefault);
      if (defaultTpl && templateSelect.value === defaultTpl.id) {
        applyTemplate(defaultTpl.id);
      }
    }

    createForm.onsubmit = async event => {
      event.preventDefault();
      await api('/api/items', { method:'POST', body: JSON.stringify(Object.fromEntries(new FormData(createForm).entries())) });
      createForm.reset();
      await load();
    };
    actionForm.onsubmit = async event => {
      event.preventDefault();
      await api('/api/items/'+itemSelect.value+'/action', { method:'POST', body: JSON.stringify(Object.fromEntries(new FormData(actionForm).entries())) });
      actionForm.reset();
      await load();
    };
    batchForm.onsubmit = async event => {
      event.preventDefault();
      await api('/api/batches', { method:'POST', body: JSON.stringify(Object.fromEntries(new FormData(batchForm).entries())) });
      batchForm.reset();
      await load();
    };
    templateForm.onsubmit = async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(templateForm).entries());
      data.isDefault = templateForm.querySelector('[name="isDefault"]').checked;
      await api('/api/templates', { method:'POST', body: JSON.stringify(data) });
      templateForm.reset();
      await load();
    };
    templateSelect.onchange = () => {
      if (templateSelect.value) {
        applyTemplate(templateSelect.value);
      } else {
        actionForm.reset();
      }
    };
    document.querySelectorAll('.tab').forEach(tab => tab.onclick = () => switchTab(tab.dataset.tab));
    statusFilter.onchange = render;
    batchFilter.onchange = render;
    document.querySelector('#search').oninput = render;
    document.querySelector('#reload').onclick = load;

    renderForms();
    load();
  </script>
</body>
</html>`;
}
