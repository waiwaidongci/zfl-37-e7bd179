export function page() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>墨锭试磨室</title>
  <link rel="stylesheet" href="/public/styles.css">
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
  <script src="/public/app.js"></script>
</body>
</html>`;
}
