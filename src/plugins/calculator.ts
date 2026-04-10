/**
 * Calculator Plugin — recursive descent parser (no eval)
 * Supports: +, -, *, /, ^, parentheses, decimals, unary minus
 */

import { registerPlugin, type Plugin } from '@/lib/plugin-system';

// ===== Parser =====

class ParseError extends Error {
  constructor(msg: string) { super(msg); this.name = 'ParseError'; }
}

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    if ('+-*/^()'.includes(ch)) { tokens.push(ch); i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) { num += expr[i]; i++; }
      tokens.push(num);
      continue;
    }
    throw new ParseError(`Unexpected character: '${ch}'`);
  }
  return tokens;
}

class Parser {
  private tokens: string[];
  private pos = 0;

  constructor(tokens: string[]) { this.tokens = tokens; }

  parse(): number {
    const result = this.expression();
    if (this.pos < this.tokens.length) throw new ParseError(`Unexpected token: ${this.tokens[this.pos]}`);
    return result;
  }

  private peek(): string | undefined { return this.tokens[this.pos]; }
  private consume(): string { return this.tokens[this.pos++]; }

  private expression(): number {
    let left = this.term();
    while (this.peek() === '+' || this.peek() === '-') {
      const op = this.consume();
      const right = this.term();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  private term(): number {
    let left = this.power();
    while (this.peek() === '*' || this.peek() === '/') {
      const op = this.consume();
      const right = this.power();
      if (op === '/' && right === 0) throw new ParseError('Division by zero');
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  private power(): number {
    let base = this.unary();
    if (this.peek() === '^') {
      this.consume();
      const exp = this.power(); // right-associative
      base = Math.pow(base, exp);
    }
    return base;
  }

  private unary(): number {
    if (this.peek() === '-') {
      this.consume();
      return -this.unary();
    }
    if (this.peek() === '+') {
      this.consume();
      return this.unary();
    }
    return this.primary();
  }

  private primary(): number {
    if (this.peek() === '(') {
      this.consume();
      const val = this.expression();
      if (this.peek() !== ')') throw new ParseError('Missing closing parenthesis');
      this.consume();
      return val;
    }
    const token = this.consume();
    if (token === undefined) throw new ParseError('Unexpected end of expression');
    const num = Number(token);
    if (isNaN(num)) throw new ParseError(`Invalid number: ${token}`);
    return num;
  }
}

export function calculate(expression: string): { result: number; expression: string } | { error: string; expression: string } {
  try {
    if (!expression || !expression.trim()) return { error: 'Empty expression', expression };
    const tokens = tokenize(expression);
    if (tokens.length === 0) return { error: 'Empty expression', expression };
    const parser = new Parser(tokens);
    const result = parser.parse();
    return { result, expression };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Parse error', expression };
  }
}

// ===== Plugin Registration =====

const calculatorPlugin: Plugin = {
  manifest: {
    id: 'calculator',
    name: 'Calculator',
    version: '1.0.0',
    description: 'Evaluate math expressions safely without eval()',
    icon: '🧮',
    capabilities: ['math'],
  },
  enabled: true,
  actions: [
    {
      name: 'calculate',
      description: 'Evaluate a math expression (supports +, -, *, /, ^, parentheses)',
      handler: async (params) => {
        const expr = String(params.expression || params.expr || '');
        return calculate(expr);
      },
    },
  ],
};

// Auto-register
registerPlugin(calculatorPlugin);

export default calculatorPlugin;
