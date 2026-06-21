const reportLoading = document.querySelector('#reportLoading');
const reportError = document.querySelector('#reportError');
const reportContent = document.querySelector('#reportContent');
const reportMeta = document.querySelector('#reportMeta');
const backBtn = document.querySelector('#backBtn');
const refreshReport = document.querySelector('#refreshReport');

async function api(path, options) {
  const res = await fetch(path, options && options.body ? { ...options, headers: { 'Content-Type': 'application/json' } } : options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || '请求失败');
  return data;
}

function getIdsFromUrl() {
  const url = new URL(window.location.href);
  const idsParam = url.searchParams.get('ids');
  if (!idsParam) return [];
  return idsParam.split(',').map(s => s.trim()).filter(Boolean);
}

function validateIds(ids) {
  if (ids.length < 2) {
    return { valid: false, message: '请至少选择2块墨锭进行对比（从墨锭列表勾选后进入）' };
  }
  if (ids.length > 4) {
    return { valid: false, message: '最多只能选择4块墨锭进行对比' };
  }
  return { valid: true };
}

function emptyCell() {
  return '<td class="compare-empty">暂无数据</td>';
}

function scoreClass(score) {
  if (score === null || score === undefined) return '';
  if (score >= 85) return 'score-high';
  if (score >= 70) return 'score-mid';
  return 'score-low';
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
  try {
    return new Date(isoStr).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoStr;
  }
}

function renderReport(report) {
  if (!report || !report.items || report.items.length === 0) {
    showError('未找到有效的墨锭数据');
    return;
  }

  const count = report.items.length;
  const colClass = count <= 2 ? 'col-2' : count === 3 ? 'col-3' : 'col-4';
  reportMeta.textContent = `共对比 ${count} 块墨锭 · 生成时间 ${formatDate(report.generatedAt)}`;

  const headerCells = report.items.map(item => {
    const badgeCls = item.hasTests ? 'pill done' : 'pill warn';
    const badgeText = item.hasTests ? `已试磨 ${item.testCount} 次` : '暂无试磨记录';
    return `<th class="${colClass}">
      <div class="compare-item-header">
        <strong>${item.code}</strong>
        <span class="${badgeCls}">${badgeText}</span>
      </div>
      <div class="meta" style="margin-top:4px">${item.smokeSource || '未指定烟料'} · ${item.status || '未知状态'}</div>
    </th>`;
  }).join('');

  function basicRow(label, key, formatter) {
    const cells = report.items.map(item => {
      const val = item[key];
      if (val === null || val === undefined || val === '') return emptyCell();
      return `<td>${formatter ? formatter(val) : val}</td>`;
    }).join('');
    return `<tr><th class="compare-label">${label}</th>${cells}</tr>`;
  }

  function testRow(label, key, formatter) {
    const cells = report.items.map(item => {
      if (!item.hasTests) return emptyCell();
      const val = item[key];
      if (val === null || val === undefined || val === '') return emptyCell();
      return `<td>${formatter ? formatter(val) : val}</td>`;
    }).join('');
    return `<tr><th class="compare-label">${label}</th>${cells}</tr>`;
  }

  const basicRows = [
    basicRow('烟料来源', 'smokeSource'),
    basicRow('胶料比例', 'glueRatio'),
    basicRow('存放年限', 'ageYears', v => v + ' 年')
  ].join('');

  const scoreRows = [
    testRow('最新评分', 'latestScore', v => `<span class="score ${scoreClass(v)}">${v}</span>`),
    testRow('平均评分', 'avgScore', v => `<span class="score ${scoreClass(v)}">${v}</span>`),
    testRow('历次评分', 'allScores', v => {
      if (!v || v.length === 0) return emptyCell();
      return v.map(s => `<span class="score-pill ${scoreClass(s)}">${s}</span>`).join(' ');
    })
  ].join('');

  const testRows = [
    testRow('出墨速度', 'latestSpeed'),
    testRow('墨色层次', 'latestColorLayer'),
    testRow('沉淀情况', 'latestSediment')
  ].join('');

  const historyRows = report.items.map(item => {
    if (!item.hasTests) {
      return `<td>
        <div class="compare-empty-state">
          <div class="empty-icon">📋</div>
          <div>该墨锭暂无试磨记录</div>
          <div class="meta">完成试磨后将在此展示历史数据</div>
        </div>
      </td>`;
    }
    const historyHtml = item.testHistory.map(t => {
      const paperWater = [t.paper, t.water].filter(Boolean).join(' · ');
      return `<div class="test-history-item">
        <div class="test-history-header">
          <span class="score ${scoreClass(t.score)}">${t.score}</span>
          <span class="meta">${formatDate(t.at)}</span>
        </div>
        ${paperWater ? `<div class="meta">${paperWater}</div>` : ''}
        <div class="test-history-details">
          ${t.speed ? `<span>出墨：${t.speed}</span>` : ''}
          ${t.colorLayer ? `<span>墨色：${t.colorLayer}</span>` : ''}
          ${t.sediment ? `<span>沉淀：${t.sediment}</span>` : ''}
        </div>
      </div>`;
    }).join('');
    return `<td><div class="test-history-list">${historyHtml}</div></td>`;
  }).join('');

  reportContent.innerHTML = `
    <div class="compare-section">
      <h2>基础信息对比</h2>
      <div class="compare-table-wrap">
        <table class="compare-table">
          <thead><tr><th class="compare-label-corner">对比项</th>${headerCells}</tr></thead>
          <tbody>${basicRows}</tbody>
        </table>
      </div>
    </div>

    <div class="compare-section">
      <h2>评分对比</h2>
      <div class="compare-table-wrap">
        <table class="compare-table">
          <thead><tr><th class="compare-label-corner">对比项</th>${headerCells}</tr></thead>
          <tbody>${scoreRows}</tbody>
        </table>
      </div>
    </div>

    <div class="compare-section">
      <h2>试磨表现对比</h2>
      <div class="compare-table-wrap">
        <table class="compare-table">
          <thead><tr><th class="compare-label-corner">对比项</th>${headerCells}</tr></thead>
          <tbody>${testRows}</tbody>
        </table>
      </div>
    </div>

    <div class="compare-section">
      <h2>历次试磨记录</h2>
      <div class="compare-table-wrap">
        <table class="compare-table compare-history-table">
          <thead><tr><th class="compare-label-corner">试磨历史</th>${headerCells}</tr></thead>
          <tbody><tr><th class="compare-label">全部记录</th>${historyRows}</tr></tbody>
        </table>
      </div>
    </div>
  `;
}

function showLoading() {
  reportLoading.style.display = '';
  reportError.style.display = 'none';
  reportContent.style.display = 'none';
}

function showError(message) {
  reportLoading.style.display = 'none';
  reportContent.style.display = 'none';
  reportError.style.display = '';
  reportError.innerHTML = `
    <div class="compare-error-icon">⚠️</div>
    <div class="compare-error-title">加载失败</div>
    <div class="compare-error-msg">${message}</div>
    <button class="secondary" onclick="window.location.href='/'">返回墨锭列表</button>
  `;
}

async function loadReport() {
  showLoading();
  const ids = getIdsFromUrl();
  const validation = validateIds(ids);
  if (!validation.valid) {
    reportMeta.textContent = '';
    showError(validation.message);
    return;
  }
  try {
    const report = await api('/api/comparison?ids=' + encodeURIComponent(ids.join(',')));
    reportLoading.style.display = 'none';
    reportError.style.display = 'none';
    reportContent.style.display = '';
    renderReport(report);
  } catch (err) {
    reportMeta.textContent = '';
    showError(err.message || '加载报告时出错');
  }
}

backBtn.onclick = () => { window.location.href = '/'; };
refreshReport.onclick = loadReport;

loadReport();
