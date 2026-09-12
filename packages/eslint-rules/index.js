// Focused ccstate conventions, independent of any external application or React.
const isFunction = node => ["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration"].includes(node.type);
const rule = (description, create) => ({ meta: { type: "problem", docs: { description }, schema: [], messages: { invalid: description } }, create });

function primitives(context) {
  const names = new Map();
  return {
    import(node) {
      if (node.source.value !== "ccstate") return;
      for (const specifier of node.specifiers) {
        if (specifier.type === "ImportSpecifier") names.set(specifier.local.name, specifier.imported.name);
        if (specifier.type === "ImportNamespaceSpecifier") names.set(specifier.local.name, "*");
      }
    },
    kind(node) {
      if (node?.type !== "CallExpression") return undefined;
      const callee = node.callee;
      const name = callee.type === "Identifier" ? callee.name : callee.type === "MemberExpression" ? callee.object.name : undefined;
      if (!name) return undefined;
      let scope = context.sourceCode.getScope(node);
      while (scope) {
        const variable = scope.set.get(name);
        if (variable) {
          if (!variable.defs.some(def => def.type === "ImportBinding")) return undefined;
          const imported = names.get(name);
          return imported === "*" && callee.type === "MemberExpression" ? (callee.computed ? callee.property.value : callee.property.name) : imported;
        }
        scope = scope.upper;
      }
      return undefined;
    },
  };
}
export const rules = {
  "signal-boundaries": rule("Keep ccstate units dollar-suffixed, writable state private, and command graphs outside commands/views.", context => {
    const units = primitives(context);
    return {
      ImportDeclaration: node => units.import(node),
      CallExpression(node) {
        const kind = units.kind(node);
        if (!["state", "computed", "command"].includes(kind)) return;
        if (node.parent.type !== "VariableDeclarator" || node.parent.id.type !== "Identifier" || !node.parent.id.name.endsWith("$")) context.report({ node, messageId: "invalid" });
        if (kind === "state" && node.parent.parent?.parent?.type === "ExportNamedDeclaration") context.report({ node, messageId: "invalid" });
        for (let parent = node.parent; parent; parent = parent.parent) {
          if (units.kind(parent) === "command") { context.report({ node, messageId: "invalid" }); break; }
        }
        if (/[/\\]view\.[jt]s$/.test(context.filename)) context.report({ node, messageId: "invalid" });
      },
      ExportNamedDeclaration(node) {
        for (const specifier of node.specifiers) {
          const variable = context.sourceCode.getScope(node).set.get(specifier.local.name);
          if (variable?.defs.some(def => units.kind(def.node.init) === "state")) context.report({ node: specifier, messageId: "invalid" });
        }
      },
      ExportDefaultDeclaration(node) {
        if (node.declaration.type !== "Identifier") return;
        const variable = context.sourceCode.getScope(node).set.get(node.declaration.name);
        if (variable?.defs.some(def => units.kind(def.node.init) === "state")) context.report({ node, messageId: "invalid" });
      },
    };
  }),
  "accessor-scope": rule("Call ccstate get/set directly in their callback; do not pass, alias, store or capture accessors.", context => {
    const units = primitives(context);
    return {
      ImportDeclaration: node => units.import(node),
      CallExpression(node) {
        const kind = units.kind(node), callback = node.arguments[0];
        if (!["command", "computed"].includes(kind) || !callback || !isFunction(callback)) return;
        const param = callback.params[0];
        if (param && kind === "command" && param.type !== "ObjectPattern") {
          context.report({ node: param, messageId: "invalid" }); return;
        }
        const names = kind === "computed" ? [param?.name] : param?.properties?.filter(p => ["get", "set"].includes(p.key?.name)).map(p => p.value.name) ?? [];
        for (const variable of context.sourceCode.getDeclaredVariables(callback)) {
          if (!names.includes(variable.name)) continue;
          for (const ref of variable.references) {
            const id = ref.identifier;
            let ancestor = id.parent;
            const direct = ancestor.type === "CallExpression" && ancestor.callee === id;
            while (ancestor && ancestor !== callback && !isFunction(ancestor)) ancestor = ancestor.parent;
            if (!direct || ancestor !== callback) context.report({ node: id, messageId: "invalid" });
          }
        }
      },
    };
  }),
  "async-ownership": rule("Async ccstate commands need a final AbortSignal and a cancellation check immediately after every await; lifecycle owns controllers.", context => {
    const units = primitives(context);
    function owner(node) {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (isFunction(parent)) return units.kind(parent.parent) === "command" ? parent : undefined;
      }
    }
    return {
      ImportDeclaration: node => units.import(node),
      NewExpression(node) {
        if (node.callee.name === "AbortController" && !/[/\\]app\.ts$/.test(context.filename)) context.report({ node, messageId: "invalid" });
      },
      CallExpression(node) {
        const callback = node.arguments[0];
        if (units.kind(node) !== "command" || !callback?.async) return;
        const last = callback.params.at(-1);
        if (last?.type !== "Identifier" || last.typeAnnotation?.typeAnnotation?.typeName?.name !== "AbortSignal") context.report({ node, messageId: "invalid" });
      },
      AwaitExpression(node) {
        const callback = owner(node);
        if (!callback) return;
        let statement = node;
        while (statement.parent && statement.parent.type !== "BlockStatement") statement = statement.parent;
        const block = statement.parent?.body;
        const next = Array.isArray(block) ? block[block.indexOf(statement) + 1] : undefined;
        const call = next?.expression;
        if (call?.type !== "CallExpression" || call.callee.type !== "MemberExpression" || call.callee.object.name !== callback.params.at(-1)?.name || call.callee.property.name !== "throwIfAborted") context.report({ node, messageId: "invalid" });
      },
    };
  }),
};
export default { rules };
