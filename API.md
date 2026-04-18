# API Reference

Complete API documentation for `@marianmeres/condition-parser`.

## Table of Contents

- [ConditionParser](#conditionparser)
  - [Static Properties](#static-properties)
  - [Static Methods](#static-methods)
- [Types](#types)
  - [ConditionParserOptions](#conditionparseroptions)
  - [ConditionParserResult](#conditionparserresult)
  - [Meta](#meta)
  - [ExpressionData](#expressiondata)
  - [ParseError](#parseerror)
- [Breaking Changes](#breaking-changes)

---

## ConditionParser

The main parser class. All methods are static.

```ts
import { ConditionParser } from "@marianmeres/condition-parser";
```

### Static Properties

#### `DEFAULT_OPERATOR`

```ts
static DEFAULT_OPERATOR: string = "eq"
```

Default operator used when none is specified in the expression (e.g., `key:value` uses `"eq"`).

> **Note**: this static is writable for convenience but affects every subsequent `parse()` call in the process. Prefer the per-call `defaultOperator` option in long-lived processes (servers, CLIs).

#### `DEBUG`

```ts
static DEBUG: boolean = false
```

Global debug flag. When `true`, all parser instances log debug information to the console.

> **Note**: same caveat as `DEFAULT_OPERATOR` — prefer the per-call `debug` option.

---

### Static Methods

#### `parse()`

```ts
static parse(
  input: string,
  options?: Partial<ConditionParserOptions>
): ConditionParserResult
```

Parses a human-friendly search condition string into a structured format.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `input` | `string` | The search expression string to parse |
| `options` | `Partial<ConditionParserOptions>` | Optional configuration for parsing behavior |

**Returns:** [`ConditionParserResult`](#conditionparserresult)

**Example:**

```ts
// Basic parsing
const { parsed, unparsed } = ConditionParser.parse("foo:bar and baz:bat");

// With options
const result = ConditionParser.parse("FOO:bar", {
  defaultOperator: "contains",
  transform: (ctx) => ({ ...ctx, key: ctx.key.toLowerCase() })
});

// Handling unparsed content
const { parsed, unparsed } = ConditionParser.parse(
  "category:books free text search"
);
// parsed: [{ expression: { key: "category", operator: "eq", value: "books" }, ... }]
// unparsed: "free text search"
```

---

#### `__createError()`

```ts
static __createError(
  input: string,
  pos: number,
  message: string,
  contextRadius?: number
): Error
```

Public helper for creating formatted error messages with position and context information.

> **Note:** Prefixed with `__` to indicate this is a special-purpose method not intended for general use. Exposed primarily for testing and advanced use cases.

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `input` | `string` | - | The full input string being parsed |
| `pos` | `number` | - | The position where the error occurred |
| `message` | `string` | - | The error message |
| `contextRadius` | `number` | `20` | Number of characters to show before/after error position |

**Returns:** `Error` - Error object with formatted message including position and context

**Example:**

```ts
const error = ConditionParser.__createError(
  "foo:bar and baz:bat",
  12,
  "Unexpected character",
  20
);
// Error message includes:
// - The error message
// - Position: 12
// - Context snippet with visual marker (^)
```

---

## Types

### ConditionParserOptions

Configuration options for the parser.

```ts
interface ConditionParserOptions {
  defaultOperator: string;
  debug: boolean;
  transform: (context: ExpressionContext) => ExpressionContext;
  preAddHook: (context: ExpressionContext) => null | undefined | ExpressionContext;
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `defaultOperator` | `string` | `"eq"` | Default operator when not explicitly specified. Empty strings are ignored (fall back to the static default). |
| `debug` | `boolean` | `false` | Enable debug logging to console |
| `transform` | `function` | identity | Transform function applied to each parsed expression |
| `preAddHook` | `function` | - | Hook called before adding each expression; return `null` / `undefined` to **drop** the expression (see notes below) |

**Transform Example:**

```ts
const result = ConditionParser.parse("FOO:BAR", {
  transform: (ctx) => ({
    ...ctx,
    key: ctx.key.toLowerCase(),
    value: ctx.value.toUpperCase()
  })
});
// Result: key="foo", value="BAR"
```

**PreAddHook Example:**

```ts
const otherConditions = [];

const result = ConditionParser.parse("foo:bar baz:bat", {
  preAddHook: (ctx) => {
    if (ctx.key === "foo") return ctx; // include in parsed
    otherConditions.push(ctx); // route elsewhere
    return null; // drop from parsed
  }
});
```

**Drop semantics**:

- The expression is omitted from `parsed` and from `meta`.
- The "join to next sibling" operator attached to the dropped expression is **transferred to its predecessor** so the remaining chain reflects the original logical intent. For `a:1 and b:2 or c:3`, dropping `b:2` yields `a:1 or c:3` (the `or` that would have connected `b → c` is promoted).
- If a parenthesized group ends up empty (every inner expression dropped), the group wrapper is removed from its parent automatically.

> **Breaking change (1.8.0)**: previously, returning falsy from `preAddHook` silently substituted a `{key: "1", operator: <defaultOperator>, value: "1"}` placeholder (`1=1`) rather than dropping. If you relied on the placeholder, return it yourself from the hook.

---

### ConditionParserResult

Result returned by `ConditionParser.parse()`.

```ts
interface ConditionParserResult {
  parsed: ConditionDump;
  unparsed: string;
  meta: Meta;
  errors: ParseError[];
}
```

| Property | Type | Description |
|----------|------|-------------|
| `parsed` | `ConditionDump` | Array of parsed condition expressions (compatible with `@marianmeres/condition-builder`) |
| `unparsed` | `string` | Any free-text fragments that couldn't be parsed — both leading (before the first expression) and trailing (after the last parseable token), combined with a single space (useful for free-text search) |
| `meta` | [`Meta`](#meta) | Metadata about the parsed expressions |
| `errors` | [`ParseError[]`](#parseerror) | Diagnostic records for any syntactic issues encountered; empty on clean parse |

> For **strict validation** (distinguish "syntax error" from "trailing free text"), check both `errors.length === 0` **and** `unparsed === ""`.

---

### Meta

Metadata about the parsed expressions.

```ts
interface Meta {
  keys: string[];
  operators: string[];
  values: string[];
  expressions: ExpressionData[];
}
```

| Property | Type | Description |
|----------|------|-------------|
| `keys` | `string[]` | Array of unique keys found in parsed expressions |
| `operators` | `string[]` | Array of unique operators found in parsed expressions |
| `values` | `string[]` | Array of unique values found in parsed expressions (string-equality deduplicated) |
| `expressions` | [`ExpressionData[]`](#expressiondata) | Array of unique expressions as objects |

> **Type narrowing (1.8.0)**: `values` is now typed `string[]` (was `any[]`). Runtime behavior is unchanged — parser output has always been strings — but strict `any[]` consumers may need to update their type annotations.

**Example:**

```ts
const { meta } = ConditionParser.parse("a:eq:1 or b:gt:2 a:eq:1");
// meta = {
//   keys: ["a", "b"],
//   operators: ["eq", "gt"],
//   values: ["1", "2"],
//   expressions: [
//     { key: "a", operator: "eq", value: "1" },
//     { key: "b", operator: "gt", value: "2" }
//   ]
// }
```

---

### ExpressionData

Represents a parsed expression with key, operator, and value.

```ts
interface ExpressionData {
  key: string;
  operator: string;
  value: string;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `key` | `string` | The key/field name of the expression |
| `operator` | `string` | The operator (e.g., `"eq"`, `"gt"`, `"contains"`) |
| `value` | `string` | The value to compare against |

---

### ParseError

Diagnostic record describing where/why parsing stopped short.

```ts
interface ParseError {
  message: string;
  position: number;
  snippet: string;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `message` | `string` | Human-readable error message (e.g. `"Unterminated quoted string"`) |
| `position` | `number` | Zero-based index in the original input where the error was detected |
| `snippet` | `string` | Short slice of the input surrounding `position` (context window) |

A non-empty `errors` array **does not** imply `parsed` is empty — any successfully parsed prefix is preserved and the failing token(s) are rolled into `unparsed`.

---

## Expression Syntax

### Basic Expressions

```
key:value              -> { key: "key", operator: "eq", value: "value" }
key:operator:value     -> { key: "key", operator: "operator", value: "value" }
```

### Quoted Identifiers

Use single or double quotes for identifiers containing spaces or special characters:

```
"my key":"my value"
'key with spaces':'value with spaces'
"key":"operator":"value"
```

### Escaped Characters

Backslash-escape special characters. Stray backslashes (not followed by an escapable char) are kept literally.

| Context | Escapable chars |
|---------|-----------------|
| Quoted strings (`"..."` / `'...'`) | `\\`, matching quote (`\"` or `\'`) |
| Parenthesized values (`(...)`) | `\\`, `\(`, `\)` |
| Unquoted tokens | `\\`, `\:`, `\(`, `\)`, `\ ` (space), `\⇥` (tab) |

Examples:

```
"value with \" quote"    -> value with " quote
'value with \' quote'    -> value with ' quote
"path\\to\\file"         -> path\to\file
key\:colon:value         -> { key: "key:colon", value: "value" }
key:(value with \) paren) -> value: "value with ) paren"
```

### Parenthesized Values

Wrap values in parentheses (useful for complex values):

```
key:(value with spaces)
key:eq:(complex value)
key:eq:(a(b)c)           -> value: "a(b)c"   (balanced nested parens)
key:eq:(value with \) paren)
```

> **Nested parens (1.8.0)**: parenthesized values now preserve balanced nested `()` as literal content. Previously the first unescaped `)` terminated the value.

### Logical Operators

```
a:b and c:d       -> AND join
a:b or c:d        -> OR join
a:b and not c:d   -> AND NOT join
a:b or not c:d    -> OR NOT join
a:b c:d           -> implicit AND (same as "a:b and c:d")
```

### Grouping

Use parentheses for logical grouping:

```
(a:b or c:d) and e:f
a:b and (c:d or (e:f and g:h))
```

### Free Text

Unparsable content surrounding a contiguous parseable middle is preserved.
Both **leading** (before the first expression) and **trailing** (after the
last parseable token) fragments are collected into `unparsed`, single-space
joined:

```
category:books the search query
// parsed: category:books
// unparsed: "the search query"

the search query category:books
// parsed: category:books
// unparsed: "the search query"

the search category:books query
// parsed: category:books
// unparsed: "the search query"
```

> **Limitation**: only free text that wraps a *contiguous* parseable section
> is reassembled. Free text appearing **between** two expressions (e.g.,
> `a:b free c:d`) breaks the parse at the interstitial token, so `c:d`
> ends up inside `unparsed` along with `"free"`.

---

## Integration with condition-builder

The parser output is designed to work seamlessly with `@marianmeres/condition-builder`:

```ts
import { ConditionParser } from "@marianmeres/condition-parser";
import { Condition } from "@marianmeres/condition-builder";

const userSearchInput = '(folder:"my projects" or folder:inbox) foo bar';

const options = {
  renderKey: (ctx) => `"${ctx.key.replaceAll('"', '""')}"`,
  renderValue: (ctx) => `'${ctx.value.toString().replaceAll("'", "''")}'`,
};

const { parsed, unparsed } = ConditionParser.parse(userSearchInput);

const c = new Condition(options);
c.and("user_id", "eq", 123).and(
  Condition.restore(parsed, options).and("text", "match", unparsed)
);

console.log(c.toString());
// "user_id"='123' and (("folder"='my projects' or "folder"='inbox') and "text"~*'foo bar')
```

---

## Breaking Changes

### 1.8.0

1. **`preAddHook` falsy return now drops the expression** (previously replaced with a `{key: "1", operator: defaultOperator, value: "1"}` placeholder). The dropped expression's "join to next" operator is transferred to its predecessor, and empty parenthesized groups collapse. See [PreAddHook Example](#preaddhook-example). *Migration*: if you relied on the `1=1` placeholder, return it explicitly from your hook.
2. **`ConditionParserResult.errors: ParseError[]`** is a new required field on the result. *Migration*: consumers using the destructured shape `{ parsed, unparsed, meta }` are unaffected; code constructing `ConditionParserResult` literals needs to add `errors: []`.
3. **`Meta.values` is now typed `string[]`** (was `any[]`). Runtime behavior unchanged. *Migration*: update strict type annotations if needed.
4. **Parser no longer throws a bogus "Parentheses level mismatch"** for balanced inputs starting with one or more `(`. Previously the throw was silently swallowed — the visible effect is that `errors` no longer holds a phantom entry for inputs like `((foo:bar))`.
5. **Stray `not` in trailing terms is no longer consumed.** `a:b and c:d not e:f` now preserves `c:d` (previously dropped) and routes `not e:f` to `unparsed`. The `not` keyword is still recognized when it sits immediately after an `and` / `or` join.
6. **Backslash escapes apply to backslash itself.** `"foo\\bar"` now yields `foo\bar`; previously the input was unterminated. Also applies to parenthesized values.
7. **Parenthesized values support balanced nested parens.** `key:(a(b)c)` now yields `a(b)c`; previously the first `)` terminated the value.
8. **Unquoted tokens can escape more characters**: `\\`, `\:`, `\(`, `\)`, `\ ` (space), `\⇥` (tab). Previously only `\:` was recognized.
9. **Empty `defaultOperator` option silently falls back** to `ConditionParser.DEFAULT_OPERATOR` (`"eq"` by default). Previously could produce malformed expressions.
