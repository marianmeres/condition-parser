# Agent Context: @marianmeres/condition-parser

## Package Overview

- **Name**: `@marianmeres/condition-parser`
- **Version**: 1.8.0 (pending release; see deno.json for current)
- **Purpose**: Human-friendly search conditions notation parser (Gmail-style search syntax)
- **License**: MIT
- **Runtime**: Deno (primary), Node.js (via NPM distribution)

## File Structure

```
src/
├── mod.ts          # Public entry point (re-exports parser.ts)
└── parser.ts       # Main parser implementation

tests/
└── all.test.ts     # Test suite (51 tests)

scripts/
└── build-npm.ts    # NPM distribution builder

mcp.ts              # MCP tool definitions (parse-condition, validate-condition-syntax)
```

## Public API

### Main Export: `ConditionParser`

Static class with two public methods:

```typescript
// Primary method - parses search expressions
ConditionParser.parse(
  input: string,
  options?: Partial<ConditionParserOptions>
): ConditionParserResult

// Error helper (prefixed __ for internal use)
ConditionParser.__createError(
  input: string,
  pos: number,
  message: string,
  contextRadius?: number
): Error
```

### Static Properties

```typescript
ConditionParser.DEFAULT_OPERATOR: string = "eq"
ConditionParser.DEBUG: boolean = false
```

### Exported Types

```typescript
interface ConditionParserOptions {
  defaultOperator: string;      // default: "eq"
  debug: boolean;               // default: false
  transform?: (ctx: ExpressionContext) => ExpressionContext;
  preAddHook?: (ctx: ExpressionContext) => null | undefined | ExpressionContext;
}

interface ConditionParserResult {
  parsed: ConditionDump;        // from @marianmeres/condition-builder
  unparsed: string;
  meta: Meta;
  errors: ParseError[];         // empty when input parsed cleanly
}

interface Meta {
  keys: string[];
  operators: string[];
  values: string[];
  expressions: ExpressionData[];
}

interface ExpressionData {
  key: string;
  operator: string;
  value: string;
}

interface ParseError {
  message: string;
  position: number;
  snippet: string;
}
```

## Parser Grammar

```
condition      := term (conditionOp term)*
term           := basicExpr | "(" condition ")"
basicExpr      := identifier ":" identifier (":" identifier)?
identifier     := quotedString | unquotedString | parenthesizedValue
quotedString   := ("'" | '"') ... ("'" | '"')
unquotedString := [^:\s()]+
parenthesizedValue := "(" ... ")"
conditionOp    := "and" | "or" | "and not" | "or not" | <implicit and>
```

## Expression Formats

| Input | Parsed Key | Parsed Operator | Parsed Value |
|-------|-----------|-----------------|--------------|
| `key:value` | key | eq (default) | value |
| `key:op:value` | key | op | value |
| `"k k":"o o":"v v"` | k k | o o | v v |
| `key:(complex value)` | key | eq | complex value |

## Logical Operators

| Syntax | ConditionJoinOperator |
|--------|----------------------|
| `and` | "and" |
| `or` | "or" |
| `and not` | "andNot" |
| `or not` | "orNot" |
| (implicit) | "and" |

## Dependencies

### Runtime

- `@marianmeres/condition-builder` - Type definitions and integration target

### Development

- `@marianmeres/npmbuild` - NPM distribution builder
- `@std/assert` - Deno test assertions
- `@std/fs`, `@std/path` - File system utilities

## Build Commands

```bash
deno task test          # Run tests
deno task test:watch    # Run tests in watch mode
deno task npm:build     # Build NPM distribution
deno task publish       # Publish to JSR and NPM
deno task release       # Patch version release
deno task release minor # Minor version release
```

## Key Implementation Details

1. **Recursive Descent Parser**: Layered parsing methods handle grammar levels
2. **Fault Tolerance**: Parse errors don't throw; unparsable content preserved in `unparsed` (both leading and trailing free text around a contiguous parseable middle, single-space joined); diagnostics in `errors[]`
3. **Escape Support**: Context-dependent backslash escapes (see table below)
4. **Case Insensitive**: Operators `and`, `or`, `not` are case-insensitive
5. **Metadata Collection**: Unique keys, operators, values tracked in `meta`
6. **Transform Pipeline**: Optional expression transformation before output
7. **Pre-add Hook**: Optional filtering/routing of expressions; falsy return **drops** the expression

### Escape Table

| Context | Escapable characters |
|---------|----------------------|
| Quoted string (`"..."` / `'...'`) | `\\`, matching quote (`\"` or `\'`) |
| Parenthesized value (`(...)`) | `\\`, `\(`, `\)` (also supports balanced nested parens literally) |
| Unquoted token | `\\`, `\:`, `\(`, `\)`, `\ ` (space), `\⇥` (tab) |

Stray backslashes (not followed by an escapable char) are preserved literally.

## Integration Pattern

```typescript
import { ConditionParser } from "@marianmeres/condition-parser";
import { Condition } from "@marianmeres/condition-builder";

const { parsed, unparsed } = ConditionParser.parse(userInput);
const condition = Condition.restore(parsed);
```

## Test Coverage

51 tests covering:
- Basic expression parsing
- Quoted identifiers (single/double quotes)
- Escaped characters (including `\\` self-escape)
- Logical operators (and, or, and not, or not)
- Parenthesized grouping (including double-wrapped `((...))`)
- Nested parens inside values
- `not` disambiguation (only a suffix right after and/or)
- Free text handling (leading, trailing, and wrapped around parseable middle)
- Transform function
- Pre-add hook (drop semantics + operator transfer + empty-group collapse)
- `errors[]` diagnostic channel
- Metadata collection

## Error Handling

Parser is fault-tolerant:
- Malformed input doesn't throw exceptions
- Partially parsed content preserved in `parsed`
- Unparsable remainder preserved in `unparsed`
- Diagnostic records available in `errors: ParseError[]`
- For **strict validation** check `errors.length === 0 && !unparsed.trim()`

## Common Tasks

### Adding new operators
Operators are strings - no code changes needed. Use `defaultOperator` option or explicit `key:operator:value` syntax.

### Custom transformations
Use `transform` option to normalize keys/values:
```typescript
ConditionParser.parse(input, {
  transform: (ctx) => ({ ...ctx, key: ctx.key.toLowerCase() })
});
```

### Routing expressions
Use `preAddHook` to filter or route expressions. A falsy return **drops** the expression from `parsed` — its "join to next" operator is transferred to the predecessor and empty groups collapse.
```typescript
ConditionParser.parse(input, {
  preAddHook: (ctx) => ctx.key === "special" ? null : ctx
});
```

## Breaking Changes (1.8.0)

When working on consumers of this package, be aware:

1. `preAddHook` falsy return now **drops** the expression (was: silently substituted `1=1` placeholder).
2. `ConditionParserResult` has a new required field `errors: ParseError[]`.
3. `Meta.values` typed `string[]` (was `any[]`); runtime unchanged.
4. Balanced double-wrapped `((foo:bar))` no longer produces a phantom swallowed error.
5. Stray `not` inside later terms no longer captures the cursor (preserves preceding expressions).
6. Quoted and parenthesized values support `\\` (literal backslash) escape.
7. Parenthesized values preserve balanced nested parens literally: `key:(a(b)c)` → `a(b)c`.
8. Unquoted tokens accept more escape sequences (`\\`, `\:`, `\(`, `\)`, `\ `, `\⇥`).
9. Empty `defaultOperator` falls back to `ConditionParser.DEFAULT_OPERATOR`.

See [API.md#breaking-changes](./API.md#breaking-changes) for migration notes.
