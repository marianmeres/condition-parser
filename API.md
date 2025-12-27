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

#### `DEBUG`

```ts
static DEBUG: boolean = false
```

Global debug flag. When `true`, all parser instances log debug information to the console.

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
| `defaultOperator` | `string` | `"eq"` | Default operator when not explicitly specified |
| `debug` | `boolean` | `false` | Enable debug logging to console |
| `transform` | `function` | identity | Transform function applied to each parsed expression |
| `preAddHook` | `function` | - | Hook called before adding each expression; return falsy to skip |

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
    return null; // skip in parsed
  }
});
```

---

### ConditionParserResult

Result returned by `ConditionParser.parse()`.

```ts
interface ConditionParserResult {
  parsed: ConditionDump;
  unparsed: string;
  meta: Meta;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `parsed` | `ConditionDump` | Array of parsed condition expressions (compatible with `@marianmeres/condition-builder`) |
| `unparsed` | `string` | Any trailing text that couldn't be parsed (useful for free-text search) |
| `meta` | [`Meta`](#meta) | Metadata about the parsed expressions |

---

### Meta

Metadata about the parsed expressions.

```ts
interface Meta {
  keys: string[];
  operators: string[];
  values: any[];
  expressions: ExpressionData[];
}
```

| Property | Type | Description |
|----------|------|-------------|
| `keys` | `string[]` | Array of unique keys found in parsed expressions |
| `operators` | `string[]` | Array of unique operators found in parsed expressions |
| `values` | `any[]` | Array of unique values found in parsed expressions |
| `expressions` | [`ExpressionData[]`](#expressiondata) | Array of unique expressions as objects |

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

Escape special characters with backslash:

```
"value with \" quote"    -> value with " quote
'value with \' quote'    -> value with ' quote
key\:colon:value         -> key: "key:colon"
```

### Parenthesized Values

Wrap values in parentheses (useful for complex values):

```
key:(value with spaces)
key:eq:(complex value)
key:eq:(value with \) paren)
```

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

Any trailing unparsable content is preserved:

```
category:books the search query
// parsed: category:books
// unparsed: "the search query"
```

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
