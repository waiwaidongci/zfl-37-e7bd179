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
        <div class="tab" data-tab="tasks">试磨任务排程</div>
        <div class="tab" data-tab="batches">批次管理</div>
        <div class="tab" data-tab="storage">存放位置看板</div>
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
      <div id="tab-storage" style="display:none">
        <div class="panel">
          <h2>看板说明</h2>
          <div class="meta">按存放位置（恒湿柜、试样盒等）分组展示墨锭。<br>点击分组卡片查看该位置的全部墨锭，可在详情中修改存放位置。</div>
        </div>
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
      <div id="tab-tasks" style="display:none">
        <form id="taskForm">
          <h2>创建试磨任务</h2>
          <label>选择墨锭</label>
          <select name="itemId" id="taskItemSelect"></select>
          <label>计划日期</label>
          <input type="date" name="scheduledDate" id="taskDate" required>
          <label>负责人</label>
          <input name="assignee" id="taskAssignee" placeholder="请输入负责人姓名" required>
          <label>任务备注</label>
          <textarea name="note" id="taskNote" placeholder="可选，填写试磨要求或注意事项"></textarea>
          <button>创建任务</button>
        </form>
        <div class="panel" style="margin-top:14px">
          <h2>今日概览</h2>
          <div class="task-overview" id="taskOverview">
            <div class="overview-item"><span class="overview-label">今日待办</span><strong id="todayCount">0</strong></div>
            <div class="overview-item"><span class="overview-label">逾期任务</span><strong id="overdueCount" class="warn">0</strong></div>
            <div class="overview-item"><span class="overview-label">今日已完成</span><strong id="completedCount" class="done">0</strong></div>
          </div>
        </div>
      </div>
    </section>
    <section>
      <div id="view-items">
        <div class="home-todo-alert" id="homeTodoAlert" style="display:none"></div>
        <div class="stats" id="stats"></div>
        <div class="toolbar">
          <select id="statusFilter"><option value="">全部状态</option></select>
          <select id="batchFilter"><option value="">全部批次</option></select>
          <input id="search" placeholder="搜索编号或关键词">
          <button class="secondary gold" id="compareBtn" disabled>生成对比报告（0）</button>
          <button class="secondary" id="clearCompareBtn" style="display:none">清除选择</button>
        </div>
        <div class="panel">
          <h2>选择墨锭后录入试磨记录，系统会保留多次试磨结果并更新评分状态。勾选2-4块墨锭可生成横向对比报告。</h2>
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
      <div id="view-storage" style="display:none">
        <div class="stats" id="storageStats"></div>
        <div id="storageKanbanView">
          <div class="panel">
            <div class="section-title">
              <h2>存放位置分组 — 点击卡片查看该位置的墨锭列表</h2>
            </div>
            <div class="kanban-grid" id="kanbanCards"></div>
            <div id="kanbanEmpty" class="empty" style="display:none">暂无墨锭数据，请在「墨锭管理」中新增墨锭并设置存放位置。</div>
          </div>
        </div>
        <div id="storageDetailView" style="display:none">
          <div class="panel">
            <div class="section-title">
              <h2 id="storageDetailTitle">存放位置详情</h2>
              <button class="secondary" id="backToKanban">← 返回看板</button>
            </div>
            <div class="toolbar">
              <select id="storageStatusFilter"><option value="">全部状态</option></select>
              <input id="storageSearch" placeholder="搜索编号或关键词">
            </div>
            <div class="grid" id="storageCards"></div>
            <div id="storageDetailEmpty" class="empty" style="display:none">该位置暂无墨锭。</div>
          </div>
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
      <div id="view-tasks" style="display:none">
        <div class="stats" id="taskStats"></div>
        <div class="task-alert" id="taskAlert" style="display:none"></div>
        <div class="panel">
          <div class="section-title">
            <h2>试磨任务列表 — 按日期排序，管理待办、改期、完成</h2>
          </div>
          <div class="toolbar">
            <select id="taskStatusFilter"><option value="">全部状态</option></select>
            <select id="taskAssigneeFilter"><option value="">全部负责人</option></select>
            <input type="date" id="taskDateFrom" placeholder="开始日期">
            <input type="date" id="taskDateTo" placeholder="结束日期">
            <button class="secondary" id="taskFilterReset">重置筛选</button>
          </div>
          <div id="taskList" class="task-list"></div>
          <div id="taskEmpty" class="empty" style="display:none">暂无任务数据，请在左侧创建试磨任务。</div>
        </div>
      </div>
    </section>
  </main>
  <script src="/public/app.js"></script>
</body>
</html>`;
}

export function comparePage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>试磨对比报告 - 墨锭试磨室</title>
  <link rel="stylesheet" href="/public/styles.css">
  <link rel="stylesheet" href="/public/compare.css">
</head>
<body class="compare-body">
  <header class="compare-header">
    <div>
      <h1>试磨对比报告</h1>
      <div class="meta" id="reportMeta">加载中...</div>
    </div>
    <div style="display:flex;gap:10px">
      <button class="secondary" id="backBtn">← 返回墨锭列表</button>
      <button id="refreshReport">刷新报告</button>
    </div>
  </header>
  <main class="compare-main">
    <div id="reportLoading" class="compare-loading">正在加载对比数据...</div>
    <div id="reportError" class="compare-error" style="display:none"></div>
    <div id="reportContent" style="display:none"></div>
  </main>
  <script src="/public/compare.js"></script>
</body>
</html>`;
}
