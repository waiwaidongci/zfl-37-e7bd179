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
    <div style="display:flex;gap:10px">
      <button class="secondary gold" id="importBtn">CSV批量导入</button>
      <button id="reload">刷新</button>
    </div>
  </header>
  <main>
    <section>
      <div class="tabs">
        <div class="tab active" data-tab="items">墨锭管理</div>
        <div class="tab" data-tab="tasks">试磨任务排程</div>
        <div class="tab" data-tab="batches">批次管理</div>
        <div class="tab" data-tab="storage">存放位置看板</div>
        <div class="tab" data-tab="templates">试磨方案模板</div>
        <div class="tab" data-tab="scoring">评分规则配置</div>
        <div class="tab" data-tab="lifecycle">生命周期追踪</div>
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
        <div class="import-entry" style="margin-top:14px;padding:12px;background:#f8faf6;border:1px solid #e2e6dd;border-radius:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
            <div>
              <h3 style="margin:0 0 4px;font-size:15px">批量导入墨锭档案</h3>
              <div class="meta">支持CSV文件上传或粘贴内容，预览校验后批量导入</div>
            </div>
            <button class="secondary gold" id="importBtn2">前往导入 →</button>
          </div>
        </div>
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
      <div id="tab-scoring" style="display:none">
        <form id="scoringRuleForm">
          <h2>新增评分规则</h2>
          <label>规则名称</label>
          <input name="name" id="srName" placeholder="例如：优秀（已试磨）" required>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div>
              <label>最低分（含）</label>
              <input name="minScore" id="srMinScore" type="number" min="0" max="100" required>
            </div>
            <div>
              <label>最高分（含）</label>
              <input name="maxScore" id="srMaxScore" type="number" min="0" max="100" required>
            </div>
          </div>
          <label>状态结果</label>
          <select name="resultStatus" id="srResultStatus">
            <option value="">-- 选择或自定义 --</option>
          </select>
          <div id="srResultStatusCustomWrap" style="margin-top:6px">
            <label style="display:flex;align-items:center;gap:8px;margin:0;">
              <input type="checkbox" id="srResultStatusCustomCheck">
              <span style="margin:0">自定义状态</span>
            </label>
            <input name="resultStatusCustom" id="srResultStatusCustom" type="text" placeholder="输入自定义状态，例如：建议复测" style="margin-top:6px;display:none">
          </div>
          <label>提示文案</label>
          <textarea name="hintText" id="srHintText" placeholder="例如：试磨评分优秀，可正式使用"></textarea>
          <label>优先级（数字越小越先匹配）</label>
          <input name="order" id="srOrder" type="number" min="0" value="0">
          <button>保存规则</button>
        </form>
        <div class="panel" style="margin-top:14px">
          <h3 style="margin:0 0 8px;font-size:15px">规则预览测试</h3>
          <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
            <div style="flex:1;min-width:140px">
              <label>输入测试分数</label>
              <input type="number" id="srTestScore" min="0" max="100" placeholder="0-100">
            </div>
            <button type="button" class="secondary" id="srTestBtn">测试匹配</button>
          </div>
          <div id="srTestResult" class="meta" style="margin-top:8px"></div>
        </div>
      </div>
      <div id="tab-lifecycle" style="display:none">
        <div class="panel">
          <h2>墨锭生命周期追踪</h2>
          <div class="meta">追踪墨锭从建档、入库、试磨、复测、重点观察到归档的全过程。每次状态变化都经过校验，确保流程合规。</div>
          <div style="margin-top:12px">
            <label>选择墨锭查看生命周期</label>
            <select id="lifecycleItemSelect"><option value="">-- 请选择 --</option></select>
          </div>
        </div>
        <div id="lifecycleDetail" style="display:none;margin-top:14px">
          <div class="panel">
            <div class="section-title">
              <h3 id="lifecycleItemTitle">生命周期</h3>
              <span class="pill" id="lifecycleCurrentState">--</span>
            </div>
            <div id="lifecycleStateFlow" class="lifecycle-state-flow"></div>
            <div id="lifecycleActions" class="lifecycle-actions" style="margin-top:16px"></div>
          </div>
          <div class="panel" style="margin-top:14px">
            <div class="section-title">
              <h3>生命周期时间线</h3>
            </div>
            <div id="lifecycleTimeline" class="lifecycle-timeline"></div>
          </div>
        </div>
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
        <div id="viewsBar" class="views-bar">
          <div class="views-bar-header">
            <strong>常用视图</strong>
            <div style="display:flex;gap:6px;align-items:center">
              <button class="secondary gold" id="saveViewBtn" style="padding:6px 10px;font-size:12px">💾 保存当前筛选</button>
            </div>
          </div>
          <div class="views-list" id="viewsList"></div>
        </div>
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
      <div id="view-scoring" style="display:none">
        <div class="stats" id="scoringStats"></div>
        <div class="panel">
          <div class="section-title">
            <h2>评分规则列表 — 按优先级排列，提交试磨记录时自动匹配</h2>
          </div>
          <div id="scoringCoverage" style="margin-bottom:14px;padding:10px 14px;background:#f8faf6;border:1px solid var(--line);border-radius:8px"></div>
          <table id="scoringRuleTable">
            <thead>
              <tr><th>优先级</th><th>规则名称</th><th>分数区间</th><th>状态结果</th><th>提示文案</th><th>操作</th></tr>
            </thead>
            <tbody></tbody>
          </table>
          <div id="scoringEmpty" class="empty" style="display:none">暂无评分规则，请在左侧新增规则。</div>
        </div>
      </div>
      <div id="view-lifecycle" style="display:none">
        <div class="stats" id="lifecycleStats"></div>
      </div>
    </section>
  </main>
  <div id="batchDetailDrawer" class="drawer-overlay" style="display:none">
    <div class="drawer">
      <div class="drawer-header">
        <div>
          <h2 id="drawerBatchCode">批次详情</h2>
          <div class="meta" id="drawerBatchSmoke"></div>
        </div>
        <button class="secondary" id="drawerClose">×</button>
      </div>
      <div class="drawer-body">
        <div class="drawer-stats">
          <div class="stat"><span>样品总数</span><strong id="drawerTotal">0</strong></div>
          <div class="stat"><span>未试磨</span><strong id="drawerUntested" class="warn">0</strong></div>
          <div class="stat"><span>已试磨</span><strong id="drawerTested" class="done">0</strong></div>
          <div class="stat"><span>建议复测</span><strong id="drawerRetest" class="warn">0</strong></div>
          <div class="stat"><span>最新平均分</span><strong id="drawerAvgScore">-</strong></div>
        </div>
        <div class="drawer-progress">
          <div class="meta" style="margin-bottom:6px">试磨进度</div>
          <div class="progress"><div class="progress-bar" id="drawerProgressBar" style="width:0%"></div></div>
          <div class="meta" id="drawerProgressText" style="margin-top:6px">0/0 (0%)</div>
        </div>
        <div class="drawer-actions">
          <button class="gold" id="drawerCreateTasksBtn">为未试磨创建试磨任务</button>
          <button class="secondary" id="drawerRetestBtn">为建议复测创建任务</button>
        </div>
        <div class="drawer-section-title">批次墨锭列表</div>
        <div class="drawer-toolbar">
          <select id="drawerStatusFilter">
            <option value="">全部状态</option>
          </select>
          <input id="drawerSearch" placeholder="搜索编号或关键词">
        </div>
        <div id="drawerItemList" class="drawer-item-list"></div>
        <div id="drawerEmpty" class="empty" style="display:none">该批次暂无墨锭数据</div>
      </div>
    </div>
  </div>
  <div id="versionHistoryModal" class="modal-overlay" style="display:none">
    <div class="modal-content">
      <div class="modal-header">
        <h2 id="versionHistoryTitle">版本历史</h2>
        <button class="modal-close" id="closeVersionHistory">×</button>
      </div>
      <div class="modal-body">
        <div id="versionHistoryList"></div>
      </div>
    </div>
  </div>
  <div id="revisionModal" class="modal-overlay" style="display:none">
    <div class="modal-content">
      <div class="modal-header">
        <h2 id="revisionModalTitle">修订记录</h2>
        <button class="modal-close" id="closeRevisionModal">×</button>
      </div>
      <div class="modal-body">
        <form id="revisionForm">
          <label>修订人</label>
          <input name="createdBy" id="revisionCreatedBy" placeholder="请输入修订人姓名" required>
          <label>修订原因</label>
          <textarea name="reason" id="revisionReason" placeholder="请输入修订原因（必填）" required style="min-height:80px"></textarea>
          <div id="revisionFieldsSection">
            <div class="section-subtitle">字段修改（可选）</div>
            <label>状态</label>
            <select name="status" id="revisionStatus">
              <option value="">不修改</option>
            </select>
            <label>存放位置</label>
            <input name="storage" id="revisionStorage" placeholder="留空表示不修改">
            <label>烟料来源</label>
            <input name="smokeSource" id="revisionSmokeSource" placeholder="留空表示不修改">
            <label>胶料比例</label>
            <input name="glueRatio" id="revisionGlueRatio" placeholder="留空表示不修改">
            <label>存放年限</label>
            <input name="ageYears" id="revisionAgeYears" type="number" placeholder="留空表示不修改">
          </div>
          <div id="revisionLogSection" style="margin-top:14px">
            <div class="section-subtitle">追加操作日志（可选）</div>
            <label>操作类型</label>
            <select name="logStep" id="revisionLogStep">
              <option value="">不追加日志</option>
              <option>备注</option>
              <option>观察</option>
              <option>检测</option>
              <option>其他</option>
            </select>
            <label>日志内容</label>
            <textarea name="logNote" id="revisionLogNote" placeholder="输入日志备注内容" style="min-height:60px"></textarea>
          </div>
          <div id="revisionTestSection" style="margin-top:14px">
            <div class="section-subtitle">追加试磨记录（可选）</div>
            <label>试磨纸张</label>
            <input name="paper" id="revisionPaper">
            <label>加水量</label>
            <input name="water" id="revisionWater">
            <label>出墨速度</label>
            <input name="speed" id="revisionSpeed">
            <label>墨色层次</label>
            <input name="colorLayer" id="revisionColorLayer">
            <label>沉淀情况</label>
            <input name="sediment" id="revisionSediment">
            <label>评分</label>
            <input name="score" id="revisionScore" type="number" min="0" max="100">
          </div>
          <div style="margin-top:16px">
            <button type="submit" id="submitRevisionBtn">提交修订（产生新版本）</button>
            <button type="button" class="secondary" id="cancelRevisionBtn" style="margin-left:8px">取消</button>
          </div>
        </form>
      </div>
    </div>
  </div>
  <div id="versionDetailModal" class="modal-overlay" style="display:none">
    <div class="modal-content wide">
      <div class="modal-header">
        <h2 id="versionDetailTitle">版本详情</h2>
        <button class="modal-close" id="closeVersionDetail">×</button>
      </div>
      <div class="modal-body">
        <div id="versionDetailContent"></div>
        <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
          <button id="restoreVersionBtn" class="secondary gold">恢复到此版本</button>
          <button id="cancelVersionDetailBtn" class="secondary">关闭</button>
        </div>
      </div>
    </div>
  </div>
  <div id="conflictModal" class="modal-overlay" style="display:none">
    <div class="modal-content wide">
      <div class="modal-header">
        <h2 id="conflictTitle">⚠️ 数据冲突</h2>
        <button class="modal-close" id="closeConflictModal">×</button>
      </div>
      <div class="modal-body">
        <div id="conflictSummary" class="conflict-summary"></div>
        <div id="conflictFields" class="conflict-fields"></div>
        <div id="conflictActions" style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">
          <button id="conflictKeepAllServer" class="secondary">全部采用最新数据</button>
          <button id="conflictKeepAllClient" class="secondary">全部保留我的修改</button>
          <button id="conflictSubmit" class="gold">✓ 确认并提交</button>
          <button id="conflictCancel" class="secondary" style="background:var(--warn)">取消修改</button>
        </div>
      </div>
    </div>
  </div>
  <div id="createTemplateFromRecordModal" class="modal-overlay" style="display:none">
    <div class="modal-content">
      <div class="modal-header">
        <h2 id="createTemplateFromRecordTitle">从试磨记录生成模板</h2>
        <button class="modal-close" id="closeCreateTemplateFromRecord">×</button>
      </div>
      <div class="modal-body">
        <div id="createTemplateFromRecordSource" class="meta" style="margin-bottom:12px;padding:10px;background:#f8faf6;border-radius:8px"></div>
        <form id="createTemplateFromRecordForm">
          <label>方案名称 *</label>
          <input name="name" id="tplFromRecordName" placeholder="请输入模板名称" required>
          <div class="section-subtitle" style="margin-top:12px">选择要保存的字段</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
            <label style="display:flex;align-items:center;gap:6px;margin:0">
              <input type="checkbox" name="includePaper" id="tplFromRecordIncludePaper" checked>
              <span style="margin:0">试磨纸张</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;margin:0">
              <input type="checkbox" name="includeWater" id="tplFromRecordIncludeWater" checked>
              <span style="margin:0">加水量</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;margin:0">
              <input type="checkbox" name="includeGrindingTime" id="tplFromRecordIncludeGrindingTime" checked>
              <span style="margin:0">研磨时长</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;margin:0">
              <input type="checkbox" name="includeSpeed" id="tplFromRecordIncludeSpeed" checked>
              <span style="margin:0">出墨速度</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;margin:0;grid-column:span 2">
              <input type="checkbox" name="includeObservation" id="tplFromRecordIncludeObservation" checked>
              <span style="margin:0">观察重点</span>
            </label>
          </div>
          <div class="section-subtitle" style="margin-top:14px">字段预览</div>
          <div id="tplFromRecordPreview" style="margin-top:8px;padding:12px;background:#fff;border:1px solid var(--line);border-radius:8px;font-size:13px"></div>
          <label style="display:flex;align-items:center;gap:8px;margin-top:14px">
            <input type="checkbox" name="isDefault" id="tplFromRecordIsDefault">
            <span style="margin:0">设为默认模板</span>
          </label>
          <div style="margin-top:16px;display:flex;gap:10px">
            <button type="submit" class="gold">保存为新模板</button>
            <button type="button" class="secondary" id="cancelCreateTemplateFromRecord">取消</button>
          </div>
        </form>
      </div>
    </div>
  </div>
  <div id="syncStatusBar" class="sync-status-bar" style="display:none">
    <span id="syncStatusIcon">🔄</span>
    <span id="syncStatusText">正在同步...</span>
  </div>
  <script src="/public/dataSync.js"></script>
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

export function importPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CSV批量导入 - 墨锭试磨室</title>
  <link rel="stylesheet" href="/public/styles.css">
</head>
<body>
  <header>
    <div>
      <h1>CSV批量导入墨锭档案</h1>
      <div class="meta">上传或粘贴CSV内容，预览校验后批量导入墨锭档案</div>
    </div>
    <div style="display:flex;gap:10px">
      <button class="secondary" id="backBtn">← 返回墨锭列表</button>
      <button class="secondary gold" id="viewBatchesBtn">导入批次记录</button>
    </div>
  </header>
  <main style="grid-template-columns:1fr">
    <section id="importSection">
      <div class="panel">
        <h2>1. 上传或粘贴CSV内容</h2>
        <div class="import-options">
          <div class="import-option">
            <label>上传CSV文件</label>
            <input type="file" id="csvFile" accept=".csv,text/csv" style="padding:8px">
          </div>
          <div class="import-divider">或</div>
          <div class="import-option" style="flex:1">
            <label>粘贴CSV内容</label>
            <textarea id="csvText" placeholder="墨锭编号,烟料来源,胶料比例,存放年限,存放位置,批次编号&#10;IS-101,黄山松烟,7.5%,5,恒湿柜A,B001&#10;IS-102,桐油烟,8%,3,试样盒C,B002" style="min-height:160px;font-family:monospace"></textarea>
          </div>
        </div>
        <div style="margin-top:14px">
          <label>导入人</label>
          <input id="importedBy" placeholder="请输入导入人姓名（用于审计记录）" style="max-width:300px">
        </div>
        <div style="margin-top:14px">
          <label>备注（可选）</label>
          <input id="importNote" placeholder="本次导入的说明或备注" style="max-width:500px">
        </div>
        <div class="btn-group" style="margin-top:16px">
          <button id="previewBtn" style="min-width:140px">预览并校验</button>
          <button class="secondary" id="clearBtn">清空</button>
        </div>
        <div class="import-hint meta" style="margin-top:12px">
          <strong>支持的字段：</strong>墨锭编号（必填）、烟料来源（必填）、胶料比例、存放年限（非负整数）、存放位置、批次编号、状态（待试磨/已试磨/重点观察）<br>
          <strong>别名支持：</strong>编号、烟料、来源、胶比、年限、年龄、位置、批次 等
        </div>
      </div>

      <div id="previewSection" style="display:none;margin-top:18px">
        <div class="panel">
          <div class="section-title">
            <h2>2. 导入预览与校验结果</h2>
            <div id="previewSummary" class="preview-summary"></div>
          </div>

          <div id="fieldMappingSection" style="margin-bottom:16px">
            <h3 style="margin-bottom:10px;font-size:15px">字段识别与映射</h3>
            <div id="fieldMappingList" class="field-mapping"></div>
            <div id="unrecognizedFields" style="display:none;margin-top:8px">
              <div style="margin-bottom:6px"><span class="pill warn">未识别字段</span> <span class="meta">— 请选择映射到的目标字段：</span></div>
              <div id="unrecognizedList" class="fm-remap-list"></div>
            </div>
            <div id="missingRequiredFields" style="display:none;margin-top:8px">
              <span class="pill warn">缺失必填字段</span>
              <span id="missingRequiredList" class="meta"></span>
            </div>
            <div id="revalidateBar" class="fm-revalidate-bar" style="display:none;margin-top:12px">
              <button class="gold" id="revalidateBtn" onclick="revalidateWithMapping()">重新校验</button>
              <span class="meta">修正映射后点击重新校验</span>
            </div>
          </div>

          <div id="errorsSection" style="display:none;margin-bottom:16px">
            <h3 style="margin-bottom:10px;font-size:15px;color:var(--warn)">发现错误（<span id="errorCount">0</span>）</h3>
            <div id="errorList" class="error-list"></div>
          </div>

          <div id="importableSection" style="display:none">
            <h3 style="margin-bottom:10px;font-size:15px">可导入数据预览（<span id="importableCount">0</span> 行）</h3>
            <div class="table-container">
              <table id="importableTable">
                <thead></thead>
                <tbody></tbody>
              </table>
            </div>
            <div id="moreRowsHint" class="meta" style="margin-top:8px;display:none"></div>
          </div>

          <div class="btn-group" style="margin-top:16px">
            <button id="confirmImportBtn" class="gold" style="min-width:160px">确认导入</button>
            <button class="secondary" id="cancelPreviewBtn">取消</button>
          </div>
        </div>
      </div>

      <div id="resultSection" style="display:none;margin-top:18px">
        <div class="panel">
          <div class="section-title">
            <h2>3. 导入完成</h2>
            <span class="pill done" id="resultStatus">导入成功</span>
          </div>
          <div id="resultMessage" style="margin-bottom:14px"></div>
          <div id="importedItemsList"></div>
          <div class="btn-group" style="margin-top:16px">
            <button id="continueImportBtn">继续导入</button>
            <button class="secondary" id="backToListBtn">返回墨锭列表</button>
          </div>
        </div>
      </div>
    </section>

    <section id="batchesSection" style="display:none">
      <div class="panel">
        <div class="section-title">
          <h2>导入批次记录</h2>
          <button class="secondary" id="backToImportBtn">← 返回导入页面</button>
        </div>
        <div id="batchesList"></div>
        <div id="batchesEmpty" class="empty" style="display:none">暂无导入批次记录</div>
      </div>
    </section>
  </main>
  <script src="/public/import.js"></script>
</body>
</html>`;
}
