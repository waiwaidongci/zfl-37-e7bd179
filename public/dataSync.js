(function(global) {
  const CHANNEL_NAME = 'ink-stick-sync';
  const SSE_URL = '/api/events/stream';

  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
  const listeners = new Set();
  const pendingChanges = [];
  let sseSource = null;
  let reconnectTimer = null;
  let connected = false;

  function subscribe(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
  }

  function emit(event) {
    for (const fn of listeners) {
      try { fn(event); } catch (e) { console.error('sync listener error', e); }
    }
  }

  function broadcastLocal(event) {
    if (bc) {
      bc.postMessage({ ...event, _local: true, _ts: Date.now() });
    }
    emit(event);
  }

  if (bc) {
    bc.onmessage = (e) => {
      if (!e.data || e.data._local) return;
      emit(e.data);
    };
  }

  function connectSSE() {
    if (typeof EventSource === 'undefined') return;
    if (sseSource) {
      try { sseSource.close(); } catch (e) {}
      sseSource = null;
    }
    try {
      sseSource = new EventSource(SSE_URL, { withCredentials: false });
      sseSource.addEventListener('change', (e) => {
        try {
          const event = JSON.parse(e.data);
          connected = true;
          emit(event);
          if (bc) bc.postMessage({ ...event, _fromSSE: true, _ts: Date.now() });
        } catch (err) {
          console.error('SSE parse error', err);
        }
      });
      sseSource.onerror = () => {
        connected = false;
        scheduleReconnect();
      };
      sseSource.onopen = () => { connected = true; };
    } catch (e) {
      connected = false;
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectSSE, 3000 + Math.random() * 2000);
  }

  connectSSE();

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && (!connected || !sseSource || sseSource.readyState === 2)) {
        connectSSE();
      }
    });
  }

  const store = {
    items: [],
    batches: [],
    templates: [],
    tasks: [],
    scoringRules: [],
    importBatches: [],
    storageKanban: [],
    stats: {},
    scoringCoverage: null,
    scoringStatuses: [],
    todayTasksData: null
  };

  function updateStore(event) {
    if (!event || !event.collection || !event.changeType) return;
    const { collection, changeType, recordId, record } = event;
    const list = store[collection];
    if (!Array.isArray(list)) return;

    const idx = list.findIndex(x => x.id === recordId || (collection === 'items' && x.code === recordId) || (collection === 'batches' && x.code === recordId));

    if (changeType === 'created') {
      if (idx === -1 && record) list.unshift(record);
    } else if (changeType === 'updated') {
      if (idx >= 0 && record) list[idx] = record;
      else if (record) list.unshift(record);
    } else if (changeType === 'deleted') {
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  subscribe((event) => {
    updateStore(event);
    pendingChanges.push(event);
    if (pendingChanges.length > 200) pendingChanges.splice(0, pendingChanges.length - 200);
  });

  function getStore() { return store; }
  function setStoreSnapshot(snapshot) {
    Object.assign(store, snapshot);
  }

  function isConnected() { return connected; }

  global.DataSync = {
    subscribe,
    broadcastLocal,
    getStore,
    setStoreSnapshot,
    isConnected,
    pendingChanges
  };
})(typeof window !== 'undefined' ? window : this);
