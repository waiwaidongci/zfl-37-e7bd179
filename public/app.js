const fields = [["code","墨锭编号","text"],["smokeSource","烟料来源","text"],["glueRatio","胶料比例","text"],["ageYears","存放年限","number"],["storage","存放位置","text"]];
const stages = ["待试磨","已试磨","重点观察"];
const extraFields = [["paper","试磨纸张"],["water","加水量"],["speed","出墨速度"],["colorLayer","墨色层次"],["sediment","沉淀情况"],["score","评分"]];
const batchFields = [["code","批次编号","text"],["smokeSource","烟料来源","text"],["receiveDate","入库日期","date"],["note","备注说明","textarea"]];
const templateFields = [["name","方案名称","text"],["paper","试磨纸张","text"],["water","加水量","text"],["grindingTime","研磨时长","text"],["speed","出墨速度","text"],["observationPoints","观察重点","textarea"]];
const taskStatuses = ["待办","进行中","已完成","已取消"];

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

const taskForm = document.querySelector('#taskForm');
const taskItemSelect = document.querySelector('#taskItemSelect');
const taskList = document.querySelector('#taskList');
const taskEmpty = document.querySelector('#taskEmpty');
const taskStatsEl = document.querySelector('#taskStats');
const taskStatusFilter = document.querySelector('#taskStatusFilter');
const taskAssigneeFilter = document.querySelector('#taskAssigneeFilter');
const taskDateFrom = document.querySelector('#taskDateFrom');
const taskDateTo = document.querySelector('#taskDateTo');
const taskFilterReset = document.querySelector('#taskFilterReset');
const taskAlert = document.querySelector('#taskAlert');
const todayCountEl = document.querySelector('#todayCount');
const overdueCountEl = document.querySelector('#overdueCount');
const completedCountEl = document.querySelector('#completedCount');
const homeTodoAlert = document.querySelector('#homeTodoAlert');

const batchDetailDrawer = document.querySelector('#batchDetailDrawer');
const drawerClose = document.querySelector('#drawerClose');
const drawerBatchCode = document.querySelector('#drawerBatchCode');
const drawerBatchSmoke = document.querySelector('#drawerBatchSmoke');
const drawerTotal = document.querySelector('#drawerTotal');
const drawerUntested = document.querySelector('#drawerUntested');
const drawerTested = document.querySelector('#drawerTested');
const drawerRetest = document.querySelector('#drawerRetest');
const drawerAvgScore = document.querySelector('#drawerAvgScore');
const drawerProgressBar = document.querySelector('#drawerProgressBar');
const drawerProgressText = document.querySelector('#drawerProgressText');
const drawerItemList = document.querySelector('#drawerItemList');
const drawerEmpty = document.querySelector('#drawerEmpty');
const drawerStatusFilter = document.querySelector('#drawerStatusFilter');
const drawerSearch = document.querySelector('#drawerSearch');
const drawerCreateTasksBtn = document.querySelector('#drawerCreateTasksBtn');
const drawerRetestBtn = document.querySelector('#drawerRetestBtn');

let currentBatchDetail = null;
let drawerItems = [];

let items = [];
let batches = [];
let templates = [];
let storageKanban = [];
let currentStorage = null;
let tasks = [];
let todayTasksData = null;
let itemTaskCache = {};
let selectedCompareIds = new Set();

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
  document.querySelector('#tab-tasks').style.display = tab === 'tasks' ? '' : 'none';
  document.querySelector('#view-items').style.display = tab === 'items' ? '' : 'none';
  document.querySelector('#view-batches').style.display = tab === 'batches' ? '' : 'none';
  document.querySelector('#view-storage').style.display = tab === 'storage' ? '' : 'none';
  document.querySelector('#view-templates').style.display = tab === 'templates' ? '' : 'none';
  document.querySelector('#view-tasks').style.display = tab === 'tasks' ? '' : 'none';
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
  taskStatusFilter.innerHTML = '<option value="">全部状态</option>' + taskStatuses.map(s => '<option>'+s+'</option>').join('');
  const today = new Date().toISOString().slice(0,10);
  document.querySelector('#taskDate').value = today;
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

function updateCompareButton() {
  const compareBtn = document.querySelector('#compareBtn');
  const clearBtn = document.querySelector('#clearCompareBtn');
  if (!compareBtn) return;
  const count = selectedCompareIds.size;
  compareBtn.textContent = '生成对比报告（' + count + '）';
  compareBtn.disabled = count < 2 || count > 4;
  if (clearBtn) clearBtn.style.display = count > 0 ? '' : 'none';
}

function openBatchDrawer(batchId) {
  api('/api/batches/' + batchId).then(detail => {
    currentBatchDetail = detail;
    drawerItems = detail.items || [];
    drawerBatchCode.textContent = detail.code + ' 批次详情';
    drawerBatchSmoke.textContent = detail.smokeSource + ' · 入库日期：' + detail.receiveDate;
    drawerTotal.textContent = detail.total || 0;
    drawerUntested.textContent = detail.untestedCount || 0;
    drawerTested.textContent = detail.statusCounts?.['已试磨'] || 0;
    drawerRetest.textContent = detail.suggestRetestCount || 0;
    drawerAvgScore.textContent = detail.avgScore !== null ? detail.avgScore : '-';

    const prog = detail.progress || { total: 0, tested: 0, percent: 0 };
    drawerProgressBar.style.width = prog.percent + '%';
    drawerProgressText.textContent = prog.tested + '/' + prog.total + ' (' + prog.percent + '%)';

    drawerStatusFilter.innerHTML = '<option value="">全部状态</option>' +
      stages.map(s => '<option>' + s + '</option>').join('');
    drawerStatusFilter.value = '';
    drawerSearch.value = '';

    renderDrawerItems();
    batchDetailDrawer.style.display = '';
  }).catch(err => {
    alert('加载批次详情失败：' + err.message);
  });
}

function closeBatchDrawer() {
  batchDetailDrawer.style.display = 'none';
  currentBatchDetail = null;
  drawerItems = [];
}

function renderDrawerItems() {
  const status = drawerStatusFilter.value;
  const q = drawerSearch.value.trim();
  const visible = drawerItems.filter(item => {
    if (status && item.status !== status) return false;
    if (q && !JSON.stringify(item).includes(q)) return false;
    return true;
  });

  if (visible.length === 0) {
    drawerItemList.style.display = 'none';
    drawerEmpty.style.display = '';
    return;
  }

  drawerItemList.style.display = '';
  drawerEmpty.style.display = 'none';

  drawerItemList.innerHTML = visible.map(item => {
    const scoreBadge = item.latestScore !== null
      ? '<span class="pill ' + (item.latestScore >= 85 ? 'done' : item.latestScore >= 70 ? 'pending' : 'warn') + '">评分 ' + item.latestScore + '</span>'
      : '<span class="pill warn">未试磨</span>';
    const taskBadge = item.hasActiveTask
      ? '<span class="pill task-count-badge">有进行中任务</span>'
      : '';
    const storageBadge = item.storage
      ? '<span class="pill">' + item.storage + '</span>'
      : '<span class="pill warn">未指定位置</span>';

    return '<div class="drawer-item">' +
      '<div class="drawer-item-header">' +
        '<strong>' + (item.code || item.id) + '</strong>' +
        '<span class="pill ' + (item.status === '已试磨' ? 'done' : item.status === '待试磨' ? 'pending' : 'watch') + '">' + item.status + '</span>' +
      '</div>' +
      '<div class="drawer-item-meta">' +
        '<span>烟料：' + (item.smokeSource || '-') + '</span>' +
        '<span>年限：' + (item.ageYears ?? '-') + ' 年</span>' +
      '</div>' +
      '<div class="drawer-item-badges">' + scoreBadge + storageBadge + taskBadge + '</div>' +
      '<div class="drawer-item-actions">' +
        (item.status === '待试磨' && !item.hasActiveTask
          ? '<button class="secondary gold" data-drawer-create-task="' + item.id + '">创建试磨任务</button>'
          : '') +
        (item.hasActiveTask
          ? '<button class="secondary" data-drawer-goto-task="' + item.activeTaskId + '">查看任务</button>'
          : '') +
      '</div>' +
    '</div>';
  }).join('');

  document.querySelectorAll('[data-drawer-create-task]').forEach(btn => {
    btn.onclick = () => createSingleTaskFromDrawer(btn.dataset.drawerCreateTask);
  });
  document.querySelectorAll('[data-drawer-goto-task]').forEach(btn => {
    btn.onclick = () => {
      closeBatchDrawer();
      switchTab('tasks');
    };
  });
}

async function createSingleTaskFromDrawer(itemId) {
  const scheduledDate = prompt('请输入计划日期（YYYY-MM-DD）', new Date().toISOString().slice(0, 10));
  if (!scheduledDate) return;
  const assignee = prompt('请输入负责人', '');
  if (assignee === null) return;

  try {
    await api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ itemId, scheduledDate, assignee })
    });
    alert('任务创建成功！');
    if (currentBatchDetail) {
      openBatchDrawer(currentBatchDetail.id);
    }
    await load();
  } catch (err) {
    alert('创建失败：' + err.message);
  }
}

async function createBatchTasksFromDrawer(targetStatus, itemIds = null) {
  const scheduledDate = prompt('请输入计划日期（YYYY-MM-DD）', new Date().toISOString().slice(0, 10));
  if (!scheduledDate) return;
  const assignee = prompt('请输入负责人', '');
  if (assignee === null) return;
  const note = prompt('任务备注（可选）', '') || '';
  if (note === null) return;

  const body = { scheduledDate, assignee, note };
  if (itemIds && Array.isArray(itemIds)) {
    body.itemIds = itemIds;
  } else if (targetStatus) {
    body.targetStatus = targetStatus;
  }

  try {
    const result = await api('/api/batches/' + currentBatchDetail.id + '/tasks', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    alert('批量创建完成！\n成功创建 ' + result.createdCount + ' 个任务' +
      (result.skippedCount > 0 ? '\n跳过 ' + result.skippedCount + ' 个（已有未完成任务）' : ''));
    if (currentBatchDetail) {
      openBatchDrawer(currentBatchDetail.id);
    }
    await load();
  } catch (err) {
    alert('批量创建失败：' + err.message);
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
  document.querySelectorAll('[data-compare]').forEach(cb => cb.onchange = () => {
    const id = cb.dataset.compare;
    if (cb.checked) {
      if (selectedCompareIds.size >= 4) {
        cb.checked = false;
        alert('最多只能选择4块墨锭进行对比');
        return;
      }
      selectedCompareIds.add(id);
      cb.closest('.card').classList.add('card-selected');
    } else {
      selectedCompareIds.delete(id);
      cb.closest('.card').classList.remove('card-selected');
    }
    updateCompareButton();
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

  const pendingItems = items.filter(i => i.status === '待试磨' || i.status === '重点观察');
  taskItemSelect.innerHTML = pendingItems.map(item => '<option value="'+(item.id || item.code)+'">'+(item.code || item.id)+' · '+(item.smokeSource || '')+'</option>').join('');

  const assignees = getAssignees();
  const prevAssignee = taskAssigneeFilter.value;
  taskAssigneeFilter.innerHTML = '<option value="">全部负责人</option>' + assignees.map(a => '<option value="'+a+'">'+a+'</option>').join('');
  taskAssigneeFilter.value = prevAssignee;

  const taskStats = { '任务总数': tasks.length, '待办': tasks.filter(t => t.status === '待办').length, '进行中': tasks.filter(t => t.status === '进行中').length, '已完成': tasks.filter(t => t.status === '已完成').length };
  taskStatsEl.innerHTML = Object.entries(taskStats).map(([k,v]) => '<div class="stat"><span>'+k+'</span><strong>'+v+'</strong></div>').join('');

  renderHomeTodoAlert();
  renderTaskOverview();
  renderTasks();

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
      return '<tr class="batch-row" data-batch-id="' + b.id + '"><td class="batch-code">' + b.code + '</td><td>' + b.smokeSource + '</td><td>' + b.receiveDate + '</td><td>' + prog.total + ' 件</td><td><div style="display:flex;align-items:center;gap:8px"><div class="progress" style="flex:1;min-width:80px"><div class="progress-bar" style="width:' + prog.percent + '%"></div></div><span class="meta">' + prog.tested + '/' + prog.total + ' (' + prog.percent + '%)</span></div></td><td class="meta">' + (b.note || '-') + '</td></tr>';
    }).join('');
    document.querySelectorAll('.batch-row').forEach(row => {
      row.onclick = () => openBatchDrawer(row.dataset.batchId);
    });
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
  updateCompareButton();
}

function cardHtml(item, showStorageEdit) {
  const itemId = item.id || item.code;
  const isSelected = selectedCompareIds.has(itemId);
  const main = fields.slice(0,4).map(([key,label]) => '<div><b>'+label+'</b> '+(item[key] ?? '')+'</div>').join('');
  const batch = item.batchId ? getBatchById(item.batchId) : null;
  const batchBadge = batch ? '<span class="pill gold">批次 '+batch.code+'</span>' : '';
  const storageBadge = item.storage ? '<span class="pill">'+item.storage+'</span>' : '<span class="pill warn">未指定位置</span>';
  const itemTasks = tasks.filter(t => t.itemId === item.id || t.itemId === item.code);
  const activeTask = itemTasks.find(t => t.status === '待办' || t.status === '进行中');
  let taskHtml = '';
  if (activeTask) {
    const isOverdue = activeTask.scheduledDate < new Date().toISOString().slice(0,10);
    taskHtml = '<div class="item-task '+(isOverdue?'overdue':'')+'"><span class="task-label">'+(isOverdue?'逾期任务':'待办任务')+'</span><span class="task-date">'+activeTask.scheduledDate+'</span><span class="task-assignee">'+(activeTask.assignee||'未指定')+'</span></div>';
  }
  const taskCount = itemTasks.length;
  const taskCountBadge = taskCount > 0 ? '<span class="pill task-count-badge">历史 '+taskCount+' 次</span>' : '';
  const taskHistory = itemTasks.length > 0
    ? '<div class="task-history"><div class="task-history-title">任务历史</div>' +
        itemTasks.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(t =>
          '<div class="task-history-item">' +
            '<span class="pill '+taskStatusClass(t.status)+'">'+t.status+'</span>' +
            '<span class="task-history-date">'+t.scheduledDate+'</span>' +
            '<span class="task-history-assignee">'+(t.assignee||'未指定')+'</span>' +
            (t.note ? '<span class="task-history-note">'+t.note+'</span>' : '') +
          '</div>'
        ).join('') +
      '</div>'
    : '';
  const logs = (item.logs || []).slice(-4).map(l => '<div>'+l.step+'：'+l.note+'</div>').join('');
  const storageEditBtn = showStorageEdit
    ? '<button class="secondary gold" data-storage-edit="'+itemId+'" style="margin-top:4px">修改存放位置</button>'
    : '';
  const checkboxHtml = '<label class="card-checkbox"><input type="checkbox" data-compare="'+itemId+'" '+(isSelected?'checked':'')+'><span>加入对比</span></label>';
  return '<article class="card '+(isSelected?'card-selected':'')+'"><h3>'+(item.code || item.id)+'</h3><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="pill">'+item.status+'</span>'+batchBadge+storageBadge+taskCountBadge+'</div>'+checkboxHtml+main+(batch ? '<div class="meta">批次来源：'+batch.smokeSource+'，入库 '+batch.receiveDate+'</div>' : '')+taskHtml+'<label>状态</label><select data-status="'+itemId+'">'+stages.map(s => '<option '+(s===item.status?'selected':'')+'>'+s+'</option>').join('')+'</select><button class="secondary" data-note="'+itemId+'">追加备注</button>'+storageEditBtn+taskHistory+'<div class="logs meta">'+(logs || '暂无记录')+'</div></article>';
}

function getAssignees() {
  const set = new Set();
  for (const t of tasks) { if (t.assignee) set.add(t.assignee); }
  return Array.from(set).sort();
}

function taskStatusClass(status) {
  switch(status) {
    case '待办': return 'pending';
    case '进行中': return 'ongoing';
    case '已完成': return 'done';
    case '已取消': return 'cancelled';
    default: return '';
  }
}

function taskCardHtml(task) {
  const today = new Date().toISOString().slice(0,10);
  const isOverdue = task.scheduledDate < today && task.status !== '已完成' && task.status !== '已取消';
  const statusCls = taskStatusClass(task.status);
  const overdueCls = isOverdue ? ' overdue' : '';
  return '<div class="task-card '+statusCls+overdueCls+'">' +
    '<div class="task-header">' +
      '<div class="task-title">' +
        '<strong>'+(task.itemCode || task.itemId)+'</strong>' +
        '<span class="pill '+statusCls+'">'+task.status+'</span>' +
        (isOverdue ? '<span class="pill warn">逾期</span>' : '') +
      '</div>' +
      '<div class="task-meta">' +
        '<span>📅 '+task.scheduledDate+'</span>' +
        '<span>👤 '+(task.assignee || '未指定')+'</span>' +
      '</div>' +
    '</div>' +
    (task.itemSmokeSource ? '<div class="task-sub">'+task.itemSmokeSource+' · 当前状态：'+(task.itemStatus || '-')+'</div>' : '') +
    (task.note ? '<div class="task-note">'+task.note+'</div>' : '') +
    '<div class="task-actions">' +
      (task.status !== '已完成' && task.status !== '已取消'
        ? '<button class="secondary" data-task-complete="'+task.id+'">完成任务</button>' +
          '<button class="secondary gold" data-task-reschedule="'+task.id+'">改期</button>'
        : '') +
      (task.status === '待办' ? '<button class="secondary" data-task-start="'+task.id+'">开始</button>' : '') +
      '<button class="secondary" style="background:var(--warn)" data-task-delete="'+task.id+'">删除</button>' +
    '</div>' +
  '</div>';
}

function renderTasks() {
  if (tasks.length === 0) {
    taskList.style.display = 'none';
    taskEmpty.style.display = '';
    return;
  }
  taskList.style.display = '';
  taskEmpty.style.display = 'none';

  const status = taskStatusFilter.value;
  const assignee = taskAssigneeFilter.value;
  const dateFrom = taskDateFrom.value;
  const dateTo = taskDateTo.value;

  const visible = tasks.filter(t => {
    if (status && t.status !== status) return false;
    if (assignee && t.assignee !== assignee) return false;
    if (dateFrom && t.scheduledDate < dateFrom) return false;
    if (dateTo && t.scheduledDate > dateTo) return false;
    return true;
  });

  taskList.innerHTML = visible.map(t => taskCardHtml(t)).join('');
  bindTaskEvents();
}

function renderTaskOverview() {
  if (!todayTasksData) return;
  todayCountEl.textContent = todayTasksData.counts.today;
  overdueCountEl.textContent = todayTasksData.counts.overdue;
  completedCountEl.textContent = todayTasksData.counts.completed;
}

function renderHomeTodoAlert() {
  if (!todayTasksData || (todayTasksData.counts.today === 0 && todayTasksData.counts.overdue === 0)) {
    homeTodoAlert.style.display = 'none';
    return;
  }
  homeTodoAlert.style.display = '';
  let html = '<div class="home-todo-title">📋 今日待办提醒</div>';
  if (todayTasksData.counts.today > 0) {
    html += '<div class="home-todo-item">今日待办：<strong>'+todayTasksData.counts.today+'</strong> 个任务</div>';
  }
  if (todayTasksData.counts.overdue > 0) {
    html += '<div class="home-todo-item warn">逾期任务：<strong>'+todayTasksData.counts.overdue+'</strong> 个任务</div>';
  }
  html += '<button class="secondary" id="goToTasks">查看全部任务 →</button>';
  homeTodoAlert.innerHTML = html;
  const goBtn = document.querySelector('#goToTasks');
  if (goBtn) goBtn.onclick = () => switchTab('tasks');
}

function bindTaskEvents() {
  document.querySelectorAll('[data-task-complete]').forEach(btn => btn.onclick = async () => {
    const id = btn.dataset.taskComplete;
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const goToTest = confirm('任务完成！\n\n点击「确定」跳转到试磨记录页面录入数据。\n点击「取消」稍后补录试磨数据。');
    await api('/api/tasks/'+id+'/complete', { method:'POST', body: JSON.stringify({}) });
    if (goToTest) {
      itemSelect.value = task.itemId;
      const defaultTpl = templates.find(t => t.isDefault);
      if (defaultTpl) {
        templateSelect.value = defaultTpl.id;
        applyTemplate(defaultTpl.id);
      }
      switchTab('items');
      setTimeout(() => {
        const actionFormEl = document.querySelector('#actionForm');
        if (actionFormEl) actionFormEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return;
    }
    await load();
  });

  document.querySelectorAll('[data-task-reschedule]').forEach(btn => btn.onclick = async () => {
    const id = btn.dataset.taskReschedule;
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const newDate = prompt('输入新的计划日期', task.scheduledDate);
    if (!newDate) return;
    await api('/api/tasks/'+id, { method:'PATCH', body: JSON.stringify({ scheduledDate: newDate }) });
    await load();
  });

  document.querySelectorAll('[data-task-start]').forEach(btn => btn.onclick = async () => {
    const id = btn.dataset.taskStart;
    await api('/api/tasks/'+id, { method:'PATCH', body: JSON.stringify({ status: '进行中' }) });
    await load();
  });

  document.querySelectorAll('[data-task-delete]').forEach(btn => btn.onclick = async () => {
    const id = btn.dataset.taskDelete;
    if (!confirm('确定删除此任务？')) return;
    await api('/api/tasks/'+id, { method:'DELETE' });
    await load();
  });
}

async function load() {
  [items, batches, templates, storageKanban, tasks, todayTasksData] = await Promise.all([
    api('/api/items'),
    api('/api/batches'),
    api('/api/templates'),
    api('/api/storage'),
    api('/api/tasks'),
    api('/api/tasks/today')
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
taskForm.onsubmit = async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(taskForm).entries());
  try {
    await api('/api/tasks', { method:'POST', body: JSON.stringify(data) });
    taskForm.reset();
    const today = new Date().toISOString().slice(0,10);
    document.querySelector('#taskDate').value = today;
    await load();
  } catch(err) {
      alert('创建失败：' + err.message);
    }
};
taskStatusFilter.onchange = renderTasks;
taskAssigneeFilter.onchange = renderTasks;
taskDateFrom.onchange = renderTasks;
taskDateTo.onchange = renderTasks;
taskFilterReset.onclick = () => {
  taskStatusFilter.value = '';
  taskAssigneeFilter.value = '';
  taskDateFrom.value = '';
  taskDateTo.value = '';
  renderTasks();
};
document.querySelectorAll('.tab').forEach(tab => tab.onclick = () => switchTab(tab.dataset.tab));
statusFilter.onchange = render;
batchFilter.onchange = render;
document.querySelector('#search').oninput = render;
storageStatusFilter.onchange = renderStorageDetail;
storageSearch.oninput = renderStorageDetail;
backToKanban.onclick = showKanbanView;
document.querySelector('#reload').onclick = load;

const compareBtn = document.querySelector('#compareBtn');
if (compareBtn) {
  compareBtn.onclick = () => {
    const ids = Array.from(selectedCompareIds);
    if (ids.length < 2) {
      alert('请至少选择2块墨锭进行对比');
      return;
    }
    if (ids.length > 4) {
      alert('最多只能选择4块墨锭进行对比');
      return;
    }
    window.location.href = '/compare?ids=' + encodeURIComponent(ids.join(','));
  };
}
const clearCompareBtn = document.querySelector('#clearCompareBtn');
if (clearCompareBtn) {
  clearCompareBtn.onclick = () => {
    selectedCompareIds.clear();
    render();
  };
}

drawerClose.onclick = closeBatchDrawer;
batchDetailDrawer.addEventListener('click', (e) => {
  if (e.target === batchDetailDrawer) {
    closeBatchDrawer();
  }
});
drawerStatusFilter.onchange = renderDrawerItems;
drawerSearch.oninput = renderDrawerItems;
drawerCreateTasksBtn.onclick = () => {
  if (!currentBatchDetail) return;
  createBatchTasksFromDrawer('待试磨');
};
drawerRetestBtn.onclick = () => {
  if (!currentBatchDetail) return;
  if (currentBatchDetail.suggestRetestCount === 0) {
    alert('当前批次没有建议复测的墨锭。');
    return;
  }
  const itemIds = currentBatchDetail.items
    .filter(i => i.latestScore !== null && i.latestScore < 70)
    .map(i => i.id);
  createBatchTasksFromDrawer(null, itemIds);
};

renderForms();
load();
