# @marianmeres/condition-parser

Human-friendly search conditions parser (Gmail-style syntax) for Deno/Node.js.

## Quick Facts

- **Entry**: `src/mod.ts` -> `src/parser.ts`
- **Main API**: `ConditionParser.parse(input, options?)` returns `{ parsed, unparsed, meta }`
- **Tests**: `deno task test` (30 tests)
- **Integrates with**: `@marianmeres/condition-builder`

## Syntax

```
key:value               # implicit "eq" operator
key:operator:value      # explicit operator
"key":"op":"value"      # quoted (spaces allowed)
a:b and c:d             # AND join
a:b or c:d              # OR join
a:b and not c:d         # AND NOT
(a:b or c:d) and e:f    # grouping
category:books query    # trailing text -> unparsed
```

## Options

```typescript
{
  defaultOperator: "eq",  // operator when not specified
  debug: false,           // console logging
  transform: (ctx) => ctx,    // modify expressions
  preAddHook: (ctx) => ctx    // filter expressions (return null to skip)
}
```

## Result

```typescript
{
  parsed: ConditionDump,  // structured conditions
  unparsed: string,       // trailing free text
  meta: { keys, operators, values, expressions }
}
```

## Files

- `src/parser.ts` - Parser implementation (recursive descent)
- `tests/all.test.ts` - Test suite
- `API.md` - Full API documentation
- `AGENTS.md` - Machine-friendly docs
