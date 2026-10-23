/*
 * jejak.js runtime — runs inside the Web Worker, before the instrumented user code.
 *
 * This file is plain JavaScript loaded as a raw string (not bundled), so it must
 * stay self-contained. It expects a global `__META` (set by build.ts) and talks to
 * the page with postMessage batches:
 *   { t: 'b', ev: Event[], hits: number[], line, total }   and   { t: 'done' }
 */
(function () {
  'use strict';
  var CAP = __META.cap || 5000;          // max recorded Time Machine steps
  var LIMIT = __META.limit || 3e6;       // max statements / loop iterations
  var hits = new Int32Array(__META.n);
  var curLine = 1, steps = 0, total = 0, guardN = 0;
  var stack = [];                        // shadow call stack: { f, cl, a }
  var suspended = {};                    // fid -> frames saved at `await`
  var events = [], flushT = null, T = {}, lastThrow = null;
  var overhead = 0;                      // ms spent inside the tracker (excluded from timings)
  var OV0 = {};
  var errInfo = new WeakMap();
  var now = function () { return performance.now(); };

  function isClass(f) { try { return /^class[\s{]/.test(Function.prototype.toString.call(f)); } catch (e) { return false; } }
  function q(s) { return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'"; }

  /* ---------- value serializer: produces a small JSON-safe tree ---------- */
  function ser(v, depth, seen) {
    seen = seen || new Set();
    var t = typeof v;
    if (v === null) return { t: 'null', p: 'null' };
    if (t === 'undefined') return { t: 'undef', p: 'undefined' };
    if (t === 'number') return { t: 'num', p: Object.is(v, -0) ? '-0' : String(v) };
    if (t === 'string') return { t: 'str', p: q(v.length > 500 ? v.slice(0, 500) + '…' : v), r: v.length > 5000 ? v.slice(0, 5000) + '…' : v };
    if (t === 'boolean') return { t: 'bool', p: String(v) };
    if (t === 'bigint') return { t: 'big', p: v + 'n' };
    if (t === 'symbol') return { t: 'sym', p: v.toString() };
    if (t === 'function') { var nm = v.name || 'anonymous'; return { t: 'fn', p: isClass(v) ? 'class ' + nm : 'ƒ ' + nm + '()' }; }
    if (seen.has(v)) return { t: 'circ', p: '[Circular]' };
    try {
      if (v instanceof Error) return { t: 'err', p: (v.name || 'Error') + ': ' + v.message };
      if (v instanceof Date) return { t: 'date', p: isNaN(v) ? 'Invalid Date' : v.toISOString() };
      if (v instanceof RegExp) return { t: 're', p: String(v) };
      if (typeof Promise !== 'undefined' && v instanceof Promise) return { t: 'prom', p: 'Promise {…}' };
      if (v instanceof WeakMap || v instanceof WeakSet) return { t: 'obj', p: (v instanceof WeakMap ? 'WeakMap' : 'WeakSet') + ' { <items unknown> }' };
    } catch (e) { /* exotic object */ }
    var kids = [], label = '', open = '{', close = '}', n = 0, isArr = false, i;
    var ctor = (function () { try { var p = Object.getPrototypeOf(v); if (p === null) return '[Object: null prototype]'; return p && p.constructor && p.constructor.name; } catch (e) { return ''; } })();
    seen.add(v);
    try {
      if (Array.isArray(v) || ArrayBuffer.isView(v)) {
        isArr = true; n = v.length; open = '['; close = ']';
        label = Array.isArray(v) ? (ctor && ctor !== 'Array' ? ctor + '(' + n + ') ' : '') : ctor + '(' + n + ') ';
        if (depth > 0) for (i = 0; i < Math.min(n, 100); i++) kids.push({ k: String(i), v: ser(v[i], depth - 1, seen) });
      } else if (v instanceof Map) {
        n = v.size; label = 'Map(' + n + ') ';
        if (depth > 0) { i = 0; v.forEach(function (val, k) { if (i++ >= 100) return; kids.push({ k: ser(k, 0, seen).p + ' =>', v: ser(val, depth - 1, seen), mk: 1 }); }); }
      } else if (v instanceof Set) {
        n = v.size; label = 'Set(' + n + ') ';
        if (depth > 0) { i = 0; v.forEach(function (val) { if (i >= 100) return; kids.push({ k: String(i++), v: ser(val, depth - 1, seen), sk: 1 }); }); }
      } else {
        var keys = Object.keys(v); n = keys.length;
        label = ctor && ctor !== 'Object' ? ctor + ' ' : '';
        if (depth > 0) keys.slice(0, 100).forEach(function (k) { var cv; try { cv = v[k]; } catch (e) { cv = e; } kids.push({ k: k, v: ser(cv, depth - 1, seen) }); });
      }
    } finally { seen.delete(v); }
    var p;
    if (depth <= 0 && n > 0) p = label + open + '…' + close;
    else {
      var parts = [], len = 0;
      for (i = 0; i < kids.length; i++) {
        var c = kids[i];
        var s = isArr || c.sk ? c.v.p : (c.mk ? c.k + ' ' + c.v.p : (/^[A-Za-z_$][\w$]*$/.test(c.k) ? c.k : q(c.k)) + ': ' + c.v.p);
        len += s.length + 2;
        if (len > 90) { parts.push('…'); break; }
        parts.push(s);
      }
      if (kids.length < n && parts[parts.length - 1] !== '…') parts.push('…');
      p = label + (parts.length ? open + ' ' + parts.join(', ') + ' ' + close : open + close);
    }
    return { t: isArr ? 'arr' : 'obj', p: p, c: depth > 0 ? kids : undefined, n: n, trunc: depth <= 0 && n > 0 };
  }

  /* ---------- batching ---------- */
  function flush() {
    flushT = null;
    postMessage({ t: 'b', ev: events, hits: Array.from(hits), line: curLine, total: total });
    events = [];
  }
  function sched() { if (events.length > 300) flush(); else if (!flushT) flushT = setTimeout(flush, 25); }
  function frames() { return stack.map(function (s) { return { f: s.f, cl: s.cl, a: s.a ? 1 : 0 }; }); }

  /* ---------- tracker API used by instrumented code ---------- */
  self.__s = function (id, vars) {
    var t0 = now();
    hits[id]++; curLine = __META.lines[id];
    if (++total > LIMIT) throw new RangeError('Execution too long (possible infinite loop)');
    if (steps < CAP) {
      steps++;
      var names = __META.vars[id], o = {};
      for (var i = 0; i < vars.length; i++) {
        try { o[names[i]] = ser(vars[i](), 2); } catch (e) { o[names[i]] = { t: 'tdz', p: '<uninitialized>' }; }
      }
      events.push({ k: 's', id: id, v: o, st: frames() });
    }
    sched();
    overhead += now() - t0;
  };
  self.__q = function (id) { hits[id]++; curLine = __META.lines[id]; if (++total > LIMIT) throw new RangeError('Execution too long (possible infinite loop)'); };
  self.__e = function (id) { hits[id]++; stack.push({ f: id, cl: curLine, a: false }); };
  self.__x = function (id) { for (var i = stack.length - 1; i >= 0; i--) if (stack[i].f === id) { stack.splice(i, 1); break; } };
  // async: `await` suspends the current frame and resumes it later from a microtask
  self.__as = function (fid, v) {
    for (var i = stack.length - 1; i >= 0; i--) if (stack[i].f === fid) {
      (suspended[fid] = suspended[fid] || []).push(stack[i]);
      stack.splice(i, 1); break;
    }
    return v;
  };
  self.__ar = function (fid, v) { self.__rs(fid); return v; };
  self.__rs = function (fid) {
    var saved = suspended[fid] && suspended[fid].pop();
    if (saved) { saved.a = true; stack = [saved]; }
  };
  self.__c = function (err) {
    var info = { line: curLine, path: stack.map(function (s) { return s.cl; }) };
    if (err && typeof err === 'object') { if (!errInfo.has(err)) errInfo.set(err, info); }
    else if (!lastThrow || lastThrow.v !== err) lastThrow = { v: err, info: info };
  };
  self.__b = function (id, v) { hits[id]++; return v; };
  self.__g = function (id) { hits[id]++; if (++guardN > LIMIT) throw new RangeError('Loop ran too long (possible infinite loop)'); };
  self.__t0 = function (id) { OV0[id] = overhead; T[id] = now(); };
  self.__v = function (id, val, fn) {
    var t0 = now();
    var ms = T[id] != null ? Math.max(0, t0 - T[id] - (overhead - OV0[id])) : undefined;
    var shown = val;
    if (fn) { try { shown = fn(val); } catch (e) { shown = e; } }
    events.push({ k: 'v', id: id, v: ser(shown, __META.deep[id] ? 8 : 3), ms: ms, s: steps });
    sched();
    overhead += now() - t0;
    return val;
  };
  self.__log = function (id, m) {
    return function () {
      var t0 = now();
      var a = Array.prototype.slice.call(arguments);
      events.push({ k: 'l', id: id, m: m, a: a.map(function (x) { return ser(x, 3); }), s: steps });
      sched();
      overhead += now() - t0;
    };
  };
  var glog = function (m) {
    return function () {
      var a = Array.prototype.slice.call(arguments);
      events.push({ k: 'l', id: -1, line: curLine, m: m, a: a.map(function (x) { return ser(x, 3); }), s: steps });
      sched();
    };
  };
  ['log', 'info', 'warn', 'error', 'debug', 'table', 'dir'].forEach(function (m) { console[m] = glog(m); });
  self.alert = glog('log');

  function report(err) {
    var info = (err && typeof err === 'object') ? errInfo.get(err) : (lastThrow && lastThrow.v === err ? lastThrow.info : null);
    info = info || { line: curLine, path: [] };
    var name = (err && err.name) || 'Error';
    var msg = err && err.message != null ? err.message : String(err);
    var stackStr = err && typeof err === 'object' && typeof err.stack === 'string' ? err.stack : '';
    events.push({ k: 'err', name: name, msg: msg, line: info.line, path: info.path, stack: stackStr, s: steps, v: ser(err, 2) });
    flush();
  }
  self.__report = report;
  self.addEventListener && self.addEventListener('error', function (e) { e.preventDefault(); report(e.error || e.message); });
  self.addEventListener && self.addEventListener('unhandledrejection', function (e) { e.preventDefault(); report(e.reason); });
  self.__done = function () { flush(); postMessage({ t: 'done' }); };
  self.__ser = ser;
})();
