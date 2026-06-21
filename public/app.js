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
const storageStatsEl = document.querySelector('#storageStats');
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
const kanbanCards = document.querySelector('#kanbanCards');
const kanbanEmpty = document.querySelector('#kanbanEmpty');
const storageCards = document.querySelector('#storageCards');
const storageDetailTitle = document.querySelector('#storageDetailTitle');
const storageDetailEmpty = document.querySelector('#storageDetailEmpty');
const storageKanbanView = document.querySelector('#storageKanbanView');
const storageDetailView = document.querySelector('#storageDetailView');
const storageStatusFilter = document.querySelector('#storageStatusFilter');
const storageSearch = document.querySelector('#storageSearch');
const backToKanban = document.querySelector('#backToKanban');

let items = [];
let batches = [];
let templates = [];
let storageKanban = [];
let currentStorage = null;

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
  document.querySelector('#tab-storage').style.display = tab === 'storage' ? '' : 'none';
  document.querySelector('#tab-templates').style.display = tab === 'templates' ? '' : 'none';
  document.querySelector('#view-items').style.display = tab === 'items' ? '' : 'none';
  document.querySelector('#view-batches').style.display = tab === 'batches' ? '' : 'none';
  document.querySelector('#view-storage').style.display = tab === 'storage' ? '' : 'none';
  document.querySelector('#view-templates').style.display = tab === 'templates' ? '' : 'none';
  if (tab === 'storage') {
    showKanbanView();
  }
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
  storageStatusFilter.innerHTML = '<option value="">全部状态</option>' + stages.map(s => '<option>'+s+'</option>').join('');
  statusSelect.innerHTML = stages.map(s => '<option>'+s+'</option>').join('');
}

function getBatchById(id) { return batches.find(b => b.id === id); }

function getStorageLocations() {
  const locations = new Set();
  for (const item of items) {
    if (item.storage) locations.add(item.storage);
  }
  return Array.from(locations).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

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

function bindCardEvents() {
  document.querySelectorAll('[data-status]').forEach(sel => sel.onchange = async () => {
    await api('/api/items/'+sel.dataset.status, { method:'PATCH', body: JSON.stringify({ status: sel.value }) });
    await load();
  });
  document.querySelectorAll('[data-note]').forEach(btn => btn.onclick = async () => {
    const id = btn.dataset.note;
    const note = prompt('记录备注');
    if (note) {
      await api('/api/items/'+id+'/logs', { method:'POST', body: JSON.stringify({ step:'备注', note }) });
      await load();
    }
  });
  document.querySelectorAll('[data-storage-edit]').forEach(btn => btn.onclick = async () => {
    const id = btn.dataset.storageEdit;
    const item = items.find(x => x.id === id || x.code === id);
    if (!item) return;
    const locations = getStorageLocations();
    const defaultVal = item.storage || '';
    const customOption = '--- 自定义新位置 ---';
    const options = locations.length
      ? locations.map(l => l === defaultVal ? l + '（当前）' : l).join('\n') + '\n' + customOption
      : customOption;
    const promptMsg = '修改存放位置（已有位置：\n' + options + '\n）\n请输入或选择新位置：';
    const newStorage = prompt(promptMsg, defaultVal);
    if (newStorage === null) return;
    const trimmed = newStorage.trim();
    if (trimmed === defaultVal) return;
    await api('/api/items/'+id, { method:'PATCH', body: JSON.stringify({ storage: trimmed }) });
    await load();
  });
}

function renderStorageKanban() {
  if (storageKanban.length === 0) {
    kanbanCards.parentElement.style.display = 'none';
    kanbanEmpty.style.display = '';
    return;
  }
  kanbanCards.parentElement.style.display = '';
  kanbanEmpty.style.display = 'none';
  kanbanCards.innerHTML = storageKanban.map(group => {
    const countBadges = stages.map(s =>
      '<div class="kanban-badge ' + (s === '待试磨' ? 'pending' : s === '已试磨' ? 'done' : 'watch') + '">' +
        '<span>' + s + '</span>' +
        '<strong>' + (group.counts[s] || 0) + '</strong>' +
      '</div>'
    ).join('');
    return '<div class="kanban-card" data-storage-group="' + group.storage + '">' +
      '<div class="kanban-header">' +
        '<h3>' + group.storage + '</h3>' +
        '<span class="pill">共 ' + group.total + ' 件</span>' +
      '</div>' +
      '<div class="kanban-counts">' + countBadges + '</div>' +
      '<div class="kanban-footer meta">点击查看该位置全部墨锭 →</div>' +
    '</div>';
  }).join('');
  document.querySelectorAll('[data-storage-group]').forEach(card => card.onclick = () => {
    openStorageDetail(card.dataset.storageGroup);
  });
}

function openStorageDetail(storageName) {
  currentStorage = storageName;
  storageDetailTitle.textContent = '存放位置：' + storageName;
  storageKanbanView.style.display = 'none';
  storageDetailView.style.display = '';
  renderStorageDetail();
}

function showKanbanView() {
  currentStorage = null;
  storageKanbanView.style.display = '';
  storageDetailView.style.display = 'none';
  storageStatusFilter.value = '';
  storageSearch.value = '';
  renderStorageKanban();
}

function renderStorageDetail() {
  if (!currentStorage) return;
  const group = storageKanban.find(g => g.storage === currentStorage);
  if (!group || group.items.length === 0) {
    storageCards.parentElement.style.display = 'none';
    storageDetailEmpty.style.display = '';
    return;
  }
  storageCards.parentElement.style.display = '';
  storageDetailEmpty.style.display = 'none';
  const status = storageStatusFilter.value;
  const q = storageSearch.value.trim();
  const visible = group.items.filter(item => {
    if (status && item.status !== status) return false;
    if (q && !JSON.stringify(item).includes(q)) return false;
    return true;
  });
  storageCards.innerHTML = visible.map(item => cardHtml(item, true)).join('');
  bindCardEvents();
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

  const storageStats = { '存放位置数': storageKanban.length, '墨锭总数': items.length, '待分配位置': items.filter(i => !i.storage).length };
  storageStatsEl.innerHTML = Object.entries(storageStats).map(([k,v]) => '<div class="stat"><span>'+k+'</span><strong>'+v+'</strong></div>').join('');

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
  cards.innerHTML = visible.map(item => cardHtml(item, false)).join('');
  bindCardEvents();

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

  renderStorageKanban();
  if (currentStorage) {
    renderStorageDetail();
  }
}

function cardHtml(item, showStorageEdit) {
  const main = fields.slice(0,4).map(([key,label]) => '<div><b>'+label+'</b> '+(item[key] ?? '')+'</div>').join('');
  const batch = item.batchId ? getBatchById(item.batchId) : null;
  const batchBadge = batch ? '<span class="pill gold">批次 '+batch.code+'</span>' : '';
  const storageBadge = item.storage ? '<span class="pill">'+item.storage+'</span>' : '<span class="pill warn">未指定位置</span>';
  const tasks = (item.tasks || []).map(t => '<div class="meta">任务 '+t.position+' · '+t.status+' · '+t.tension+'</div>').join('');
  const logs = (item.logs || []).slice(-4).map(l => '<div>'+l.step+'：'+l.note+'</div>').join('');
  const storageEditBtn = showStorageEdit
    ? '<button class="secondary gold" data-storage-edit="'+(item.id || item.code)+'" style="margin-top:4px">修改存放位置</button>'
    : '';
  return '<article class="card"><h3>'+(item.code || item.id)+'</h3><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="pill">'+item.status+'</span>'+batchBadge+storageBadge+'</div>'+main+(batch ? '<div class="meta">批次来源：'+batch.smokeSource+'，入库 '+batch.receiveDate+'</div>' : '')+tasks+'<label>状态</label><select data-status="'+(item.id || item.code)+'">'+stages.map(s => '<option '+(s===item.status?'selected':'')+'>'+s+'</option>').join('')+'</select><button class="secondary" data-note="'+(item.id || item.code)+'">追加备注</button>'+storageEditBtn+'<div class="logs meta">'+(logs || '暂无记录')+'</div></article>';
}

async function load() {
  [items, batches, templates, storageKanban] = await Promise.all([
    api('/api/items'),
    api('/api/batches'),
    api('/api/templates'),
    api('/api/storage')
  ]);
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
storageStatusFilter.onchange = renderStorageDetail;
storageSearch.oninput = renderStorageDetail;
backToKanban.onclick = showKanbanView;
document.querySelector('#reload').onclick = load;

renderForms();
load();
