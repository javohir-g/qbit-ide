/* A small Python interpreter for the simulator: the text that the blocks produce is the same text the real board runs (MicroPython),
   so the browser needs something that runs that text. It supports the part of Python that kids' programs and the block generators use:
   numbers, strings, lists, tuples, dicts, functions (def / async def / lambda), if / while / for, global, import of the few known modules.
   `await` suspends a program: every program is a set of cooperative tasks driven by Q.Py.Scheduler (one step per simulation step),
   so "wait 1 second" takes one second of simulated time and several "when ..." scripts can run side by side.

   Known differences from CPython (on purpose, to keep it small): ints and floats are both JS numbers (so 6 / 3 prints 2, not 2.0),
   no classes, no try / except, no generators. Anything else is a clear error message, never a silent wrong result. */
(function (G) {
  'use strict';
  var Q = G.QBIT = G.QBIT || {};

  /* ================================================================================================ errors */
  function PyError(type, msg, line) {
    this.type = type; this.msg = msg; this.line = line || 0;
    this.message = type + ': ' + msg;
  }
  PyError.prototype = Object.create(Error.prototype);
  PyError.prototype.constructor = PyError;
  function err(type, msg) { return new PyError(type, msg); }

  /* ================================================================================================ lexer */
  var KEYWORDS = { 'False': 1, 'None': 1, 'True': 1, 'and': 1, 'as': 1, 'assert': 1, 'async': 1, 'await': 1, 'break': 1, 'class': 1, 'continue': 1, 'def': 1,
    'del': 1, 'elif': 1, 'else': 1, 'except': 1, 'finally': 1, 'for': 1, 'from': 1, 'global': 1, 'if': 1, 'import': 1, 'in': 1, 'is': 1, 'lambda': 1,
    'nonlocal': 1, 'not': 1, 'or': 1, 'pass': 1, 'raise': 1, 'return': 1, 'try': 1, 'while': 1, 'with': 1, 'yield': 1 };
  var OPS3 = ['**=', '//=', '>>=', '<<='];
  var OPS2 = ['**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '->', ':='];
  var OPS1 = '+-*/%<>=()[]{},:.;@&|^~';

  function syntax(msg, line) { return new PyError('SyntaxError', msg, line); }

  function tokenize(src) {
    var toks = [], i = 0, n = src.length, line = 1, indents = [0], depth = 0, atLineStart = true;
    src = src.replace(/\r\n?/g, '\n');
    n = src.length;
    function push(t, v, extra) { var o = { t: t, v: v, line: line }; if (extra) for (var k in extra) o[k] = extra[k]; toks.push(o); return o; }
    while (i < n) {
      var c = src[i];
      if (atLineStart && depth === 0) {
        // measure the indentation of this line
        var col = 0, j = i;
        while (j < n && (src[j] === ' ' || src[j] === '\t')) { col += src[j] === '\t' ? 8 - (col % 8) : 1; j++; }
        if (j >= n) { i = j; break; }
        if (src[j] === '\n') { i = j + 1; line++; continue; }          // blank line
        if (src[j] === '#') { while (j < n && src[j] !== '\n') j++; i = j; continue; }
        if (col > indents[indents.length - 1]) { indents.push(col); push('INDENT'); }
        else {
          while (col < indents[indents.length - 1]) { indents.pop(); push('DEDENT'); }
          if (col !== indents[indents.length - 1]) throw syntax('unindent does not match any outer indentation level', line);
        }
        i = j; atLineStart = false; continue;
      }
      if (c === '\n') {
        if (depth === 0) { push('NEWLINE'); atLineStart = true; }
        i++; line++; continue;
      }
      if (c === ' ' || c === '\t') { i++; continue; }
      if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '\\' && src[i + 1] === '\n') { i += 2; line++; continue; }
      // strings (with optional prefix)
      var m = /^([rRfFbB]{0,2})('''|"""|'|")/.exec(src.slice(i, i + 5));
      if (m && (m[1] === '' || /^[rRfFbB]+$/.test(m[1]))) {
        var prefix = m[1].toLowerCase(), q = m[2], raw = prefix.indexOf('r') >= 0, isF = prefix.indexOf('f') >= 0;
        var s = i + m[0].length, out = '', startLine = line;
        for (;;) {
          if (s >= n) throw syntax('unterminated string literal', startLine);
          if (src.substr(s, q.length) === q) { s += q.length; break; }
          var ch = src[s];
          if (ch === '\n') { if (q.length === 1) throw syntax('unterminated string literal', startLine); line++; out += ch; s++; continue; }
          if (ch === '\\' && !raw) {
            var e = src[s + 1]; s += 2;
            if (e === 'n') out += '\n'; else if (e === 't') out += '\t'; else if (e === 'r') out += '\r'; else if (e === '\\') out += '\\';
            else if (e === "'") out += "'"; else if (e === '"') out += '"'; else if (e === '0') out += '\0';
            else if (e === '\n') { line++; }
            else if (e === 'x') { out += String.fromCharCode(parseInt(src.substr(s, 2), 16)); s += 2; }
            else if (e === 'u') { out += String.fromCharCode(parseInt(src.substr(s, 4), 16)); s += 4; }
            else out += '\\' + e;
            continue;
          }
          out += ch; s++;
        }
        push(isF ? 'FSTRING' : 'STR', out);
        i = s; continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        var nm = /^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:[0-9][0-9_]*)?\.?[0-9_]*(?:[eE][+-]?[0-9]+)?)/.exec(src.slice(i));
        var txt = nm[0].replace(/_/g, '');
        var val = /^0[xXbBoO]/.test(txt) ? Number(txt) : parseFloat(txt);
        if (isNaN(val)) throw syntax('invalid number', line);
        push('NUM', val); i += nm[0].length; continue;
      }
      if (/[A-Za-z_\u0080-￿]/.test(c)) {
        var k = i + 1;
        while (k < n && /[A-Za-z0-9_\u0080-￿]/.test(src[k])) k++;
        var word = src.slice(i, k);
        push(KEYWORDS[word] ? 'KW' : 'NAME', word); i = k; continue;
      }
      var o3 = src.substr(i, 3), o2 = src.substr(i, 2);
      if (OPS3.indexOf(o3) >= 0) { push('OP', o3); i += 3; continue; }
      if (OPS2.indexOf(o2) >= 0) { push('OP', o2); i += 2; continue; }
      if (OPS1.indexOf(c) >= 0) {
        if (c === '(' || c === '[' || c === '{') depth++;
        if (c === ')' || c === ']' || c === '}') depth--;
        push('OP', c); i++; continue;
      }
      throw syntax("unexpected character '" + c + "'", line);
    }
    if (toks.length && toks[toks.length - 1].t !== 'NEWLINE') push('NEWLINE');
    while (indents.length > 1) { indents.pop(); push('DEDENT'); }
    push('EOF');
    return toks;
  }

  /* ================================================================================================ parser */
  function Parser(toks) { this.toks = toks; this.p = 0; this.asyncStack = [false]; }
  var P = Parser.prototype;
  P.peek = function (o) { return this.toks[this.p + (o || 0)]; };
  P.next = function () { return this.toks[this.p++]; };
  P.isOp = function (v) { var t = this.peek(); return t.t === 'OP' && t.v === v; };
  P.isKw = function (v) { var t = this.peek(); return t.t === 'KW' && t.v === v; };
  P.eatOp = function (v) { if (this.isOp(v)) { this.p++; return true; } return false; };
  P.eatKw = function (v) { if (this.isKw(v)) { this.p++; return true; } return false; };
  P.expectOp = function (v) { if (!this.eatOp(v)) throw this.fail("expected '" + v + "'"); };
  P.expectKw = function (v) { if (!this.eatKw(v)) throw this.fail("expected '" + v + "'"); };
  P.fail = function (msg) { var t = this.peek(); return syntax(msg + (t.t === 'EOF' ? ' (unexpected end of program)' : ''), t.line); };
  P.expectName = function () { var t = this.next(); if (t.t !== 'NAME') throw syntax('invalid syntax: a name was expected', t.line); return t.v; };

  P.program = function () {
    var body = [];
    while (this.peek().t !== 'EOF') { if (this.peek().t === 'NEWLINE') { this.p++; continue; } body.push.apply(body, this.statement()); }
    return { t: 'Module', body: body };
  };
  P.block = function () {
    this.expectOp(':');
    var body = [];
    if (this.peek().t === 'NEWLINE') {
      this.p++;
      if (this.peek().t !== 'INDENT') throw this.fail('expected an indented block');
      this.p++;
      while (this.peek().t !== 'DEDENT' && this.peek().t !== 'EOF') { if (this.peek().t === 'NEWLINE') { this.p++; continue; } body.push.apply(body, this.statement()); }
      if (this.peek().t === 'DEDENT') this.p++;
    } else body.push.apply(body, this.simpleLine());
    return body;
  };
  P.statement = function () {
    var t = this.peek();
    if (t.t === 'KW') {
      switch (t.v) {
        case 'if': return [this.ifStmt()];
        case 'while': return [this.whileStmt()];
        case 'for': return [this.forStmt()];
        case 'def': return [this.defStmt(false)];
        case 'async':
          this.p++;
          if (this.isKw('def')) return [this.defStmt(true)];
          throw this.fail('only "async def" is supported after async');
        case 'class': throw syntax('classes are not supported in this editor', t.line);
        case 'try': throw syntax('try / except is not supported in this editor', t.line);
        case 'with': throw syntax('with is not supported in this editor', t.line);
      }
    }
    return this.simpleLine();
  };
  P.simpleLine = function () {
    var out = [this.simple()];
    while (this.eatOp(';')) { if (this.peek().t === 'NEWLINE') break; out.push(this.simple()); }
    if (this.peek().t === 'NEWLINE') this.p++;
    else if (this.peek().t !== 'EOF' && this.peek().t !== 'DEDENT') throw this.fail('invalid syntax');
    return out;
  };
  P.ifStmt = function () {
    var line = this.next().line, test = this.expr(), body = this.block(), orelse = [];
    if (this.isKw('elif')) { orelse = [this.ifStmtElif()]; }
    else if (this.eatKw('else')) orelse = this.block();
    return { t: 'If', test: test, body: body, orelse: orelse, line: line };
  };
  P.ifStmtElif = function () { return this.ifStmt(); };
  P.whileStmt = function () {
    var line = this.next().line, test = this.expr(), body = this.block(), orelse = [];
    if (this.eatKw('else')) orelse = this.block();
    return { t: 'While', test: test, body: body, orelse: orelse, line: line };
  };
  P.forStmt = function () {
    var line = this.next().line, target = this.targetList(), iter;
    this.expectKw('in');
    iter = this.exprList();
    var body = this.block(), orelse = [];
    if (this.eatKw('else')) orelse = this.block();
    return { t: 'For', target: target, iter: iter, body: body, orelse: orelse, line: line };
  };
  P.targetList = function () {
    var first = this.bitOr(), items = [first];
    var tuple = false;
    while (this.isOp(',')) { this.p++; tuple = true; if (this.isKw('in')) break; items.push(this.bitOr()); }
    return tuple ? { t: 'Tuple', items: items, line: first.line } : first;
  };
  P.defStmt = function (isAsync) {
    var line = this.next().line, name = this.expectName();
    this.expectOp('(');
    var params = this.params(')');
    this.expectOp(')');
    this.asyncStack.push(isAsync);
    var body = this.block();
    this.asyncStack.pop();
    return { t: 'Def', name: name, params: params, body: body, async: isAsync, line: line };
  };
  P.params = function (end) {
    var ps = [];
    while (!this.isOp(end)) {
      var star = 0;
      if (this.eatOp('**')) star = 2; else if (this.eatOp('*')) star = 1;
      var name = this.expectName(), def = null;
      if (!star && this.eatOp('=')) def = this.expr();
      ps.push({ name: name, def: def, star: star });
      if (!this.eatOp(',')) break;
    }
    return ps;
  };
  P.simple = function () {
    var t = this.peek(), line = t.line;
    if (t.t === 'KW') {
      switch (t.v) {
        case 'pass': this.p++; return { t: 'Pass', line: line };
        case 'break': this.p++; return { t: 'Break', line: line };
        case 'continue': this.p++; return { t: 'Continue', line: line };
        case 'return': {
          this.p++;
          var v = null;
          if (this.peek().t !== 'NEWLINE' && !this.isOp(';') && this.peek().t !== 'EOF') v = this.exprList();
          return { t: 'Return', value: v, line: line };
        }
        case 'global': case 'nonlocal': {
          this.p++;
          var names = [this.expectName()];
          while (this.eatOp(',')) names.push(this.expectName());
          return { t: 'Global', names: names, line: line };
        }
        case 'import': {
          this.p++;
          var items = [];
          do {
            var parts = [this.expectName()];
            while (this.eatOp('.')) parts.push(this.expectName());
            var as = null;
            if (this.eatKw('as')) as = this.expectName();
            items.push({ name: parts.join('.'), as: as });
          } while (this.eatOp(','));
          return { t: 'Import', items: items, line: line };
        }
        case 'from': {
          this.p++;
          var mp = [this.expectName()];
          while (this.eatOp('.')) mp.push(this.expectName());
          this.expectKw('import');
          var names2 = [];
          if (this.eatOp('*')) names2 = '*';
          else {
            var paren = this.eatOp('(');
            do {
              if (paren && this.isOp(')')) break;
              var nm = this.expectName(), as2 = null;
              if (this.eatKw('as')) as2 = this.expectName();
              names2.push({ name: nm, as: as2 });
            } while (this.eatOp(','));
            if (paren) this.expectOp(')');
          }
          return { t: 'ImportFrom', module: mp.join('.'), names: names2, line: line };
        }
        case 'del': this.p++; return { t: 'Del', targets: [this.exprList()], line: line };
        case 'assert': {
          this.p++;
          var test = this.expr(), msg = null;
          if (this.eatOp(',')) msg = this.expr();
          return { t: 'Assert', test: test, msg: msg, line: line };
        }
        case 'raise': {
          this.p++;
          var e = null;
          if (this.peek().t !== 'NEWLINE') e = this.expr();
          return { t: 'Raise', exc: e, line: line };
        }
        case 'yield': throw syntax('yield is not supported', line);
      }
    }
    var left = this.exprList();
    if (this.isOp('=')) {
      var targets = [left], value;
      while (this.eatOp('=')) { value = this.exprList(); if (this.isOp('=')) targets.push(value); }
      targets.forEach(function (tg) { Parser.checkTarget(tg, line); });
      return { t: 'Assign', targets: targets, value: value, line: line };
    }
    var tk = this.peek();
    if (tk.t === 'OP' && /^(\+|-|\*|\/|\/\/|%|\*\*|&|\||\^|<<|>>)=$/.test(tk.v)) {
      this.p++;
      Parser.checkTarget(left, line);
      var rhs = this.exprList();
      return { t: 'AugAssign', target: left, op: tk.v.slice(0, -1), value: rhs, line: line };
    }
    return { t: 'Expr', value: left, line: line };
  };
  Parser.checkTarget = function (t, line) {
    if (t.t === 'Name' || t.t === 'Subscript' || t.t === 'Attribute') return;
    if (t.t === 'Tuple' || t.t === 'List') { t.items.forEach(function (x) { Parser.checkTarget(x, line); }); return; }
    throw syntax('cannot assign to this expression', line);
  };

  // expression list: "a, b" is a tuple
  P.exprList = function () {
    var first = this.expr();
    if (!this.isOp(',')) return first;
    var items = [first];
    while (this.eatOp(',')) {
      var t = this.peek();
      if (t.t === 'NEWLINE' || t.t === 'EOF' || (t.t === 'OP' && (t.v === '=' || t.v === ')' || t.v === ']' || t.v === ':' || t.v === ';')) || (t.t === 'KW' && t.v === 'in')) break;
      items.push(this.expr());
    }
    return { t: 'Tuple', items: items, line: first.line };
  };
  P.expr = function () {
    if (this.isKw('lambda')) {
      var line = this.next().line, ps = this.params(':');
      this.expectOp(':');
      this.asyncStack.push(false);
      var body = this.expr();
      this.asyncStack.pop();
      return { t: 'Lambda', params: ps, body: body, line: line };
    }
    var e = this.orExpr();
    if (this.isKw('if')) {
      var l2 = this.next().line, test = this.orExpr();
      this.expectKw('else');
      var orelse = this.expr();
      return { t: 'IfExp', test: test, body: e, orelse: orelse, line: l2 };
    }
    return e;
  };
  P.orExpr = function () {
    var l = this.andExpr();
    while (this.isKw('or')) { var line = this.next().line; l = { t: 'BoolOp', op: 'or', l: l, r: this.andExpr(), line: line }; }
    return l;
  };
  P.andExpr = function () {
    var l = this.notExpr();
    while (this.isKw('and')) { var line = this.next().line; l = { t: 'BoolOp', op: 'and', l: l, r: this.notExpr(), line: line }; }
    return l;
  };
  P.notExpr = function () {
    if (this.isKw('not')) { var line = this.next().line; return { t: 'Not', e: this.notExpr(), line: line }; }
    return this.compare();
  };
  P.compare = function () {
    var left = this.bitOr(), ops = [], rights = [], line = left.line;
    for (;;) {
      var t = this.peek(), op = null;
      if (t.t === 'OP' && (t.v === '<' || t.v === '>' || t.v === '<=' || t.v === '>=' || t.v === '==' || t.v === '!=')) { op = t.v; this.p++; }
      else if (t.t === 'KW' && t.v === 'in') { op = 'in'; this.p++; }
      else if (t.t === 'KW' && t.v === 'not' && this.peek(1).t === 'KW' && this.peek(1).v === 'in') { op = 'not in'; this.p += 2; }
      else if (t.t === 'KW' && t.v === 'is') { this.p++; if (this.eatKw('not')) op = 'is not'; else op = 'is'; }
      else break;
      ops.push(op); rights.push(this.bitOr());
    }
    return ops.length ? { t: 'Compare', left: left, ops: ops, rights: rights, line: line } : left;
  };
  function binLevel(name, next, ops) {
    P[name] = function () {
      var l = this[next]();
      for (;;) {
        var t = this.peek();
        if (t.t === 'OP' && ops.indexOf(t.v) >= 0) { this.p++; l = { t: 'BinOp', op: t.v, l: l, r: this[next](), line: t.line }; }
        else return l;
      }
    };
  }
  binLevel('bitOr', 'bitXor', ['|']);
  binLevel('bitXor', 'bitAnd', ['^']);
  binLevel('bitAnd', 'shift', ['&']);
  binLevel('shift', 'arith', ['<<', '>>']);
  binLevel('arith', 'term', ['+', '-']);
  binLevel('term', 'factor', ['*', '/', '//', '%', '@']);
  P.factor = function () {
    var t = this.peek();
    if (t.t === 'OP' && (t.v === '-' || t.v === '+' || t.v === '~')) { this.p++; return { t: 'Unary', op: t.v, e: this.factor(), line: t.line }; }
    return this.power();
  };
  P.power = function () {
    var base = this.awaitExpr();
    if (this.isOp('**')) { var line = this.next().line; return { t: 'BinOp', op: '**', l: base, r: this.factor(), line: line }; }
    return base;
  };
  P.awaitExpr = function () {
    if (this.isKw('await')) {
      var line = this.next().line;
      if (!this.asyncStack[this.asyncStack.length - 1]) throw syntax("'await' outside async function", line);
      return { t: 'Await', e: this.postfix(), line: line };
    }
    return this.postfix();
  };
  P.postfix = function () {
    var e = this.atom();
    for (;;) {
      var t = this.peek();
      if (t.t !== 'OP') return e;
      if (t.v === '(') {
        this.p++;
        var args = [], kw = [], star = null, dstar = null;
        while (!this.isOp(')')) {
          if (this.eatOp('**')) dstar = this.expr();
          else if (this.eatOp('*')) star = this.expr();
          else if (this.peek().t === 'NAME' && this.peek(1).t === 'OP' && this.peek(1).v === '=') { var nm = this.next().v; this.p++; kw.push({ name: nm, value: this.expr() }); }
          else {
            var a = this.expr();
            if (this.isKw('for')) throw this.fail('generator expressions are not supported');
            args.push(a);
          }
          if (!this.eatOp(',')) break;
        }
        this.expectOp(')');
        e = { t: 'Call', f: e, args: args, kw: kw, star: star, dstar: dstar, line: t.line };
      } else if (t.v === '[') {
        this.p++;
        var idx = this.sliceOrIndex();
        this.expectOp(']');
        e = idx.slice ? { t: 'Slice', e: e, lo: idx.lo, hi: idx.hi, step: idx.step, line: t.line } : { t: 'Subscript', e: e, index: idx.index, line: t.line };
      } else if (t.v === '.') {
        this.p++;
        e = { t: 'Attribute', e: e, name: this.expectName(), line: t.line };
      } else return e;
    }
  };
  P.sliceOrIndex = function () {
    var lo = null, hi = null, step = null, isSlice = false;
    if (!this.isOp(':')) lo = this.expr();
    if (this.eatOp(':')) {
      isSlice = true;
      if (!this.isOp(']') && !this.isOp(':')) hi = this.expr();
      if (this.eatOp(':')) { if (!this.isOp(']')) step = this.expr(); }
    }
    if (!isSlice && this.isOp(',')) { var items = [lo]; while (this.eatOp(',')) { if (this.isOp(']')) break; items.push(this.expr()); } return { index: { t: 'Tuple', items: items, line: lo.line } }; }
    return isSlice ? { slice: true, lo: lo, hi: hi, step: step } : { index: lo };
  };
  P.atom = function () {
    var t = this.next(), line = t.line;
    switch (t.t) {
      case 'NUM': return { t: 'Const', v: t.v, line: line };
      case 'STR': {
        var s = t.v;
        while (this.peek().t === 'STR') s += this.next().v;                 // "a" "b" concatenation
        return { t: 'Const', v: s, line: line };
      }
      case 'FSTRING': return this.fstring(t.v, line);
      case 'NAME': return { t: 'Name', name: t.v, line: line };
      case 'KW':
        if (t.v === 'True') return { t: 'Const', v: true, line: line };
        if (t.v === 'False') return { t: 'Const', v: false, line: line };
        if (t.v === 'None') return { t: 'Const', v: null, line: line };
        break;
      case 'OP':
        if (t.v === '(') {
          if (this.eatOp(')')) return { t: 'Tuple', items: [], line: line };
          var first = this.expr();
          if (this.isKw('for')) throw this.fail('generator expressions are not supported');
          if (this.isOp(',')) {
            var items = [first];
            while (this.eatOp(',')) { if (this.isOp(')')) break; items.push(this.expr()); }
            this.expectOp(')');
            return { t: 'Tuple', items: items, line: line };
          }
          this.expectOp(')');
          return first;
        }
        if (t.v === '[') {
          var els = [];
          if (!this.isOp(']')) {
            var f = this.expr();
            if (this.isKw('for')) {                                           // [x for x in xs if cond]
              var comp = this.comprehension(f);
              this.expectOp(']');
              comp.line = line;
              return comp;
            }
            els.push(f);
            while (this.eatOp(',')) { if (this.isOp(']')) break; els.push(this.expr()); }
          }
          this.expectOp(']');
          return { t: 'List', items: els, line: line };
        }
        if (t.v === '{') {
          var keys = [], vals = [];
          while (!this.isOp('}')) {
            var k = this.expr();
            if (this.eatOp(':')) { keys.push(k); vals.push(this.expr()); }
            else { keys.push(null); vals.push(k); }                          // a set: not supported below
            if (!this.eatOp(',')) break;
          }
          this.expectOp('}');
          if (keys.length && keys[0] === null) throw syntax('sets are not supported', line);
          return { t: 'Dict', keys: keys, vals: vals, line: line };
        }
    }
    this.p--;
    throw this.fail('invalid syntax');
  };
  P.comprehension = function (elt) {
    this.expectKw('for');
    var target = this.targetList();
    this.expectKw('in');
    var iter = this.orExpr(), cond = null;
    if (this.eatKw('if')) cond = this.orExpr();
    return { t: 'ListComp', elt: elt, target: target, iter: iter, cond: cond };
  };
  P.fstring = function (s, line) {
    // split into literal pieces and {expr[!r][:spec]} fields
    var parts = [], i = 0, lit = '';
    while (i < s.length) {
      var c = s[i];
      if (c === '{') {
        if (s[i + 1] === '{') { lit += '{'; i += 2; continue; }
        if (lit) { parts.push({ t: 'Const', v: lit, line: line }); lit = ''; }
        var depth = 1, j = i + 1, spec = null, conv = null, exprEnd = -1;
        while (j < s.length && depth > 0) {
          var d = s[j];
          if (d === '{') depth++;
          else if (d === '}') { depth--; if (depth === 0) break; }
          else if (depth === 1 && d === ':' && exprEnd < 0) { exprEnd = j; }
          else if (depth === 1 && d === '!' && s[j + 1] !== '=' && exprEnd < 0) { exprEnd = j; conv = s[j + 1]; }
          j++;
        }
        if (depth > 0) throw syntax('f-string: expecting }', line);
        var inner = s.slice(i + 1, j), exprText = inner;
        if (exprEnd >= 0) { exprText = s.slice(i + 1, exprEnd); var rest = s.slice(exprEnd, j); if (rest[0] === '!') { rest = rest.slice(2); } if (rest[0] === ':') spec = rest.slice(1); }
        var sub = new Parser(tokenize(exprText.trim()));
        var ex = sub.exprList();
        parts.push({ t: 'FormatValue', e: ex, spec: spec, conv: conv, line: line });
        i = j + 1; continue;
      }
      if (c === '}') { if (s[i + 1] === '}') { lit += '}'; i += 2; continue; } throw syntax("f-string: single '}' is not allowed", line); }
      lit += c; i++;
    }
    if (lit) parts.push({ t: 'Const', v: lit, line: line });
    return { t: 'JoinedStr', parts: parts, line: line };
  };

  /* ---------- analysis: which nodes contain an await / a loop (they need the slow, suspendable path) */
  function markAwait(n) {
    if (!n || typeof n !== 'object') return false;
    if (Array.isArray(n)) { var any = false; for (var i = 0; i < n.length; i++) if (markAwait(n[i])) any = true; return any; }
    if (n.t === undefined) {                                            // plain objects inside nodes (keyword args, params)
      var anyp = false;
      for (var k in n) if (markAwait(n[k])) anyp = true;
      return anyp;
    }
    var has = n.t === 'Await';
    for (var key in n) {
      if (key === 't' || key === 'line') continue;
      if (n.t === 'Def' || n.t === 'Lambda') { if (key === 'body' || key === 'params') { markAwait(n[key]); continue; } }
      if (markAwait(n[key])) has = true;
    }
    n.hasAwait = has;
    if (n.t === 'Def' || n.t === 'Lambda') return false;               // the await belongs to the function body, not to the definition
    return has;
  }
  function markSync(stmts) {
    // a statement is "sync" when running it can neither suspend nor loop for long
    var all = true;
    stmts.forEach(function (s) {
      var ok = !s.hasAwait && s.t !== 'While' && s.t !== 'For';
      if (s.t === 'If') { var a = markSync(s.body), b = markSync(s.orelse); ok = !s.hasAwait && a && b; }
      else if (s.t === 'While' || s.t === 'For') { markSync(s.body); markSync(s.orelse); }
      else if (s.t === 'Def') markSync(s.body);
      s.sync = ok;
      if (!ok) all = false;
    });
    return all;
  }
  function markLambdas(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(markLambdas); return; }
    if (n.t === 'Def') markSync(n.body);
    for (var k in n) if (k !== 'line') markLambdas(n[k]);
  }
  /* names assigned inside a function (= its locals) unless declared global */
  function collectLocals(fn) {
    var locals = {}, globals = {};
    function target(t) {
      if (t.t === 'Name') locals[t.name] = 1;
      else if (t.t === 'Tuple' || t.t === 'List') t.items.forEach(target);
    }
    function walk(stmts) {
      stmts.forEach(function (s) {
        switch (s.t) {
          case 'Global': s.names.forEach(function (n) { globals[n] = 1; }); break;
          case 'Assign': s.targets.forEach(target); break;
          case 'AugAssign': target(s.target); break;
          case 'For': target(s.target); walk(s.body); walk(s.orelse); break;
          case 'While': case 'If': walk(s.body); walk(s.orelse); break;
          case 'Def': locals[s.name] = 1; break;
          case 'Import': s.items.forEach(function (it) { locals[(it.as || it.name).split('.')[0]] = 1; }); break;
          case 'ImportFrom': if (s.names !== '*') s.names.forEach(function (it) { locals[it.as || it.name] = 1; }); break;
        }
      });
    }
    walk(fn.body);
    fn.params.forEach(function (p) { locals[p.name] = 1; });
    for (var g in globals) delete locals[g];
    return { locals: locals, globals: globals };
  }
  function analyseDefs(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(analyseDefs); return; }
    if (n.t === 'Def') n.scope = collectLocals(n);
    else if (n.t === 'Lambda') { var lp = {}; n.params.forEach(function (p) { lp[p.name] = 1; }); n.scope = { locals: lp, globals: {} }; }
    for (var k in n) if (k !== 'line' && k !== 'scope') analyseDefs(n[k]);
  }

  function compile(src) {
    var ast = new Parser(tokenize(src)).program();
    markAwait(ast);
    markSync(ast.body);
    markLambdas(ast);
    analyseDefs(ast);
    return ast;
  }

  /* ================================================================================================ values */
  function PyDict() { this.m = new Map(); }
  function PyRange(a, b, s) { this.a = a; this.b = b; this.s = s; }
  PyRange.prototype.len = function () { var n = Math.ceil((this.b - this.a) / this.s); return n > 0 ? n : 0; };
  function PyTuple(items) { this.items = items; }
  function PyModule(name, attrs) { this.name = name; this.attrs = attrs; }
  function PyFunction(def, closure, interp) { this.def = def; this.closure = closure; this.interp = interp; this.name = def.name || '<lambda>'; }
  function PyCoroutine(gen) { this.gen = gen; this.started = false; }
  function Cell() {}
  /** what an `await` hands to the scheduler: sleep for `sec`, or only give the others a turn */
  function Sleep(sec) { this.$await = 'sleep'; this.sec = sec; }
  function Tick() { this.$await = 'tick'; }
  var TICK = new Tick();

  function typeName(v) {
    if (v === null || v === undefined) return 'NoneType';
    switch (typeof v) {
      case 'number': return Number.isInteger(v) ? 'int' : 'float';
      case 'string': return 'str';
      case 'boolean': return 'bool';
      case 'function': return 'function';
    }
    if (Array.isArray(v)) return 'list';
    if (v instanceof PyTuple) return 'tuple';
    if (v instanceof PyDict) return 'dict';
    if (v instanceof PyFunction) return 'function';
    if (v instanceof PyModule) return 'module';
    if (v instanceof PyRange) return 'range';
    if (v instanceof PyCoroutine) return 'coroutine';
    if (v.$type) return v.$type;
    return 'object';
  }

  function floatRepr(v) {
    if (v !== v) return 'nan';
    if (v === Infinity) return 'inf';
    if (v === -Infinity) return '-inf';
    if (Number.isInteger(v) && Math.abs(v) < 1e16) return String(v);
    var a = Math.abs(v);
    if (a !== 0 && (a < 1e-4 || a >= 1e16)) {
      var e = v.toExponential().replace(/e([+-])(\d)$/, 'e$10$2');
      return e.replace('e+', 'e+');
    }
    return String(v);
  }
  function repr(v) {
    if (typeof v === 'string') {
      var q = v.indexOf("'") >= 0 && v.indexOf('"') < 0 ? '"' : "'";
      return q + v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(q === "'" ? /'/g : /"/g, '\\' + q) + q;
    }
    return str(v);
  }
  function str(v) {
    if (v === null || v === undefined) return 'None';
    switch (typeof v) {
      case 'boolean': return v ? 'True' : 'False';
      case 'number': return floatRepr(v);
      case 'string': return v;
      case 'function': return '<function ' + (v.name || 'native') + '>';
    }
    if (Array.isArray(v)) return '[' + v.map(repr).join(', ') + ']';
    if (v instanceof PyTuple) return '(' + v.items.map(repr).join(', ') + (v.items.length === 1 ? ',)' : ')');
    if (v instanceof PyDict) { var o = []; v.m.forEach(function (val, k) { o.push(repr(k.$k !== undefined ? k.$k : k) + ': ' + repr(val)); }); return '{' + o.join(', ') + '}'; }
    if (v instanceof PyFunction) return '<function ' + v.name + '>';
    if (v instanceof PyModule) return "<module '" + v.name + "'>";
    if (v instanceof PyRange) return 'range(' + v.a + ', ' + v.b + (v.s !== 1 ? ', ' + v.s : '') + ')';
    if (v.$str) return v.$str();
    return '<' + typeName(v) + ' object>';
  }
  function truthy(v) {
    if (v === null || v === undefined || v === false || v === 0 || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    if (v instanceof PyTuple) return v.items.length > 0;
    if (v instanceof PyDict) return v.m.size > 0;
    if (v instanceof PyRange) return v.len() > 0;
    if (v && v.$bool) return v.$bool();
    return true;
  }
  function eq(a, b) {
    if (a === b) return true;
    if (a === null || b === null || a === undefined || b === undefined) return false;
    var ta = typeof a, tb = typeof b;
    if ((ta === 'number' || ta === 'boolean') && (tb === 'number' || tb === 'boolean')) return Number(a) === Number(b);
    if (Array.isArray(a) && Array.isArray(b)) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (!eq(a[i], b[i])) return false; return true; }
    if (a instanceof PyTuple && b instanceof PyTuple) return eq(a.items, b.items);
    if (a instanceof PyDict && b instanceof PyDict) {
      if (a.m.size !== b.m.size) return false;
      var same = true;
      a.m.forEach(function (v, k) { if (!b.m.has(k) || !eq(v, b.m.get(k))) same = false; });
      return same;
    }
    return false;
  }
  function cmp(a, b, opName) {
    var ta = typeof a, tb = typeof b;
    if ((ta === 'number' || ta === 'boolean') && (tb === 'number' || tb === 'boolean')) { a = Number(a); b = Number(b); return a < b ? -1 : a > b ? 1 : 0; }
    if (ta === 'string' && tb === 'string') return a < b ? -1 : a > b ? 1 : 0;
    var la = Array.isArray(a) ? a : a instanceof PyTuple ? a.items : null, lb = Array.isArray(b) ? b : b instanceof PyTuple ? b.items : null;
    if (la && lb) {
      for (var i = 0; i < Math.min(la.length, lb.length); i++) { var c = cmp(la[i], lb[i], opName); if (c) return c; }
      return la.length - lb.length;
    }
    throw err('TypeError', "'" + opName + "' not supported between instances of '" + typeName(a) + "' and '" + typeName(b) + "'");
  }
  var TUPLE_KEYS = new Map();                      // the same tuple must always give the same Map key
  function hashKey(k) {
    if (typeof k === 'boolean') return k ? 1 : 0;
    if (k instanceof PyTuple) {
      var id = str(k), o = TUPLE_KEYS.get(id);
      if (!o) { o = { $k: k, toString: function () { return 'T' + id; } }; TUPLE_KEYS.set(id, o); if (TUPLE_KEYS.size > 2000) TUPLE_KEYS.delete(TUPLE_KEYS.keys().next().value); }
      return o;
    }
    if (Array.isArray(k) || k instanceof PyDict) throw err('TypeError', "unhashable type: '" + typeName(k) + "'");
    return k;
  }

  function toNumber(v, what) {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    throw err('TypeError', (what || 'operand') + " must be a number, not '" + typeName(v) + "'");
  }

  function roundHalfEven(x, nd) {
    nd = nd || 0;
    if (!isFinite(x)) return x;
    if (nd <= 0) {
      var k = Math.pow(10, -nd), y = x / k, r = Math.round(y);
      if (Math.abs(y % 1) === 0.5) r = 2 * Math.round(y / 2);
      return r * k;
    }
    // decide on the exact binary value, like CPython: 2.675 is really 2.67499999..., so it rounds down
    var s = Math.abs(x).toFixed(Math.min(100, nd + 40)), dot = s.indexOf('.'), tail = s.slice(dot + 1 + nd);
    var fixed = Number(x.toFixed(Math.min(nd, 100)));
    if (/^50*$/.test(tail)) {                                 // an exact tie: go to the even neighbour
      var lastDigit = Number(s.charAt(dot + nd) === '.' ? s.charAt(dot - 1) : s.charAt(dot + nd));
      var down = Number(Math.abs(x).toFixed(nd + 1).slice(0, -1) || 0);
      var q = Math.pow(10, nd), base = Math.floor(Math.abs(x) * q) / q;
      var res = lastDigit % 2 === 0 ? base : base + 1 / q;
      return Number((x < 0 ? -res : res).toFixed(nd));
    }
    return fixed;
  }

  /* ---------- string formatting: str.format, f-string specs, the % operator */
  function formatSpec(v, spec) {
    if (!spec) return str(v);
    var m = /^(?:(.)?([<>^=]))?([+\- ])?(0)?(\d+)?(,)?(?:\.(\d+))?([bdeEfFgGnosxX%])?$/.exec(spec);
    if (!m) throw err('ValueError', 'Invalid format specifier');
    var fill = m[1] || (m[4] ? '0' : ' '), align = m[2] || (m[4] ? '=' : (typeof v === 'number' ? '>' : '<')), sign = m[3] || '-';
    var width = m[5] ? +m[5] : 0, prec = m[7] !== undefined ? +m[7] : null, type = m[8] || '', body;
    if (typeof v === 'boolean') v = v ? 1 : 0;
    if (type === 'f' || type === 'F') body = Math.abs(toNumber(v)).toFixed(prec === null ? 6 : prec);
    else if (type === 'd' || type === 'n') body = String(Math.abs(Math.trunc(toNumber(v))));
    else if (type === 'e' || type === 'E') body = Math.abs(v).toExponential(prec === null ? 6 : prec).replace(/e([+-])(\d)$/, 'e$10$2');
    else if (type === 'x') body = Math.abs(Math.trunc(v)).toString(16);
    else if (type === 'X') body = Math.abs(Math.trunc(v)).toString(16).toUpperCase();
    else if (type === 'b') body = Math.abs(Math.trunc(v)).toString(2);
    else if (type === '%') body = (Math.abs(v) * 100).toFixed(prec === null ? 6 : prec) + '%';
    else if (type === 's' || (type === '' && typeof v !== 'number')) { body = str(v); if (prec !== null) body = body.slice(0, prec); }
    else if (typeof v === 'number') { body = prec !== null ? String(+Math.abs(v).toPrecision(prec)) : floatRepr(Math.abs(v)); }
    else body = str(v);
    if (m[6] && typeof v === 'number') body = body.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var neg = typeof v === 'number' && (v < 0 || Object.is(v, -0)) && type !== 's';
    var sgn = neg ? '-' : (sign === '+' ? '+' : sign === ' ' ? ' ' : '');
    if (typeof v !== 'number') sgn = '';
    var total = sgn.length + body.length;
    if (total >= width) return sgn + body;
    var pad = width - total, padS = new Array(pad + 1).join(fill);
    if (align === '<') return sgn + body + padS;
    if (align === '^') { var l = Math.floor(pad / 2); return new Array(l + 1).join(fill) + sgn + body + new Array(pad - l + 1).join(fill); }
    if (align === '=') return sgn + padS + body;
    return padS + sgn + body;
  }
  function strFormat(fmt, args, kwargs) {
    var auto = 0;
    return fmt.replace(/\{\{|\}\}|\{([^{}!:]*)(?:!([rs]))?(?::([^{}]*))?\}/g, function (all, name, conv, spec) {
      if (all === '{{') return '{'; if (all === '}}') return '}';
      var v;
      if (name === '' || name === undefined) v = args[auto++];
      else if (/^\d+$/.test(name)) v = args[+name];
      else v = kwargs && Object.prototype.hasOwnProperty.call(kwargs, name) ? kwargs[name] : undefined;
      if (v === undefined) throw err('IndexError', 'Replacement index out of range for format()');
      if (conv === 'r') v = repr(v);
      return formatSpec(v, spec || '');
    });
  }
  function percentFormat(fmt, arg) {
    var args = arg instanceof PyTuple ? arg.items : [arg], i = 0;
    return fmt.replace(/%(?:\(([^)]*)\))?([-+ 0#]*)(\d+)?(?:\.(\d+))?([sdifrxXeEgGc%])/g, function (all, key, flags, width, prec, type) {
      if (type === '%') return '%';
      var v = key !== undefined && arg instanceof PyDict ? arg.m.get(key) : args[i++];
      if (v === undefined) throw err('TypeError', 'not enough arguments for format string');
      var spec = (flags.indexOf('-') >= 0 ? '<' : '') + (flags.indexOf('+') >= 0 ? '+' : '') + (flags.indexOf('0') >= 0 && flags.indexOf('-') < 0 ? '0' : '') + (width || '') + (prec !== undefined ? '.' + prec : '');
      if (type === 'i') type = 'd';
      if (type === 'r') return formatSpec(repr(v), spec + 's');
      if (type === 's') return formatSpec(str(v), spec + 's');
      if (type === 'c') return typeof v === 'number' ? String.fromCharCode(v) : String(v);
      if (type === 'd') v = Math.trunc(toNumber(v));
      return formatSpec(v, spec + type);
    });
  }

  /* ---------- iteration: a JS iterator for anything iterable in Python */
  function iterate(v) {
    if (Array.isArray(v)) return v[Symbol.iterator]();
    if (v instanceof PyTuple) return v.items[Symbol.iterator]();
    if (typeof v === 'string') return v[Symbol.iterator]();
    if (v instanceof PyDict) { var ks = []; v.m.forEach(function (x, k) { ks.push(k.$k !== undefined ? k.$k : k); }); return ks[Symbol.iterator](); }
    if (v instanceof PyRange) {
      return (function* () { if (v.s > 0) { for (var x = v.a; x < v.b; x += v.s) yield x; } else for (var y = v.a; y > v.b; y += v.s) yield y; })();
    }
    if (v && typeof v.$iter === 'function') return v.$iter();
    throw err('TypeError', "'" + typeName(v) + "' object is not iterable");
  }
  function toList(v) { if (Array.isArray(v)) return v.slice(); return Array.from(iterate(v)); }

  /* ---------- methods of the built-in types */
  function pyIndex(i, n, what) {
    i = toNumber(i, 'index');
    if (!Number.isInteger(i)) throw err('TypeError', what + ' indices must be integers');
    var k = i < 0 ? i + n : i;
    if (k < 0 || k >= n) throw err('IndexError', what + ' index out of range');
    return k;
  }
  function sliceBounds(n, lo, hi, step) {
    step = step === null || step === undefined ? 1 : toNumber(step);
    if (step === 0) throw err('ValueError', 'slice step cannot be zero');
    function cl(v, def, lowEnd, highEnd) {
      if (v === null || v === undefined) return def;
      v = toNumber(v);
      if (v < 0) v += n;
      return Math.min(Math.max(v, lowEnd), highEnd);
    }
    var a, b;
    if (step > 0) { a = cl(lo, 0, 0, n); b = cl(hi, n, 0, n); } else { a = cl(lo, n - 1, -1, n - 1); b = cl(hi, -1, -1, n - 1); if (hi === null || hi === undefined) b = -1; }
    return { a: a, b: b, step: step };
  }
  function sliceSeq(seq, lo, hi, step) {
    var s = sliceBounds(seq.length, lo, hi, step), out = [];
    if (s.step > 0) for (var i = s.a; i < s.b; i += s.step) out.push(seq[i]); else for (var j = s.a; j > s.b; j += s.step) out.push(seq[j]);
    return out;
  }
  function strMethod(s, name) {
    switch (name) {
      case 'upper': return function () { return s.toUpperCase(); };
      case 'lower': return function () { return s.toLowerCase(); };
      case 'capitalize': return function () { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); };
      case 'title': return function () { return s.toLowerCase().replace(/(^|[^A-Za-zА-Яа-яЁё0-9])([A-Za-zА-Яа-яЁё])/g, function (m, a, b) { return a + b.toUpperCase(); }); };
      case 'strip': return function (c) { return c === undefined || c === null ? s.trim() : stripChars(s, c, true, true); };
      case 'lstrip': return function (c) { return c === undefined || c === null ? s.replace(/^\s+/, '') : stripChars(s, c, true, false); };
      case 'rstrip': return function (c) { return c === undefined || c === null ? s.replace(/\s+$/, '') : stripChars(s, c, false, true); };
      case 'split': return function (sep, maxsplit) {
        if (sep === undefined || sep === null) return s.trim() === '' ? [] : s.trim().split(/\s+/);
        var parts = s.split(sep);
        if (maxsplit !== undefined && maxsplit >= 0 && parts.length > maxsplit + 1) parts = parts.slice(0, maxsplit).concat([parts.slice(maxsplit).join(sep)]);
        return parts;
      };
      case 'splitlines': return function () { return s.split(/\r?\n/); };
      case 'join': return function (it) { return toList(it).map(function (x) { if (typeof x !== 'string') throw err('TypeError', 'sequence item: expected str instance, ' + typeName(x) + ' found'); return x; }).join(s); };
      case 'replace': return function (a, b, cnt) { if (cnt === undefined || cnt < 0) return s.split(a).join(b); var out = s; for (var i = 0; i < cnt; i++) out = out.replace(a, b); return out; };
      case 'find': return function (x) { return s.indexOf(x); };
      case 'rfind': return function (x) { return s.lastIndexOf(x); };
      case 'index': return function (x) { var i = s.indexOf(x); if (i < 0) throw err('ValueError', 'substring not found'); return i; };
      case 'count': return function (x) { return x === '' ? s.length + 1 : s.split(x).length - 1; };
      case 'startswith': return function (x) { return (x instanceof PyTuple ? x.items : [x]).some(function (p) { return s.startsWith(p); }); };
      case 'endswith': return function (x) { return (x instanceof PyTuple ? x.items : [x]).some(function (p) { return s.endsWith(p); }); };
      case 'isdigit': return function () { return /^[0-9]+$/.test(s); };
      case 'isalpha': return function () { return /^[A-Za-zА-Яа-яЁё]+$/.test(s); };
      case 'isalnum': return function () { return /^[A-Za-zА-Яа-яЁё0-9]+$/.test(s); };
      case 'isspace': return function () { return /^\s+$/.test(s); };
      case 'isupper': return function () { return s !== s.toLowerCase() && s === s.toUpperCase(); };
      case 'islower': return function () { return s !== s.toUpperCase() && s === s.toLowerCase(); };
      case 'zfill': return function (w) { var sg = /^[+-]/.test(s) ? s[0] : ''; var b = sg ? s.slice(1) : s; while (b.length + sg.length < w) b = '0' + b; return sg + b; };
      case 'center': return function (w, f) { f = f || ' '; var pad = w - s.length; if (pad <= 0) return s; var l = Math.floor(pad / 2); return new Array(l + 1).join(f) + s + new Array(pad - l + 1).join(f); };
      case 'ljust': return function (w, f) { f = f || ' '; return s.length >= w ? s : s + new Array(w - s.length + 1).join(f); };
      case 'rjust': return function (w, f) { f = f || ' '; return s.length >= w ? s : new Array(w - s.length + 1).join(f) + s; };
      case 'format': { var fn = function (args, kw) { return strFormat(s, args, kw); }; fn.$raw = true; return fn; }
    }
    return undefined;
  }
  function stripChars(s, chars, left, right) {
    var a = 0, b = s.length;
    if (left) while (a < b && chars.indexOf(s[a]) >= 0) a++;
    if (right) while (b > a && chars.indexOf(s[b - 1]) >= 0) b--;
    return s.slice(a, b);
  }
  function listMethod(l, name, interp) {
    switch (name) {
      case 'append': return function (x) { l.push(x); return null; };
      case 'extend': return function (it) { toList(it).forEach(function (x) { l.push(x); }); return null; };
      case 'insert': return function (i, x) { i = toNumber(i); if (i < 0) i = Math.max(0, i + l.length); l.splice(Math.min(i, l.length), 0, x); return null; };
      case 'pop': return function (i) { if (!l.length) throw err('IndexError', 'pop from empty list'); var k = i === undefined ? l.length - 1 : pyIndex(i, l.length, 'pop'); return l.splice(k, 1)[0]; };
      case 'remove': return function (x) { for (var i = 0; i < l.length; i++) if (eq(l[i], x)) { l.splice(i, 1); return null; } throw err('ValueError', 'list.remove(x): x not in list'); };
      case 'clear': return function () { l.length = 0; return null; };
      case 'index': return function (x) { for (var i = 0; i < l.length; i++) if (eq(l[i], x)) return i; throw err('ValueError', str(x) + ' is not in list'); };
      case 'count': return function (x) { var n = 0; l.forEach(function (y) { if (eq(x, y)) n++; }); return n; };
      case 'reverse': return function () { l.reverse(); return null; };
      case 'copy': return function () { return l.slice(); };
      case 'sort': { var f = function (args, kw) { sortList(l, kw && kw.key, kw && truthy(kw.reverse), interp); return null; }; f.$raw = true; return f; }
    }
    return undefined;
  }
  function sortList(l, key, reverse, interp) {
    var keyed = l.map(function (x) { return { k: key ? interp.callValue(key, [x], null) : x, v: x }; });
    keyed.sort(function (a, b) { return cmp(a.k, b.k, '<'); });
    if (reverse) { keyed.reverse(); }
    for (var i = 0; i < l.length; i++) l[i] = keyed[i].v;
  }
  function dictMethod(d, name) {
    switch (name) {
      case 'get': return function (k, def) { k = hashKey(k); return d.m.has(k) ? d.m.get(k) : (def === undefined ? null : def); };
      case 'keys': return function () { return toList(d); };
      case 'values': return function () { return Array.from(d.m.values()); };
      case 'items': return function () { var o = []; d.m.forEach(function (v, k) { o.push(new PyTuple([k.$k !== undefined ? k.$k : k, v])); }); return o; };
      case 'pop': return function (k, def) { k = hashKey(k); if (d.m.has(k)) { var v = d.m.get(k); d.m.delete(k); return v; } if (def === undefined) throw err('KeyError', repr(k)); return def; };
      case 'update': return function (o) { if (o instanceof PyDict) o.m.forEach(function (v, k) { d.m.set(k, v); }); return null; };
      case 'clear': return function () { d.m.clear(); return null; };
      case 'copy': return function () { var n = new PyDict(); d.m.forEach(function (v, k) { n.m.set(k, v); }); return n; };
      case 'setdefault': return function (k, def) { k = hashKey(k); if (!d.m.has(k)) d.m.set(k, def === undefined ? null : def); return d.m.get(k); };
    }
    return undefined;
  }

  /* ================================================================================================ scopes */
  function Scope(parent, fnScope) {
    this.vars = Object.create(null);
    this.parent = parent || null;           // enclosing function scope (closure), module scope is the root
    this.fn = fnScope || null;              // {locals, globals} of the function being run
  }
  Scope.prototype.root = function () { var s = this; while (s.parent) s = s.parent; return s; };

  /* ================================================================================================ interpreter */
  var RUN_LIMIT = 4e6;                       // statements in one go without a pause: after that the program is considered hung

  function Interp(opts) {
    opts = opts || {};
    this.out = opts.print || function () {};
    this.modules = opts.modules || {};
    this.globals = new Scope(null, null);
    this.steps = 0;
    this.loopTicks = 0;
    this.sliceIter = opts.sliceIter || 300;
    this.line = 0;
    this.builtins = this.makeBuiltins();
    this.onLine = opts.onLine || null;
    var self = this;
    this.defaultModules();
    this.modules.__self = this;
  }
  var I = Interp.prototype;

  I.rt = function (type, msg, line) { var e = new PyError(type, msg, line || this.line); return e; };

  I.defaultModules = function () {
    var self = this, M = Math;
    function fnum(f) { return function (x) { return f(toNumber(x)); }; }
    if (!this.modules.math) this.modules.math = new PyModule('math', {
      pi: M.PI, e: M.E, tau: 2 * M.PI, inf: Infinity, nan: NaN,
      sqrt: function (x) { x = toNumber(x); if (x < 0) throw err('ValueError', 'math domain error'); return M.sqrt(x); },
      sin: fnum(M.sin), cos: fnum(M.cos), tan: fnum(M.tan), asin: fnum(M.asin), acos: fnum(M.acos), atan: fnum(M.atan),
      atan2: function (y, x) { return M.atan2(toNumber(y), toNumber(x)); },
      exp: fnum(M.exp), fabs: fnum(M.abs), floor: fnum(M.floor), ceil: fnum(M.ceil), trunc: fnum(M.trunc),
      log: function (x, b) { x = toNumber(x); if (x <= 0) throw err('ValueError', 'math domain error'); return b === undefined ? M.log(x) : M.log(x) / M.log(b); },
      log10: function (x) { x = toNumber(x); if (x <= 0) throw err('ValueError', 'math domain error'); return M.log10(x); },
      log2: function (x) { x = toNumber(x); if (x <= 0) throw err('ValueError', 'math domain error'); return M.log2(x); },
      pow: function (a, b) { return M.pow(toNumber(a), toNumber(b)); },
      radians: function (d) { return toNumber(d) * M.PI / 180; },
      degrees: function (r) { return toNumber(r) * 180 / M.PI; },
      hypot: function (a, b) { return M.hypot(toNumber(a), toNumber(b)); },
      isnan: function (x) { return x !== x; }, isinf: function (x) { return x === Infinity || x === -Infinity; },
      fmod: function (a, b) { return toNumber(a) % toNumber(b); }
    });
    var seed = (opts_seed() >>> 0) || 1;
    function opts_seed() { return Date.now() & 0x7fffffff; }
    function rnd() { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; }
    if (!this.modules.random) this.modules.random = new PyModule('random', {
      random: function () { return rnd(); },
      randint: function (a, b) { a = toNumber(a); b = toNumber(b); if (b < a) throw err('ValueError', 'empty range for randint()'); return a + Math.floor(rnd() * (b - a + 1)); },
      randrange: function (a, b, s) { if (b === undefined) { b = a; a = 0; } s = s || 1; var n = Math.ceil((b - a) / s); if (n <= 0) throw err('ValueError', 'empty range for randrange()'); return a + s * Math.floor(rnd() * n); },
      uniform: function (a, b) { return a + rnd() * (b - a); },
      choice: function (seq) { var l = toList(seq); if (!l.length) throw err('IndexError', 'Cannot choose from an empty sequence'); return l[Math.floor(rnd() * l.length)]; },
      shuffle: function (l) { for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = l[i]; l[i] = l[j]; l[j] = t; } return null; },
      seed: function (s) { seed = ((s === undefined || s === null ? Date.now() : toNumber(s)) >>> 0) || 1; return null; }
    });
    if (!this.modules.time) this.modules.time = new PyModule('time', {
      sleep: function () { throw err('RuntimeError', 'time.sleep() blocks everything: use  await qbit.wait(seconds)'); },
      time: function () { return Date.now() / 1000; },
      ticks_ms: function () { return Math.floor(Date.now() % 0x3fffffff); }
    });
  };

  I.makeBuiltins = function () {
    var self = this, b = Object.create(null);
    b.print = function (args, kw) {
      var sep = kw && kw.sep !== undefined && kw.sep !== null ? kw.sep : ' ', end = kw && kw.end !== undefined && kw.end !== null ? kw.end : '\n';
      self.out(args.map(str).join(sep), end);
      return null;
    };
    b.print.$raw = true;
    b.len = function (x) {
      if (typeof x === 'string' || Array.isArray(x)) return x.length;
      if (x instanceof PyTuple) return x.items.length;
      if (x instanceof PyDict) return x.m.size;
      if (x instanceof PyRange) return x.len();
      throw err('TypeError', "object of type '" + typeName(x) + "' has no len()");
    };
    b.str = function (x) { return x === undefined ? '' : str(x); };
    b.repr = repr;
    b.int = function (x, base) {
      if (x === undefined) return 0;
      if (typeof x === 'number') { if (x !== x || x === Infinity || x === -Infinity) throw err('ValueError', 'cannot convert float ' + floatRepr(x) + ' to integer'); return Math.trunc(x); }
      if (typeof x === 'boolean') return x ? 1 : 0;
      if (typeof x === 'string') {
        var t = x.trim(), v = base ? parseInt(t, base) : (/^[+-]?\d+$/.test(t.replace(/_/g, '')) ? parseInt(t.replace(/_/g, ''), 10) : NaN);
        if (isNaN(v)) throw err('ValueError', 'invalid literal for int() with base ' + (base || 10) + ': ' + repr(x));
        return v;
      }
      throw err('TypeError', "int() argument must be a string or a number, not '" + typeName(x) + "'");
    };
    b.float = function (x) {
      if (x === undefined) return 0;
      if (typeof x === 'number') return x;
      if (typeof x === 'boolean') return x ? 1 : 0;
      if (typeof x === 'string') {
        var t = x.trim().toLowerCase();
        if (t === 'inf' || t === '+inf' || t === 'infinity') return Infinity;
        if (t === '-inf') return -Infinity;
        if (t === 'nan') return NaN;
        if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/.test(t)) throw err('ValueError', 'could not convert string to float: ' + repr(x));
        return parseFloat(t);
      }
      throw err('TypeError', "float() argument must be a string or a number, not '" + typeName(x) + "'");
    };
    b.bool = function (x) { return x === undefined ? false : truthy(x); };
    b.abs = function (x) { return Math.abs(toNumber(x, 'abs() argument')); };
    b.round = function (x, nd) {
      x = toNumber(x, 'round() argument');
      if (nd === undefined || nd === null) return roundHalfEven(x, 0);
      return roundHalfEven(x, toNumber(nd));
    };
    b.pow = function (a, c) { return Math.pow(toNumber(a), toNumber(c)); };
    b.divmod = function (a, c) { a = toNumber(a); c = toNumber(c); if (c === 0) throw err('ZeroDivisionError', 'division by zero'); var q = Math.floor(a / c); return new PyTuple([q, a - q * c]); };
    function extreme(name, sign) {
      var f = function (args, kw) {
        var items = args.length === 1 ? toList(args[0]) : args;
        if (!items.length) throw err('ValueError', name + '() arg is an empty sequence');
        var key = kw && kw.key, best = items[0], bk = key ? self.callValue(key, [best], null) : best;
        for (var i = 1; i < items.length; i++) { var k = key ? self.callValue(key, [items[i]], null) : items[i]; if (cmp(k, bk, '<') * sign > 0) { best = items[i]; bk = k; } }
        return best;
      };
      f.$raw = true;
      return f;
    }
    b.min = extreme('min', -1); b.max = extreme('max', 1);
    b.sum = function (it, start) { var s = start === undefined ? 0 : start; toList(it).forEach(function (x) { s = self.binop('+', s, x); }); return s; };
    b.sorted = function (args, kw) { var l = toList(args[0]); sortList(l, kw && kw.key, kw && truthy(kw.reverse), self); return l; };
    b.sorted.$raw = true;
    b.reversed = function (x) { return toList(x).reverse(); };
    b.list = function (x) { return x === undefined ? [] : toList(x); };
    b.tuple = function (x) { return new PyTuple(x === undefined ? [] : toList(x)); };
    b.dict = function (args, kw) { var d = new PyDict(); if (args[0] instanceof PyDict) args[0].m.forEach(function (v, k) { d.m.set(k, v); }); else if (args[0]) toList(args[0]).forEach(function (p) { var it = toList(p); d.m.set(hashKey(it[0]), it[1]); }); if (kw) for (var k in kw) d.m.set(k, kw[k]); return d; };
    b.dict.$raw = true;
    b.range = function (a, c, s) {
      if (c === undefined) { c = a; a = 0; }
      s = s === undefined ? 1 : s;
      [a, c, s].forEach(function (v) { if (typeof v !== 'number' || !Number.isInteger(v)) throw err('TypeError', "'" + typeName(v) + "' object cannot be interpreted as an integer"); });
      if (s === 0) throw err('ValueError', 'range() arg 3 must not be zero');
      return new PyRange(a, c, s);
    };
    b.enumerate = function (it, start) { var i = start === undefined ? 0 : start; return toList(it).map(function (x) { return new PyTuple([i++, x]); }); };
    b.zip = function (args) { var ls = args.map(toList), n = ls.length ? Math.min.apply(null, ls.map(function (l) { return l.length; })) : 0, o = []; for (var i = 0; i < n; i++) o.push(new PyTuple(ls.map(function (l) { return l[i]; }))); return o; };
    b.zip.$raw = true;
    b.any = function (it) { var r = false; toList(it).forEach(function (x) { if (truthy(x)) r = true; }); return r; };
    b.all = function (it) { var r = true; toList(it).forEach(function (x) { if (!truthy(x)) r = false; }); return r; };
    b.chr = function (n) { return String.fromCharCode(toNumber(n)); };
    b.ord = function (s) { if (typeof s !== 'string' || s.length !== 1) throw err('TypeError', 'ord() expected a character'); return s.charCodeAt(0); };
    b.hex = function (n) { n = toNumber(n); return (n < 0 ? '-0x' : '0x') + Math.abs(n).toString(16); };
    b.bin = function (n) { n = toNumber(n); return (n < 0 ? '-0b' : '0b') + Math.abs(n).toString(2); };
    b.isinstance = function (x, t) { var tn = typeName(x), names = (t instanceof PyTuple ? t.items : [t]).map(function (c) { return c && c.$name; }); return names.indexOf(tn) >= 0 || (tn === 'bool' && names.indexOf('int') >= 0); };
    ['int', 'float', 'str', 'bool', 'list', 'tuple', 'dict'].forEach(function (n) { b[n].$name = n; });
    b.type = function (x) { return { $type: 'type', $str: function () { return "<class '" + typeName(x) + "'>"; } }; };
    b.callable = function (x) { return typeof x === 'function' || x instanceof PyFunction; };
    b.id = function () { return 0; };
    b.input = function () { throw err('RuntimeError', 'input() is not available: the board has no keyboard'); };
    b.map = function (f, it) { return toList(it).map(function (x) { return self.callValue(f, [x], null); }); };
    b.filter = function (f, it) { return toList(it).filter(function (x) { return f === null ? truthy(x) : truthy(self.callValue(f, [x], null)); }); };
    b.min.$name = 'min';
    return b;
  };

  /* ---------- operators */
  I.binop = function (op, a, b) {
    switch (op) {
      case '+':
        if (typeof a === 'number' && typeof b === 'number') return a + b;
        if (typeof a === 'string' && typeof b === 'string') return a + b;
        if (Array.isArray(a) && Array.isArray(b)) return a.concat(b);
        if (a instanceof PyTuple && b instanceof PyTuple) return new PyTuple(a.items.concat(b.items));
        if ((typeof a === 'number' || typeof a === 'boolean') && (typeof b === 'number' || typeof b === 'boolean')) return Number(a) + Number(b);
        break;
      case '-': if (isNum(a) && isNum(b)) return Number(a) - Number(b); break;
      case '*':
        if (isNum(a) && isNum(b)) return Number(a) * Number(b);
        if (typeof a === 'string' && typeof b === 'number') return b > 0 ? new Array(b + 1).join(a) : '';
        if (typeof b === 'string' && typeof a === 'number') return a > 0 ? new Array(a + 1).join(b) : '';
        if (Array.isArray(a) && typeof b === 'number') { var o = []; for (var i = 0; i < b; i++) o = o.concat(a); return o; }
        if (Array.isArray(b) && typeof a === 'number') { var o2 = []; for (var j = 0; j < a; j++) o2 = o2.concat(b); return o2; }
        break;
      case '/': if (isNum(a) && isNum(b)) { if (Number(b) === 0) throw err('ZeroDivisionError', 'division by zero'); return Number(a) / Number(b); } break;
      case '//': if (isNum(a) && isNum(b)) { if (Number(b) === 0) throw err('ZeroDivisionError', 'integer division or modulo by zero'); return Math.floor(Number(a) / Number(b)); } break;
      case '%':
        if (typeof a === 'string') return percentFormat(a, b);
        if (isNum(a) && isNum(b)) { if (Number(b) === 0) throw err('ZeroDivisionError', 'integer division or modulo by zero'); var r = Number(a) % Number(b); return r !== 0 && (r < 0) !== (Number(b) < 0) ? r + Number(b) : r; }
        break;
      case '**': if (isNum(a) && isNum(b)) { if (Number(a) === 0 && Number(b) < 0) throw err('ZeroDivisionError', '0.0 cannot be raised to a negative power'); return Math.pow(Number(a), Number(b)); } break;
      case '&': if (isNum(a) && isNum(b)) return Number(a) & Number(b); break;
      case '|': if (isNum(a) && isNum(b)) return Number(a) | Number(b); break;
      case '^': if (isNum(a) && isNum(b)) return Number(a) ^ Number(b); break;
      case '<<': if (isNum(a) && isNum(b)) return Number(a) * Math.pow(2, Number(b)); break;
      case '>>': if (isNum(a) && isNum(b)) return Math.floor(Number(a) / Math.pow(2, Number(b))); break;
    }
    throw err('TypeError', "unsupported operand type(s) for " + op + ": '" + typeName(a) + "' and '" + typeName(b) + "'");
  };
  function isNum(v) { return typeof v === 'number' || typeof v === 'boolean'; }

  I.compare = function (op, a, b) {
    switch (op) {
      case '==': return eq(a, b);
      case '!=': return !eq(a, b);
      case '<': return cmp(a, b, '<') < 0;
      case '>': return cmp(a, b, '>') > 0;
      case '<=': return cmp(a, b, '<=') <= 0;
      case '>=': return cmp(a, b, '>=') >= 0;
      case 'is': return a === b || (a === undefined && b === null);
      case 'is not': return !(a === b || (a === undefined && b === null));
      case 'in': return this.contains(b, a);
      case 'not in': return !this.contains(b, a);
    }
    throw err('SystemError', 'bad comparison ' + op);
  };
  I.contains = function (c, x) {
    if (typeof c === 'string') { if (typeof x !== 'string') throw err('TypeError', "'in <string>' requires string as left operand, not " + typeName(x)); return c.indexOf(x) >= 0; }
    if (Array.isArray(c)) return c.some(function (y) { return eq(x, y); });
    if (c instanceof PyTuple) return c.items.some(function (y) { return eq(x, y); });
    if (c instanceof PyDict) return c.m.has(hashKey(x));
    if (c instanceof PyRange) { return typeof x === 'number' && Array.from(iterate(c)).indexOf(x) >= 0; }
    throw err('TypeError', "argument of type '" + typeName(c) + "' is not iterable");
  };

  /* ---------- attribute and subscript access */
  I.getattr = function (o, name) {
    if (o instanceof PyModule) {
      if (name in o.attrs) return o.attrs[name];
      throw err('AttributeError', "module '" + o.name + "' has no attribute '" + name + "'");
    }
    if (typeof o === 'string') { var m = strMethod(o, name); if (m) return m; }
    else if (Array.isArray(o)) { var lm = listMethod(o, name, this); if (lm) return lm; }
    else if (o instanceof PyDict) { var dm = dictMethod(o, name); if (dm) return dm; }
    else if (o instanceof PyTuple) {
      if (name === 'count') return function (x) { var n = 0; o.items.forEach(function (y) { if (eq(x, y)) n++; }); return n; };
      if (name === 'index') return function (x) { for (var i = 0; i < o.items.length; i++) if (eq(o.items[i], x)) return i; throw err('ValueError', 'tuple.index(x): x not in tuple'); };
    } else if (o && typeof o.$get === 'function') return o.$get(name);
    throw err('AttributeError', "'" + typeName(o) + "' object has no attribute '" + name + "'");
  };
  I.setattr = function (o, name, v) {
    if (o && typeof o.$set === 'function') return o.$set(name, v);
    throw err('AttributeError', "'" + typeName(o) + "' object has no attribute '" + name + "' that can be assigned");
  };
  I.subscript = function (o, k) {
    if (Array.isArray(o)) return o[pyIndex(k, o.length, 'list')];
    if (typeof o === 'string') return o[pyIndex(k, o.length, 'string')];
    if (o instanceof PyTuple) return o.items[pyIndex(k, o.items.length, 'tuple')];
    if (o instanceof PyDict) { var hk = hashKey(k); if (!o.m.has(hk)) throw err('KeyError', repr(k)); return o.m.get(hk); }
    if (o instanceof PyRange) { var arr = toList(o); return arr[pyIndex(k, arr.length, 'range')]; }
    throw err('TypeError', "'" + typeName(o) + "' object is not subscriptable");
  };
  I.setSubscript = function (o, k, v) {
    if (Array.isArray(o)) { o[pyIndex(k, o.length, 'list assignment')] = v; return; }
    if (o instanceof PyDict) { o.m.set(hashKey(k), v); return; }
    throw err('TypeError', "'" + typeName(o) + "' object does not support item assignment");
  };

  /* ---------- names */
  I.lookup = function (name, sc) {
    var s = sc;
    if (s.fn) {
      if (name in s.fn.locals) {
        if (name in s.vars) return s.vars[name];
        throw err('UnboundLocalError', "local variable '" + name + "' referenced before assignment");
      }
      // enclosing functions (closures), then globals
      var p = s.parent;
      while (p) { if (p !== this.globals && name in p.vars) return p.vars[name]; p = p.parent; }
    }
    var root = this.globals;
    if (name in root.vars) return root.vars[name];
    if (name in this.builtins) return this.builtins[name];
    if (name in this.modules && name !== '__self') return this.modules[name];
    throw err('NameError', "name '" + name + "' is not defined");
  };
  I.assignName = function (name, v, sc) {
    if (sc.fn && !(name in sc.fn.globals)) { sc.vars[name] = v; return; }
    this.globals.vars[name] = v;
  };

  I.assign = function (target, v, sc) {
    switch (target.t) {
      case 'Name': this.assignName(target.name, v, sc); return;
      case 'Subscript': this.setSubscript(this.ev(target.e, sc), this.ev(target.index, sc), v); return;
      case 'Attribute': this.setattr(this.ev(target.e, sc), target.name, v); return;
      case 'Tuple': case 'List': {
        var items = toList(v);
        if (items.length !== target.items.length) throw err('ValueError', items.length < target.items.length ? 'not enough values to unpack (expected ' + target.items.length + ', got ' + items.length + ')' : 'too many values to unpack (expected ' + target.items.length + ')');
        for (var i = 0; i < items.length; i++) this.assign(target.items[i], items[i], sc);
        return;
      }
    }
    throw err('SyntaxError', 'cannot assign');
  };

  /* ---------- calls */
  I.callValue = function (f, args, kw) {
    if (f instanceof PyFunction) return this.callFunction(f, args, kw);
    if (typeof f === 'function') {
      try {
        if (f.$raw) return f.call(null, args, kw || undefined);
        if (kw && Object.keys(kw).length) throw err('TypeError', (f.name || 'function') + '() takes no keyword arguments');
        return f.apply(null, args);
      } catch (e) {
        if (e && e.name === 'ContractError') throw err('QbitError', e.message);     // a module says no: show it as a program error
        throw e;
      }
    }
    if (f && typeof f.$call === 'function') return f.$call(args, kw || {});
    throw err('TypeError', "'" + typeName(f) + "' object is not callable");
  };
  I.bindParams = function (def, closure, args, kw) {
    var sc = new Scope(closure, def.scope), ps = def.params, i, ai = 0;
    var pos = ps.filter(function (p) { return !p.star; }), starP = ps.filter(function (p) { return p.star === 1; })[0], kwP = ps.filter(function (p) { return p.star === 2; })[0];
    if (args.length > pos.length && !starP) throw err('TypeError', (def.name || '<lambda>') + '() takes ' + pos.length + ' positional argument' + (pos.length === 1 ? '' : 's') + ' but ' + args.length + ' were given');
    for (i = 0; i < pos.length; i++) {
      var p = pos[i];
      if (i < args.length) sc.vars[p.name] = args[i];
      else if (kw && Object.prototype.hasOwnProperty.call(kw, p.name)) { sc.vars[p.name] = kw[p.name]; }
      else if (p.def) sc.vars[p.name] = p.defVal !== undefined ? p.defVal : (p.defVal = this.ev(p.def, closure || this.globals));
      else throw err('TypeError', (def.name || '<lambda>') + "() missing required argument: '" + p.name + "'");
    }
    if (starP) sc.vars[starP.name] = new PyTuple(args.slice(pos.length));
    if (kwP) { var d = new PyDict(); if (kw) for (var k in kw) if (!pos.some(function (q) { return q.name === k; })) d.m.set(k, kw[k]); sc.vars[kwP.name] = d; }
    else if (kw) for (var k2 in kw) if (!pos.some(function (q) { return q.name === k2; })) throw err('TypeError', (def.name || '<lambda>') + "() got an unexpected keyword argument '" + k2 + "'");
    return sc;
  };
  I.callFunction = function (f, args, kw) {
    var def = f.def, sc = this.bindParams(def, f.closure, args, kw), self = this;
    if (def.t === 'Lambda') return this.ev(def.body, sc);
    if (def.async) return new PyCoroutine(this.execBody(def.body, sc));
    var line = this.line;
    var r = this.runSync(this.execBody(def.body, sc));
    this.line = line;
    return r;
  };
  I.runSync = function (gen) {
    var r = gen.next();
    while (!r.done) {
      if (r.value === TICK) { r = gen.next(); continue; }              // auto time-slice marker: nothing to give way to inside a plain call
      throw err('RuntimeError', "'await' is only allowed inside an async function (use  async def)");
    }
    return r.value;
  };
  I.step = function () { if (++this.steps > RUN_LIMIT) { this.steps = 0; throw err('RuntimeError', 'the program runs too long without a pause (an endless loop?); add a wait block'); } };

  /* ---------- expressions: synchronous */
  I.ev = function (n, sc) {
    switch (n.t) {
      case 'Const': return n.v;
      case 'Name': return this.lookup(n.name, sc);
      case 'BinOp': return this.binop(n.op, this.ev(n.l, sc), this.ev(n.r, sc));
      case 'Unary': {
        var v = this.ev(n.e, sc);
        if (!isNum(v)) throw err('TypeError', "bad operand type for unary " + n.op + ": '" + typeName(v) + "'");
        return n.op === '-' ? -Number(v) : n.op === '+' ? Number(v) : ~Number(v);
      }
      case 'Not': return !truthy(this.ev(n.e, sc));
      case 'BoolOp': { var l = this.ev(n.l, sc); return n.op === 'and' ? (truthy(l) ? this.ev(n.r, sc) : l) : (truthy(l) ? l : this.ev(n.r, sc)); }
      case 'Compare': {
        var a = this.ev(n.left, sc);
        for (var i = 0; i < n.ops.length; i++) { var b = this.ev(n.rights[i], sc); if (!this.compare(n.ops[i], a, b)) return false; a = b; }
        return true;
      }
      case 'IfExp': return truthy(this.ev(n.test, sc)) ? this.ev(n.body, sc) : this.ev(n.orelse, sc);
      case 'Call': return this.callExpr(n, sc, [], null);
      case 'Attribute': return this.getattr(this.ev(n.e, sc), n.name);
      case 'Subscript': return this.subscript(this.ev(n.e, sc), this.ev(n.index, sc));
      case 'Slice': {
        var o = this.ev(n.e, sc), lo = n.lo ? this.ev(n.lo, sc) : null, hi = n.hi ? this.ev(n.hi, sc) : null, st = n.step ? this.ev(n.step, sc) : null;
        if (typeof o === 'string') return sliceSeq(o.split(''), lo, hi, st).join('');
        if (Array.isArray(o)) return sliceSeq(o, lo, hi, st);
        if (o instanceof PyTuple) return new PyTuple(sliceSeq(o.items, lo, hi, st));
        throw err('TypeError', "'" + typeName(o) + "' object is not subscriptable");
      }
      case 'List': return n.items.map(function (x) { return this.ev(x, sc); }, this);
      case 'Tuple': return new PyTuple(n.items.map(function (x) { return this.ev(x, sc); }, this));
      case 'Dict': { var d = new PyDict(); for (var k = 0; k < n.keys.length; k++) d.m.set(hashKey(this.ev(n.keys[k], sc)), this.ev(n.vals[k], sc)); return d; }
      case 'Lambda': return new PyFunction(n, sc, this);
      case 'JoinedStr': return n.parts.map(function (p) { return p.t === 'Const' ? p.v : this.fmtValue(p, this.ev(p.e, sc)); }, this).join('');
      case 'ListComp': {
        var out = [], it = iterate(this.ev(n.iter, sc)), self = this, step;
        var inner = new Scope(sc.parent, sc.fn);
        inner.vars = Object.create(sc.vars);
        while (!(step = it.next()).done) {
          this.assign(n.target, step.value, inner);
          if (!n.cond || truthy(this.ev(n.cond, inner))) out.push(this.ev(n.elt, inner));
        }
        return out;
      }
      case 'Await': throw err('RuntimeError', "'await' is only allowed inside an async function");
    }
    throw err('SystemError', 'unknown expression ' + n.t);
  };
  I.fmtValue = function (p, v) {
    if (p.conv === 'r') v = repr(v);
    return formatSpec(v, p.spec || '');
  };
  I.callExpr = function (n, sc, preArgs, preKw) {
    var f = this.ev(n.f, sc), args = [], kw = null, i;
    for (i = 0; i < n.args.length; i++) args.push(this.ev(n.args[i], sc));
    if (n.star) args = args.concat(toList(this.ev(n.star, sc)));
    if (n.kw.length || n.dstar) {
      kw = {};
      n.kw.forEach(function (k) { kw[k.name] = this.ev(k.value, sc); }, this);
      if (n.dstar) { var dd = this.ev(n.dstar, sc); dd.m.forEach(function (v, k) { kw[k] = v; }); }
    }
    this.line = n.line;
    try { return this.callValue(f, args, kw); }
    catch (e) { if (e instanceof PyError && !e.line) e.line = n.line; throw e; }
  };

  /* ---------- expressions: suspendable (they contain an await) */
  I.evG = function* (n, sc) {
    if (!n.hasAwait) return this.ev(n, sc);
    var self = this;
    switch (n.t) {
      case 'Await': {
        var v = yield* this.evG(n.e, sc);
        return yield* this.awaitValue(v, n.line);
      }
      case 'BinOp': { var l = yield* this.evG(n.l, sc); var r = yield* this.evG(n.r, sc); return this.binop(n.op, l, r); }
      case 'Unary': { var u = yield* this.evG(n.e, sc); return n.op === '-' ? -u : n.op === '+' ? +u : ~u; }
      case 'Not': return !truthy(yield* this.evG(n.e, sc));
      case 'BoolOp': { var bl = yield* this.evG(n.l, sc); return n.op === 'and' ? (truthy(bl) ? yield* this.evG(n.r, sc) : bl) : (truthy(bl) ? bl : yield* this.evG(n.r, sc)); }
      case 'Compare': {
        var a = yield* this.evG(n.left, sc);
        for (var i = 0; i < n.ops.length; i++) { var b = yield* this.evG(n.rights[i], sc); if (!this.compare(n.ops[i], a, b)) return false; a = b; }
        return true;
      }
      case 'IfExp': return truthy(yield* this.evG(n.test, sc)) ? yield* this.evG(n.body, sc) : yield* this.evG(n.orelse, sc);
      case 'Call': {
        var f = yield* this.evG(n.f, sc), args = [], kw = null;
        for (var j = 0; j < n.args.length; j++) args.push(yield* this.evG(n.args[j], sc));
        if (n.kw.length) { kw = {}; for (var k = 0; k < n.kw.length; k++) kw[n.kw[k].name] = yield* this.evG(n.kw[k].value, sc); }
        this.line = n.line;
        return this.callValue(f, args, kw);
      }
      case 'Attribute': return this.getattr(yield* this.evG(n.e, sc), n.name);
      case 'Subscript': { var o = yield* this.evG(n.e, sc); return this.subscript(o, yield* this.evG(n.index, sc)); }
      case 'List': { var out = []; for (var x = 0; x < n.items.length; x++) out.push(yield* this.evG(n.items[x], sc)); return out; }
      case 'Tuple': { var out2 = []; for (var y = 0; y < n.items.length; y++) out2.push(yield* this.evG(n.items[y], sc)); return new PyTuple(out2); }
      case 'JoinedStr': { var s = ''; for (var z = 0; z < n.parts.length; z++) { var p = n.parts[z]; s += p.t === 'Const' ? p.v : this.fmtValue(p, yield* this.evG(p.e, sc)); } return s; }
    }
    throw err('SyntaxError', 'await is not supported inside this expression');
  };
  I.awaitValue = function* (v, line) {
    if (v instanceof PyCoroutine) {
      if (v.started) throw err('RuntimeError', 'cannot reuse already awaited coroutine');
      v.started = true;
      return yield* v.gen;
    }
    if (v && v.$await) return yield v;
    throw err('TypeError', "object " + typeName(v) + " can't be used in 'await' expression");
  };

  /* ---------- statements */
  I.execBody = function* (stmts, sc) {
    var sig = yield* this.execBlock(stmts, sc);
    return sig && sig.k === 'return' ? sig.v : null;
  };
  I.execBlock = function* (stmts, sc) {
    for (var i = 0; i < stmts.length; i++) {
      var s = stmts[i], sig;
      this.line = s.line;
      if (this.onLine) this.onLine(s.line);
      if (s.sync) sig = this.execS(s, sc); else sig = yield* this.execG(s, sc);
      if (sig) return sig;
    }
    return undefined;
  };
  /** statements that cannot suspend and do not loop: returns a signal ({k:'return'|'break'|'continue'}) or undefined */
  I.execS = function (s, sc) {
    this.step();
    switch (s.t) {
      case 'Expr': this.ev(s.value, sc); return undefined;
      case 'Assign': { var v = this.ev(s.value, sc); for (var i = 0; i < s.targets.length; i++) this.assign(s.targets[i], v, sc); return undefined; }
      case 'AugAssign': {
        var cur = this.ev(s.target, sc), rhs = this.ev(s.value, sc);
        if (Array.isArray(cur) && s.op === '+') { toList(rhs).forEach(function (x) { cur.push(x); }); return undefined; }
        this.assign(s.target, this.binop(s.op, cur, rhs), sc); return undefined;
      }
      case 'If': {
        var body = truthy(this.ev(s.test, sc)) ? s.body : s.orelse;
        for (var j = 0; j < body.length; j++) { var b = body[j]; this.line = b.line; var sg = this.execS(b, sc); if (sg) return sg; }
        return undefined;
      }
      case 'Pass': return undefined;
      case 'Break': return { k: 'break' };
      case 'Continue': return { k: 'continue' };
      case 'Return': return { k: 'return', v: s.value ? this.ev(s.value, sc) : null };
      case 'Global': return undefined;
      case 'Def': { var fn = new PyFunction(s, sc.fn ? sc : null, this); this.assignName(s.name, fn, sc); return undefined; }
      case 'Import': {
        s.items.forEach(function (it) {
          var m = this.modules[it.name.split('.')[0]];
          if (!m) throw err('ModuleNotFoundError', "no module named '" + it.name + "'");
          this.assignName(it.as || it.name.split('.')[0], m, sc);
        }, this);
        return undefined;
      }
      case 'ImportFrom': {
        var mod = this.modules[s.module.split('.')[0]];
        if (!mod) throw err('ModuleNotFoundError', "no module named '" + s.module + "'");
        if (s.names === '*') { for (var k in mod.attrs) if (k[0] !== '_') this.assignName(k, mod.attrs[k], sc); return undefined; }
        s.names.forEach(function (it) {
          if (!(it.name in mod.attrs)) throw err('ImportError', "cannot import name '" + it.name + "'");
          this.assignName(it.as || it.name, mod.attrs[it.name], sc);
        }, this);
        return undefined;
      }
      case 'Del': { var t = s.targets[0]; if (t.t === 'Subscript') { var o = this.ev(t.e, sc), kx = this.ev(t.index, sc); if (Array.isArray(o)) o.splice(pyIndex(kx, o.length, 'list'), 1); else if (o instanceof PyDict) o.m.delete(hashKey(kx)); } else if (t.t === 'Name') { delete sc.vars[t.name]; } return undefined; }
      case 'Assert': if (!truthy(this.ev(s.test, sc))) throw err('AssertionError', s.msg ? str(this.ev(s.msg, sc)) : ''); return undefined;
      case 'Raise': throw err('Exception', s.exc ? str(this.ev(s.exc, sc)) : 'raise');
    }
    throw err('SystemError', 'unknown statement ' + s.t);
  };
  I.execG = function* (s, sc) {
    switch (s.t) {
      case 'Expr': yield* this.evG(s.value, sc); return undefined;
      case 'Assign': { var v = yield* this.evG(s.value, sc); for (var i = 0; i < s.targets.length; i++) this.assign(s.targets[i], v, sc); return undefined; }
      case 'AugAssign': { var cur = this.ev(s.target, sc), rhs = yield* this.evG(s.value, sc); this.assign(s.target, this.binop(s.op, cur, rhs), sc); return undefined; }
      case 'Return': return { k: 'return', v: s.value ? yield* this.evG(s.value, sc) : null };
      case 'If': {
        var t = yield* this.evG(s.test, sc);
        return yield* this.execBlock(truthy(t) ? s.body : s.orelse, sc);
      }
      case 'While': {
        for (;;) {
          this.step();
          var c = yield* this.evG(s.test, sc);
          if (!truthy(c)) { var eo = yield* this.execBlock(s.orelse, sc); return eo; }
          var sig = yield* this.execBlock(s.body, sc);
          if (sig) { if (sig.k === 'break') return undefined; if (sig.k === 'return') return sig; }
          if (++this.loopTicks >= this.sliceIter) { this.loopTicks = 0; yield TICK; }
        }
      }
      case 'For': {
        var iterable = yield* this.evG(s.iter, sc), it = iterate(iterable), step;
        while (!(step = it.next()).done) {
          this.assign(s.target, step.value, sc);
          var sg = yield* this.execBlock(s.body, sc);
          if (sg) { if (sg.k === 'break') return undefined; if (sg.k === 'return') return sg; }
          if (++this.loopTicks >= this.sliceIter) { this.loopTicks = 0; yield TICK; }
        }
        return yield* this.execBlock(s.orelse, sc);
      }
      case 'Def': return this.execS(s, sc);
    }
    return this.execS(s, sc);
  };

  /* ================================================================================================ programs and tasks */
  /** a runnable top level: the module body as a coroutine, in the shared global scope */
  I.module = function (ast) {
    var self = this;
    return new PyCoroutine((function* () {
      yield* self.execBody(ast.body, self.globals);
      return null;
    })());
  };
  /** call a Python value as a new task body: async def -> coroutine, def -> runs now */
  I.spawnCall = function (f, args) {
    var r = this.callValue(f, args || [], null);
    return r instanceof PyCoroutine ? r : null;
  };

  /* a cooperative scheduler: tasks are generators that yield Sleep / Tick requests */
  function Scheduler(interp, opts) {
    this.interp = interp;
    this.tasks = [];
    this.now = 0;
    this.onError = (opts && opts.onError) || function (e) { throw e; };
    this.seq = 0;
  }
  Scheduler.prototype.spawn = function (coro, name) {
    var t = { id: ++this.seq, name: name || 'task', gen: coro.gen, wake: this.now, waiting: null, done: false, result: null };
    this.tasks.push(t);
    return t;
  };
  Scheduler.prototype.idle = function () { return this.tasks.length === 0; };
  Scheduler.prototype.clear = function () { this.tasks.forEach(function (t) { try { t.gen.return(); } catch (e) { /* ignore */ } }); this.tasks = []; };
  /** run every task that is due; `now` is the program clock in seconds */
  Scheduler.prototype.step = function (now) {
    this.now = now;
    var list = this.tasks.slice();
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (t.done || t.wake > now) continue;
      this.interp.steps = 0;
      var r;
      try { r = t.gen.next(); }
      catch (e) { t.done = true; this.remove(t); this.onError(e, t); continue; }
      if (r.done) { t.done = true; t.result = r.value; this.remove(t); continue; }
      var aw = r.value;
      if (aw && aw.$await === 'sleep') t.wake = now + Math.max(0, aw.sec);
      else t.wake = now;
    }
  };
  Scheduler.prototype.remove = function (t) { var k = this.tasks.indexOf(t); if (k >= 0) this.tasks.splice(k, 1); };

  Q.Py = {
    compile: compile, tokenize: tokenize, Interp: Interp, Scheduler: Scheduler, PyError: PyError,
    PyModule: PyModule, PyTuple: PyTuple, PyDict: PyDict, PyFunction: PyFunction, PyCoroutine: PyCoroutine, Sleep: Sleep, Tick: Tick, TICK: TICK,
    str: str, repr: repr, truthy: truthy, typeName: typeName, formatSpec: formatSpec, toList: toList, eq: eq,
    version: '0.1'
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
