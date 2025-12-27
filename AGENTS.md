# Agent Context: @marianmeres/condition-parser

## Package Overview

- **Name**: `@marianmeres/condition-parser`
- **Version**: 1.7.1
- **Purpose**: Human-friendly search conditions notation parser (Gmail-style search syntax)
- **License**: MIT
- **Runtime**: Deno (primary), Node.js (via NPM distribution)

## File Structure

```
src/
├── mod.ts          # Public entry point (re-exports parser.ts)
└── parser.ts       # Main parser implementation (705 lines)

tests/
└── all.test.ts     # Test suite (682 lines, 30 tests)

scripts/
└── build-npm.ts    # NPM distribution builder
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
}

interface Meta {
  keys: string[];
  operators: string[];
  values: any[];
  expressions: ExpressionData[];
}

interface ExpressionData {
  key: string;
  operator: string;
  value: string;
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
2. **Fault Tolerance**: Parse errors don't throw; unparsable content preserved in `unparsed`
3. **Escape Support**: Backslash escapes for `'`, `"`, `:`, `)` within strings
4. **Case Insensitive**: Operators `and`, `or`, `not` are case-insensitive
5. **Metadata Collection**: Unique keys, operators, values tracked in `meta`
6. **Transform Pipeline**: Optional expression transformation before output
7. **Pre-add Hook**: Optional filtering/routing of expressions

## Integration Pattern

```typescript
import { ConditionParser } from "@marianmeres/condition-parser";
import { Condition } from "@marianmeres/condition-builder";

const { parsed, unparsed } = ConditionParser.parse(userInput);
const condition = Condition.restore(parsed);
```

## Test Coverage

30 tests covering:
- Basic expression parsing
- Quoted identifiers (single/double quotes)
- Escaped characters
- Logical operators (and, or, and not, or not)
- Parenthesized grouping
- Nested conditions
- Free text handling
- Transform function
- Pre-add hook
- Error handling
- Metadata collection

## Error Handling

Parser is fault-tolerant:
- Malformed input doesn't throw exceptions
- Partially parsed content preserved in `parsed`
- Unparsable remainder preserved in `unparsed`
- Error positions tracked internally for debugging

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
Use `preAddHook` to filter or route expressions:
```typescript
ConditionParser.parse(input, {
  preAddHook: (ctx) => ctx.key === "special" ? null : ctx
});
```
