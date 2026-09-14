import { parseFragment } from "parse5";

const functionTypes = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
  "FunctionDeclaration",
]);
const textProperties = new Set([
  "alt",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-valuetext",
  "aria-roledescription",
  "placeholder",
  "title",
  "label",
  "description",
  "message",
  "heading",
  "caption",
  "tooltip",
  "defaultValue",
  "textContent",
  "innerText",
  "innerHTML",
]);
const wrappers = new Set([
  "TSAsExpression",
  "TSTypeAssertion",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "ChainExpression",
]);
const templateTextProperties = new Set([...textProperties].map((name) => name.toLowerCase()));

function unwrap(node) {
  while (wrappers.has(node?.type)) node = node.expression;
  return node;
}
function key(node) {
  if (!node) return undefined;
  const property = node.type === "MemberExpression" ? node.property : node.key;
  if (property?.type === "Literal") return String(property.value);
  if (!node.computed && property?.type === "Identifier") return property.name;
}
function patternPath(pattern, name) {
  if (pattern?.type === "Identifier") return pattern.name === name ? [] : null;
  if (pattern?.type === "AssignmentPattern") return patternPath(pattern.left, name);
  const entries =
    pattern?.type === "ArrayPattern"
      ? pattern.elements.map((value, index) => [String(index), value])
      : pattern?.type === "ObjectPattern"
        ? pattern.properties.filter((p) => p.type === "Property").map((p) => [key(p), p.value])
        : [];
  for (const [part, value] of entries) {
    const rest = patternPath(value, name);
    if (rest !== null) return [part, ...rest];
  }
  return null;
}

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Keep user-visible web copy in translation catalogs instead of string literals.",
    },
    schema: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          allowedLiterals: { type: "array", items: { type: "string" }, uniqueItems: true },
          textFunctions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["module", "name", "arguments"],
              properties: {
                module: { type: "string" },
                name: { type: "string" },
                arguments: {
                  type: "array",
                  items: { type: "integer", minimum: 0 },
                  uniqueItems: true,
                },
              },
            },
          },
        },
      },
    ],
    messages: {
      literal: "Move UI text {{text}} to the language catalogs and use a typed translator.",
    },
  },
  create(context) {
    const allowed = new Set(context.options[0]?.allowedLiterals ?? []);
    const importedHelpers = context.options[0]?.textFunctions ?? [];
    const calls = [],
      properties = [],
      assignments = [],
      constructors = [],
      templates = [];
    const inspectedTemplates = new WeakSet();
    const reported = new WeakSet(),
      callers = new Map(),
      mappedCallbacks = new Map(),
      returns = new Map();

    function variable(node) {
      if (node?.type !== "Identifier") return undefined;
      for (let scope = context.sourceCode.getScope(node); scope; scope = scope.upper) {
        if (scope.set.has(node.name)) return scope.set.get(node.name);
      }
    }
    function namespace(node, seen = new Set()) {
      node = unwrap(node);
      if (!node || seen.has(node)) return null;
      seen = new Set(seen).add(node);
      const def = variable(node)?.defs[0];
      if (def?.type === "ImportBinding" && def.node.type === "ImportNamespaceSpecifier")
        return def.parent.source.value;
      return def?.type === "Variable" ? namespace(def.node.init, seen) : null;
    }
    function imported(node, seen = new Set()) {
      node = unwrap(node);
      if (!node || seen.has(node)) return null;
      seen = new Set(seen).add(node);
      if (node.type === "MemberExpression") {
        const module = namespace(node.object);
        return module ? { module, name: key(node) } : null;
      }
      const def = variable(node)?.defs[0];
      if (def?.type === "ImportBinding" && def.node.type === "ImportSpecifier") {
        return {
          module: def.parent.source.value,
          name: def.node.imported.name ?? def.node.imported.value,
        };
      }
      if (def?.type === "Variable") {
        const path = patternPath(def.node.id, node.name),
          module = namespace(def.node.init);
        if (module && path?.length === 1) return { module, name: path[0] };
      }
      return def?.type === "Variable" ? imported(def.node.init, seen) : null;
    }
    function isH(node) {
      const spec = imported(node);
      return spec?.module === "snabbdom" && spec.name === "h";
    }
    function isTemplate(node) {
      const spec = imported(node?.tag);
      return (
        node?.type === "TaggedTemplateExpression" &&
        ["lit-html", "lit-html/static.js"].includes(spec?.module) &&
        ["html", "svg"].includes(spec.name)
      );
    }
    function litDirective(node, name) {
      const spec = imported(node);
      return spec?.module === `lit-html/directives/${name}.js` && spec.name === name;
    }
    function inspectTemplate(node) {
      if (inspectedTemplates.has(node)) return;
      inspectedTemplates.add(node);
      const { quasis, expressions } = node.quasi;
      // Placeholders survive HTML parsing, including entity decoding. Choose a
      // prefix absent from the source so literal user copy cannot impersonate one.
      let prefix = "litexpression";
      while (quasis.some((part) => (part.value.cooked ?? part.value.raw).includes(prefix)))
        prefix += "x";
      const marker = (index) => `${prefix}${index}end`;
      const offsets = [];
      let source = "";
      quasis.forEach((part, index) => {
        offsets.push(source.length);
        source += part.value.cooked ?? part.value.raw;
        if (index < expressions.length) source += marker(index);
      });
      function inspectText(text, offset = 0) {
        const pattern = new RegExp(`${prefix}(\\d+)end`, "g");
        let start = 0;
        function literal(end) {
          const index = offsets.findLastIndex((position) => position <= offset + start);
          report(quasis[Math.max(0, index)], text.slice(start, end));
        }
        for (const match of text.matchAll(pattern)) {
          literal(match.index);
          inspect(expressions[Number(match[1])]);
          start = match.index + match[0].length;
        }
        literal(text.length);
      }
      function walk(element) {
        if (["script", "style"].includes(element.tagName)) return;
        if (element.nodeName === "#text")
          inspectText(element.value, element.sourceCodeLocation?.startOffset);
        const attrs = element.attrs ?? [];
        const type = attrs.find((attr) => ["type", ".type"].includes(attr.name))?.value;
        const typeExpression = expressions.find((_, index) => type === marker(index));
        const button =
          element.tagName === "input" &&
          (["button", "submit", "reset"].includes(type) ||
            values(typeExpression).some(
              (value) =>
                value.type === "Literal" && ["button", "submit", "reset"].includes(value.value),
            ));
        for (const attr of attrs) {
          // Events/boolean attributes and element directives are structural.
          if (attr.name.startsWith("@") || attr.name.startsWith("?")) continue;
          const name = attr.name.replace(/^\./, "");
          if (templateTextProperties.has(name) || (button && name === "value")) {
            inspectText(attr.value, element.sourceCodeLocation?.attrs?.[attr.name]?.startOffset);
          }
        }
        element.childNodes?.forEach(walk);
        if (element.content) walk(element.content);
      }
      walk(parseFragment(source, { sourceCodeLocationInfo: true }));
    }
    function globalIdentifier(node, name) {
      return node?.type === "Identifier" && node.name === name && !variable(node)?.defs.length;
    }
    function report(node, text) {
      // Numbers, whitespace and icons have no linguistic content. Exempt identifiers
      // explicitly, never all uppercase words (e.g. SAVE) or English-looking strings.
      const trimmed = text.trim().replace(/^[^\p{L}\p{N}#]+|[^\p{L}\p{N}]+$/gu, "");
      if (
        !/\p{L}/u.test(text) ||
        allowed.has(trimmed) ||
        /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(trimmed)
      )
        return;
      if (!reported.has(node)) {
        reported.add(node);
        context.report({ node, messageId: "literal", data: { text: JSON.stringify(text) } });
      }
    }
    function returnValues(fn) {
      if (returns.has(fn)) return returns.get(fn);
      const values = [];
      function walk(node) {
        if (!node || functionTypes.has(node.type)) return;
        if (node.type === "ReturnStatement") {
          if (node.argument) values.push(node.argument);
          return;
        }
        for (const childKey of context.sourceCode.visitorKeys[node.type] ?? []) {
          const children = node[childKey];
          if (Array.isArray(children)) children.forEach(walk);
          else walk(children);
        }
      }
      if (fn.body.type === "BlockStatement") walk(fn.body);
      else values.push(fn.body);
      returns.set(fn, values);
      return values;
    }
    function project(node, path, seen) {
      if (!path.length) return [node];
      node = unwrap(node);
      if (!node || seen.has(node)) return [];
      // Object spreads can point back to earlier assignments of the same binding.
      // Track projection steps as well as value resolution to stop those cycles.
      const next = new Set(seen).add(node);
      return values(node, seen).flatMap((value) => {
        if (value.type === "ArrayExpression") {
          const child = value.elements[Number(path[0])];
          return child ? project(child, path.slice(1), next) : [];
        }
        if (value.type === "ObjectExpression") {
          return value.properties.flatMap((property) =>
            property.type === "SpreadElement"
              ? project(property.argument, path, next)
              : key(property) === path[0]
                ? project(property.value, path.slice(1), next)
                : [],
          );
        }
        return [];
      });
    }
    function defaults(pattern, name, seen) {
      if (pattern?.type === "AssignmentPattern") {
        const path = patternPath(pattern.left, name);
        return path === null
          ? []
          : [...project(pattern.right, path, seen), ...defaults(pattern.left, name, seen)];
      }
      const children =
        pattern?.type === "ArrayPattern"
          ? pattern.elements
          : pattern?.type === "ObjectPattern"
            ? pattern.properties.filter((p) => p.type === "Property").map((p) => p.value)
            : [];
      return children.flatMap((child) => defaults(child, name, seen));
    }
    function objectProperties(original, seen) {
      const node = unwrap(original);
      if (!node || seen.has(node)) return [];
      const next = new Set(seen).add(node);
      return values(node, seen).flatMap((object) =>
        object.type !== "ObjectExpression"
          ? []
          : object.properties.flatMap((property) =>
              property.type === "SpreadElement"
                ? objectProperties(property.argument, next)
                : [property],
            ),
      );
    }
    function mapItems(receiver, path, seen) {
      receiver = unwrap(receiver);
      if (!receiver || seen.has(receiver)) return [];
      const next = new Set(seen).add(receiver);
      if (
        receiver.type === "CallExpression" &&
        receiver.callee.type === "MemberExpression" &&
        globalIdentifier(receiver.callee.object, "Object")
      ) {
        const method = key(receiver.callee);
        if (["entries", "values"].includes(method)) {
          return objectProperties(receiver.arguments[0], next).flatMap((property) => {
            if (property.type !== "Property") return [];
            if (method === "values") return project(property.value, path, next);
            if (path[0] === "1") return project(property.value, path.slice(1), next);
            // Object.entries keys can also be displayed. Reuse the key's location for diagnostics.
            if (path[0] === "0" && key(property) !== undefined)
              return [{ ...property.key, type: "Literal", value: key(property) }];
            return [];
          });
        }
      }
      return values(receiver, seen).flatMap((array) =>
        array.type === "ArrayExpression"
          ? array.elements.flatMap((item) =>
              item?.type === "SpreadElement"
                ? mapItems(item.argument, path, next)
                : item
                  ? project(item, path, next)
                  : [],
            )
          : [],
      );
    }
    function parameterValues(def, name, seen) {
      const fn = def.node,
        index = fn.params.findIndex((param) => patternPath(param, name) !== null);
      if (index < 0) return [];
      const path = patternPath(fn.params[index], name);
      const result = (callers.get(fn) ?? []).flatMap((call) =>
        call.arguments[index] ? project(call.arguments[index], path, seen) : [],
      );
      if (index === 0)
        for (const receiver of mappedCallbacks.get(fn) ?? [])
          result.push(...mapItems(receiver, path, seen));
      result.push(...defaults(fn.params[index], name, seen));
      return result;
    }
    // Resolve local data only. Unknown imports, user input and runtime state remain
    // dynamic; they are not assumed to be translatable application copy.
    function values(original, seen = new Set(), followParameters = true) {
      const node = unwrap(original);
      if (!node || seen.has(node)) return [];
      seen = new Set(seen).add(node);
      if (node.type === "Identifier") {
        const binding = variable(node);
        return (binding?.defs ?? []).flatMap((def) => {
          if (def.type === "FunctionName") return [def.node];
          if (def.type === "Parameter")
            return followParameters ? parameterValues(def, node.name, seen) : [];
          if (def.type !== "Variable") return [];
          const path = patternPath(def.node.id, node.name) ?? [];
          const writes = binding.references
            .filter((ref) => ref.writeExpr)
            .map((ref) => ref.writeExpr);
          const initial = [...new Set([def.node.init, ...writes].filter(Boolean))].flatMap((init) =>
            project(init, path, seen),
          );
          return [...initial, ...defaults(def.node.id, node.name, seen)].flatMap((value) =>
            values(value, seen, followParameters),
          );
        });
      }
      if (node.type === "MemberExpression") {
        const name = key(node);
        if (name !== undefined)
          return project(node.object, [name], seen).flatMap((value) =>
            values(value, seen, followParameters),
          );
        return [
          ...objectProperties(node.object, seen).flatMap((property) =>
            values(property.value, seen, followParameters),
          ),
          ...mapItems(node.object, [], seen).flatMap((item) =>
            values(item, seen, followParameters),
          ),
        ];
      }
      if (node.type === "ConditionalExpression")
        return [node.consequent, node.alternate].flatMap((value) =>
          values(value, seen, followParameters),
        );
      if (node.type === "LogicalExpression")
        return [node.left, node.right].flatMap((value) => values(value, seen, followParameters));
      // These methods retain the source elements; checking every possible item is
      // conservative even when a runtime predicate excludes some of them.
      if (
        node.type === "CallExpression" &&
        node.callee.type === "MemberExpression" &&
        ["filter", "slice", "toSorted", "toReversed"].includes(key(node.callee))
      ) {
        return values(node.callee.object, seen, followParameters);
      }
      return [node];
    }
    function inspect(original, seen = new Set()) {
      const node = unwrap(original);
      if (!node || seen.has(node)) return;
      seen = new Set(seen).add(node);
      if (node.type === "Literal" && typeof node.value === "string") report(node, node.value);
      else if (isTemplate(node)) inspectTemplate(node);
      else if (node.type === "TemplateLiteral") {
        for (const part of node.quasis) report(part, part.value.cooked ?? part.value.raw);
        node.expressions.forEach((value) => inspect(value, seen));
      } else if (node.type === "ArrayExpression")
        node.elements.forEach((value) => inspect(value, seen));
      else if (node.type === "SpreadElement") inspect(node.argument, seen);
      else if (node.type === "ConditionalExpression") {
        inspect(node.consequent, seen);
        inspect(node.alternate, seen);
      } else if (
        node.type === "LogicalExpression" ||
        (node.type === "BinaryExpression" && node.operator === "+")
      ) {
        inspect(node.left, seen);
        inspect(node.right, seen);
      } else if (node.type === "Identifier" || node.type === "MemberExpression")
        values(node).forEach((value) => inspect(value, seen));
      else if (node.type === "CallExpression" && !isH(node.callee)) {
        for (const fn of values(node.callee).filter((value) => functionTypes.has(value.type)))
          returnValues(fn).forEach((value) => inspect(value, seen));
        if (litDirective(node.callee, "live")) inspect(node.arguments[0], seen);
        if (litDirective(node.callee, "keyed")) inspect(node.arguments[1], seen);
        if (litDirective(node.callee, "repeat")) {
          for (const fn of values(node.arguments.at(-1)).filter((value) =>
            functionTypes.has(value.type),
          ))
            returnValues(fn).forEach((value) => inspect(value, seen));
        }
        if (globalIdentifier(node.callee, "String")) inspect(node.arguments[0], seen);
        if (node.callee.type === "MemberExpression") {
          const method = key(node.callee);
          if (globalIdentifier(node.callee.object, "Object") && method === "values")
            mapItems(node, [], new Set()).forEach((value) => inspect(value, seen));
          if (["map", "flatMap"].includes(method)) {
            for (const fn of values(node.arguments[0]).filter((value) =>
              functionTypes.has(value.type),
            ))
              returnValues(fn).forEach((value) => inspect(value, seen));
          }
          if (
            [
              "join",
              "concat",
              "toUpperCase",
              "toLowerCase",
              "trim",
              "replace",
              "replaceAll",
            ].includes(method)
          ) {
            inspect(node.callee.object, seen);
            node.arguments.forEach((value) => inspect(value, seen));
          }
        }
      }
    }
    return {
      TaggedTemplateExpression: (node) => {
        if (isTemplate(node)) templates.push(node);
      },
      CallExpression: (node) => calls.push(node),
      Property: (node) => {
        if (textProperties.has(key(node))) properties.push(node.value);
      },
      AssignmentExpression: (node) => {
        if (textProperties.has(key(node.left))) assignments.push(node.right);
      },
      NewExpression: (node) => {
        if (
          ["Error", "TypeError", "RangeError", "DOMException"].some((name) =>
            globalIdentifier(node.callee, name),
          )
        )
          constructors.push(node.arguments[0]);
      },
      "Program:exit"() {
        for (const call of calls) {
          for (const fn of values(call.callee, new Set(), false).filter((value) =>
            functionTypes.has(value.type),
          )) {
            if (!callers.has(fn)) callers.set(fn, []);
            callers.get(fn).push(call);
          }
          if (
            call.callee.type === "MemberExpression" &&
            ["map", "flatMap", "forEach"].includes(key(call.callee))
          ) {
            for (const fn of values(call.arguments[0], new Set(), false).filter((value) =>
              functionTypes.has(value.type),
            )) {
              if (!mappedCallbacks.has(fn)) mappedCallbacks.set(fn, []);
              mappedCallbacks.get(fn).push(call.callee.object);
            }
          }
          if (litDirective(call.callee, "repeat")) {
            for (const fn of values(call.arguments.at(-1), new Set(), false).filter((value) =>
              functionTypes.has(value.type),
            )) {
              if (!mappedCallbacks.has(fn)) mappedCallbacks.set(fn, []);
              mappedCallbacks.get(fn).push(call.arguments[0]);
            }
          }
        }
        [...properties, ...assignments, ...constructors].forEach((node) => inspect(node));
        templates.forEach(inspectTemplate);
        for (const call of calls) {
          if (isH(call.callee)) {
            const child = call.arguments[2] ?? call.arguments[1];
            // In h(selector, data), an object is VNode data, not visible text.
            values(child)
              .filter((value) => value.type !== "ObjectExpression")
              .forEach((value) => inspect(value));
            if (
              values(call.arguments[0]).some(
                (selector) =>
                  selector.type === "Literal" && /^input(?:[.#]|$)/.test(selector.value),
              )
            ) {
              const types = ["attrs", "props"].flatMap((group) =>
                project(call.arguments[1], [group, "type"], new Set()),
              );
              if (
                types.some((type) =>
                  values(type).some(
                    (value) =>
                      value.type === "Literal" &&
                      ["button", "submit", "reset"].includes(value.value),
                  ),
                )
              ) {
                for (const group of ["attrs", "props"])
                  project(call.arguments[1], [group, "value"], new Set()).forEach((value) =>
                    inspect(value),
                  );
              }
            }
          }
          const spec = imported(call.callee);
          for (const helper of importedHelpers)
            if (spec?.module === helper.module && spec.name === helper.name) {
              for (const index of helper.arguments) inspect(call.arguments[index]);
            }
          if (
            ["alert", "confirm", "prompt"].some((name) => globalIdentifier(call.callee, name)) ||
            (call.callee.type === "MemberExpression" &&
              ["fillText", "strokeText"].includes(key(call.callee)))
          )
            inspect(call.arguments[0]);
          if (call.callee.type === "MemberExpression") {
            const method = key(call.callee);
            if (["setAttribute", "setAttributeNS"].includes(method)) {
              const offset = method === "setAttributeNS" ? 1 : 0;
              if (
                values(call.arguments[offset]).some(
                  (value) => value.type === "Literal" && textProperties.has(value.value),
                )
              )
                inspect(call.arguments[offset + 1]);
            }
            if (
              globalIdentifier(call.callee.object, "window") &&
              ["alert", "confirm", "prompt"].includes(method)
            )
              inspect(call.arguments[0]);
            if (globalIdentifier(call.callee.object, "document") && method === "createTextNode")
              inspect(call.arguments[0]);
          }
        }
      },
    };
  },
};
