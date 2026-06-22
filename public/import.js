const FIELD_LABELS = {
  code: "墨锭编号",
  smokeSource: "烟料来源",
  glueRatio: "胶料比例",
  ageYears: "存放年限",
  storage: "存放位置",
  batchId: "批次编号",
  status: "状态"
};

const MAPPABLE_FIELDS = [
  { key: "code", label: "墨锭编号", required: true },
  { key: "smokeSource", label: "烟料来源", required: true },
  { key: "glueRatio", label: "胶料比例", required: false },
  { key: "ageYears", label: "存放年限", required: false },
  { key: "storage", label: "存放位置", required: false },
  { key: "batchId", label: "批次编号", required: false },
  { key: "status", label: "状态", required: false }
];

const csvFileInput = document.querySelector('#csvFile');
const csvTextInput = document.querySelector('#csvText');
const importedByInput = document.querySelector('#importedBy');
const importNoteInput = document.querySelector('#importNote');
const previewBtn = document.querySelector('#previewBtn');
const clearBtn = document.querySelector('#clearBtn');
const backBtn = document.querySelector('#backBtn');
const viewBatchesBtn = document.querySelector('#viewBatchesBtn');
const backToImportBtn = document.querySelector('#backToImportBtn');

const importSection = document.querySelector('#importSection');
const batchesSection = document.querySelector('#batchesSection');
const previewSection = document.querySelector('#previewSection');
const resultSection = document.querySelector('#resultSection');

const previewSummary = document.querySelector('#previewSummary');
const fieldMappingList = document.querySelector('#fieldMappingList');
const unrecognizedFields = document.querySelector('#unrecognizedFields');
const unrecognizedList = document.querySelector('#unrecognizedList');
const missingRequiredFields = document.querySelector('#missingRequiredFields');
const missingRequiredList = document.querySelector('#missingRequiredList');
const errorsSection = document.querySelector('#errorsSection');
const errorCount = document.querySelector('#errorCount');
const errorList = document.querySelector('#errorList');
const importableSection = document.querySelector('#importableSection');
const importableCount = document.querySelector('#importableCount');
const importableTable = document.querySelector('#importableTable');
const moreRowsHint = document.querySelector('#moreRowsHint');
const confirmImportBtn = document.querySelector('#confirmImportBtn');
const cancelPreviewBtn = document.querySelector('#cancelPreviewBtn');

const resultMessage = document.querySelector('#resultMessage');
const importedItemsList = document.querySelector('#importedItemsList');
const continueImportBtn = document.querySelector('#continueImportBtn');
const backToListBtn = document.querySelector('#backToListBtn');

const batchesList = document.querySelector('#batchesList');
const batchesEmpty = document.querySelector('#batchesEmpty');

let currentAnalysis = null;
let currentCSVText = "";
let currentFieldMapping = {};

async function api(path, options) {
  const res = await fetch(path, options && options.body ? { ...options, headers:{ 'Content-Type':'application/json' } } : options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || '请求失败');
  return data;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.getFullYear() + '-' +
      String(d.getMonth()+1).padStart(2,'0') + '-' +
      String(d.getDate()).padStart(2,'0') + ' ' +
      String(d.getHours()).padStart(2,'0') + ':' +
      String(d.getMinutes()).padStart(2,'0');
  } catch(e) { return isoStr; }
}

csvFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    csvTextInput.value = text;
  } catch (err) {
    alert('读取文件失败：' + err.message);
  }
});

previewBtn.addEventListener('click', async () => {
  const csvText = csvTextInput.value.trim();
  if (!csvText) {
    alert('请上传CSV文件或粘贴CSV内容');
    return;
  }
  currentCSVText = csvText;
  currentFieldMapping = {};
  previewBtn.disabled = true;
  previewBtn.textContent = '分析中...';

  try {
    const analysis = await api('/api/import/preview', {
      method: 'POST',
      body: JSON.stringify({ csvText })
    });
    currentAnalysis = analysis;
    renderPreview(analysis);
  } catch (err) {
    alert('预览分析失败：' + err.message);
  } finally {
    previewBtn.disabled = false;
    previewBtn.textContent = '预览并校验';
  }
});

clearBtn.addEventListener('click', () => {
  csvFileInput.value = '';
  csvTextInput.value = '';
  importedByInput.value = '';
  importNoteInput.value = '';
  previewSection.style.display = 'none';
  resultSection.style.display = 'none';
  currentAnalysis = null;
  currentCSVText = '';
  currentFieldMapping = {};
});

backBtn.addEventListener('click', () => {
  window.location.href = '/';
});

backToListBtn.addEventListener('click', () => {
  window.location.href = '/';
});

continueImportBtn.addEventListener('click', () => {
  clearBtn.click();
  importSection.style.display = '';
  batchesSection.style.display = 'none';
});

cancelPreviewBtn.addEventListener('click', () => {
  previewSection.style.display = 'none';
  currentAnalysis = null;
  currentFieldMapping = {};
});

function collectManualMapping() {
  const mapping = {};
  document.querySelectorAll('.fm-remap-select').forEach(sel => {
    const val = sel.value;
    if (val) {
      mapping[sel.dataset.colIndex] = val;
    }
  });
  return mapping;
}

function revalidateWithMapping() {
  const mapping = collectManualMapping();
  currentFieldMapping = mapping;
  doPreview(mapping);
}
window.revalidateWithMapping = revalidateWithMapping;

async function doPreview(fieldMapping) {
  if (!currentCSVText) return;
  previewBtn.disabled = true;
  previewBtn.textContent = '校验中...';

  try {
    const analysis = await api('/api/import/preview', {
      method: 'POST',
      body: JSON.stringify({ csvText: currentCSVText, fieldMapping })
    });
    currentAnalysis = analysis;
    renderPreview(analysis);
  } catch (err) {
    alert('重新校验失败：' + err.message);
  } finally {
    previewBtn.disabled = false;
    previewBtn.textContent = '预览并校验';
  }
}

confirmImportBtn.addEventListener('click', async () => {
  if (!currentAnalysis || !currentCSVText) return;
  if (currentAnalysis.importableCount === 0) {
    alert('没有可导入的有效数据行');
    return;
  }

  const createdBy = importedByInput.value.trim() || '未指定用户';
  const note = importNoteInput.value.trim();

  if (!confirm(`确定要导入 ${currentAnalysis.importableCount} 条墨锭记录吗？`)) {
    return;
  }

  confirmImportBtn.disabled = true;
  confirmImportBtn.textContent = '导入中...';

  try {
    const result = await api('/api/import/confirm', {
      method: 'POST',
      body: JSON.stringify({
        csvText: currentCSVText,
        createdBy,
        note,
        fieldMapping: currentFieldMapping
      })
    });
    renderResult(result);
  } catch (err) {
    alert('导入失败：' + err.message);
  } finally {
    confirmImportBtn.disabled = false;
    confirmImportBtn.textContent = '确认导入';
  }
});

viewBatchesBtn.addEventListener('click', async () => {
  importSection.style.display = 'none';
  batchesSection.style.display = '';
  await loadBatches();
});

backToImportBtn.addEventListener('click', () => {
  importSection.style.display = '';
  batchesSection.style.display = 'none';
});

function renderPreview(analysis) {
  previewSummary.innerHTML = `
    <div class="preview-stat"><span class="meta">总行数</span><strong>${analysis.totalRows}</strong></div>
    <div class="preview-stat ${analysis.importableCount > 0 ? 'ok' : ''}"><span class="meta">可导入</span><strong>${analysis.importableCount}</strong></div>
    <div class="preview-stat ${analysis.errorCount > 0 ? 'warn' : ''}"><span class="meta">错误数</span><strong>${analysis.errorCount}</strong></div>
  `;

  fieldMappingList.innerHTML = analysis.fieldMapping.map(fm => `
    <div class="field-mapping-item">
      <span class="fm-header">${escapeHtml(fm.header)}</span>
      <span class="fm-arrow">→</span>
      <select class="fm-remap-select" data-col-index="${fm.columnIndex}" data-original-field="${fm.field}">
        <option value="${fm.field}" selected>${FIELD_LABELS[fm.field] || fm.field}${fm.required ? ' (必填)' : ''}</option>
        ${MAPPABLE_FIELDS.filter(f => f.key !== fm.field).map(f =>
          `<option value="${f.key}">${f.label}${f.required ? ' (必填)' : ''}</option>`
        ).join('')}
        <option value="">-- 不映射 --</option>
      </select>
    </div>
  `).join('');

  if (analysis.unrecognizedFields && analysis.unrecognizedFields.length > 0) {
    unrecognizedFields.style.display = '';
    const remapOptions = MAPPABLE_FIELDS;
    unrecognizedList.innerHTML = analysis.unrecognizedFields.map(uf => {
      const existingVal = currentFieldMapping[String(uf.index)] || '';
      return `
        <div class="fm-remap-row">
          <span class="fm-header">${escapeHtml(uf.header)}</span>
          <span class="fm-arrow">→</span>
          <select class="fm-remap-select" data-col-index="${uf.index}">
            <option value="">-- 请选择映射字段 --</option>
            ${remapOptions.map(f =>
              `<option value="${f.key}"${existingVal === f.key ? ' selected' : ''}>${f.label}${f.required ? ' (必填)' : ''}</option>`
            ).join('')}
          </select>
        </div>
      `;
    }).join('');
  } else {
    unrecognizedFields.style.display = 'none';
    unrecognizedList.innerHTML = '';
  }

  const revalidateBar = document.querySelector('#revalidateBar');
  if (revalidateBar) {
    const hasUnrecognized = analysis.unrecognizedFields && analysis.unrecognizedFields.length > 0;
    const hasMissing = analysis.missingRequiredFields && analysis.missingRequiredFields.length > 0;
    revalidateBar.style.display = (hasUnrecognized || hasMissing) ? '' : 'none';
  }

  if (analysis.missingRequiredFields && analysis.missingRequiredFields.length > 0) {
    missingRequiredFields.style.display = '';
    missingRequiredList.textContent = analysis.missingRequiredFields.map(f => FIELD_LABELS[f] || f).join('、');
  } else {
    missingRequiredFields.style.display = 'none';
  }

  if (analysis.errors && analysis.errors.length > 0) {
    errorsSection.style.display = '';
    errorCount.textContent = analysis.errors.length;
    errorList.innerHTML = analysis.errors.slice(0, 50).map(err => `
      <div class="error-item">
        <span class="error-row">第${err.row}行</span>
        <span class="error-msg">${escapeHtml(err.message)}</span>
      </div>
    `).join('');
    if (analysis.errors.length > 50) {
      errorList.innerHTML += `<div class="meta" style="margin-top:8px">... 还有 ${analysis.errors.length - 50} 条错误未显示</div>`;
    }
  } else {
    errorsSection.style.display = 'none';
  }

  if (analysis.importableCount > 0) {
    importableSection.style.display = '';
    importableCount.textContent = analysis.importableCount;

    const displayFields = analysis.fieldMapping.map(fm => fm.field);
    const thead = importableTable.querySelector('thead');
    const tbody = importableTable.querySelector('tbody');

    thead.innerHTML = '<tr><th style="width:60px">行号</th>' +
      displayFields.map(f => `<th>${FIELD_LABELS[f] || f}</th>`).join('') + '</tr>';

    const displayRows = analysis.importableRows.slice(0, 20);
    tbody.innerHTML = displayRows.map(row => `
      <tr>
        <td class="meta">${row.rowIndex}</td>
        ${displayFields.map(f => `<td>${escapeHtml(row.data[f] ?? '-')}</td>`).join('')}
      </tr>
    `).join('');

    if (analysis.importableRows.length > 20) {
      moreRowsHint.style.display = '';
      moreRowsHint.textContent = `... 还有 ${analysis.importableRows.length - 20} 行数据未显示`;
    } else {
      moreRowsHint.style.display = 'none';
    }

    confirmImportBtn.disabled = false;
  } else {
    importableSection.style.display = 'none';
    confirmImportBtn.disabled = true;
  }

  previewSection.style.display = '';
  previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderResult(result) {
  previewSection.style.display = 'none';
  resultSection.style.display = '';

  const batch = result.importBatch;
  resultMessage.innerHTML = `
    <div style="margin-bottom:10px">
      <strong>导入批次：</strong>${escapeHtml(batch.code)}
    </div>
    <div style="margin-bottom:10px">
      <strong>导入时间：</strong>${formatDate(batch.importedAt)}
    </div>
    <div style="margin-bottom:10px">
      <strong>导入人：</strong>${escapeHtml(batch.importedBy)}
    </div>
    <div style="margin-bottom:10px">
      <strong>导入数量：</strong><span class="done">${result.importedCount} 条</span>
    </div>
    ${batch.note ? `<div style="margin-bottom:10px"><strong>备注：</strong>${escapeHtml(batch.note)}</div>` : ''}
  `;

  if (result.importedItems && result.importedItems.length > 0) {
    importedItemsList.innerHTML = `
      <h3 style="margin-bottom:10px;font-size:14px">导入的墨锭：</h3>
      <div class="imported-items-grid">
        ${result.importedItems.slice(0, 50).map(item => `
          <div class="imported-item">
            <strong>${escapeHtml(item.code)}</strong>
            <span class="meta">${escapeHtml(item.smokeSource)}</span>
          </div>
        `).join('')}
      </div>
      ${result.importedItems.length > 50 ? `<div class="meta" style="margin-top:8px">... 还有 ${result.importedItems.length - 50} 条未显示</div>` : ''}
    `;
  }

  resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadBatches() {
  try {
    const batches = await api('/api/import/batches');
    if (batches.length === 0) {
      batchesEmpty.style.display = '';
      batchesList.innerHTML = '';
      return;
    }

    batchesEmpty.style.display = 'none';
    batchesList.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>批次号</th>
            <th>导入时间</th>
            <th>导入人</th>
            <th>总行数</th>
            <th>成功导入</th>
            <th>错误数</th>
            <th>备注</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${batches.map(b => `
            <tr>
              <td class="batch-code">${escapeHtml(b.code)}</td>
              <td>${formatDate(b.importedAt)}</td>
              <td>${escapeHtml(b.importedBy)}</td>
              <td>${b.totalRows}</td>
              <td class="done">${b.itemCount}</td>
              <td class="${b.errorCount > 0 ? 'warn' : ''}">${b.errorCount}</td>
              <td class="meta">${escapeHtml(b.note || '-')}</td>
              <td><button class="secondary" data-batch="${b.id}">查看详情</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    batchesList.querySelectorAll('[data-batch]').forEach(btn => {
      btn.onclick = () => showBatchDetail(btn.dataset.batch);
    });
  } catch (err) {
    batchesEmpty.style.display = '';
    batchesEmpty.textContent = '加载失败：' + err.message;
  }
}

async function showBatchDetail(batchId) {
  try {
    const batch = await api('/api/import/batches/' + encodeURIComponent(batchId));
    const detailHtml = `
      <div class="panel" style="margin-top:14px">
        <div class="section-title">
          <h3>批次详情 - ${escapeHtml(batch.code)}</h3>
          <button class="secondary" id="closeBatchDetail">← 返回列表</button>
        </div>
        <div style="margin-bottom:12px">
          <div><strong>导入时间：</strong>${formatDate(batch.importedAt)}</div>
          <div><strong>导入人：</strong>${escapeHtml(batch.importedBy)}</div>
          <div><strong>总行数：</strong>${batch.totalRows}</div>
          <div><strong>成功导入：</strong>${batch.itemCount}</div>
          <div><strong>错误数：</strong>${batch.errorCount}</div>
          ${batch.note ? `<div><strong>备注：</strong>${escapeHtml(batch.note)}</div>` : ''}
        </div>
        ${batch.errors && batch.errors.length > 0 ? `
          <h4 style="margin-bottom:8px;font-size:14px;color:var(--warn)">错误记录</h4>
          <div class="error-list">
            ${batch.errors.slice(0, 30).map(err => `
              <div class="error-item">
                <span class="error-row">第${err.row}行</span>
                <span class="error-msg">${escapeHtml(err.message)}</span>
              </div>
            `).join('')}
            ${batch.errors.length > 30 ? `<div class="meta">... 还有 ${batch.errors.length - 30} 条错误</div>` : ''}
          </div>
        ` : ''}
        ${batch.items && batch.items.length > 0 ? `
          <h4 style="margin:14px 0 8px;font-size:14px">导入的墨锭 (${batch.items.length})</h4>
          <div class="imported-items-grid">
            ${batch.items.slice(0, 40).map(item => `
              <div class="imported-item">
                <strong>${escapeHtml(item.code)}</strong>
                <span class="meta">${escapeHtml(item.smokeSource || '')}</span>
                <span class="pill ${item.status === '已试磨' ? 'done' : item.status === '重点观察' ? 'warn' : 'pending'}">${item.status}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;

    const existingDetail = document.querySelector('#batchDetail');
    if (existingDetail) existingDetail.remove();

    const detailDiv = document.createElement('div');
    detailDiv.id = 'batchDetail';
    detailDiv.innerHTML = detailHtml;
    batchesList.appendChild(detailDiv);

    detailDiv.querySelector('#closeBatchDetail').onclick = () => {
      detailDiv.remove();
    };
  } catch (err) {
    alert('加载批次详情失败：' + err.message);
  }
}
