/**
 * Build-time AST indexer.
 *
 * Walks the project's source files and extracts the raw data needed to build
 * the owner graph:
 *   - component definitions (function/arrow with JSX return, PascalCase name)
 *   - JSX component instantiation callsites
 *   - style imports (.css, .module.css, .scss)
 *   - className string literals / tailwind tokens
 *   - text literals in JSX
 *   - event handler bindings (onClick={fn})
 *
 * Uses the TypeScript compiler API so it handles TSX, JSX, TS, and JS.
 */

import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export interface ComponentDef {
  id: string               // "src/Foo.tsx#Foo"
  name: string
  file: string             // workspace-relative
  line: number
  col: number
  exportKind: 'default' | 'named' | 'none'
}

export interface ComponentInstantiation {
  /** The component being instantiated (PascalCase name) */
  componentName: string
  /** File where the instantiation lives */
  file: string
  line: number
  col: number
  /** props as a flat name→value map (string literals only) */
  classNames: string[]
}

export interface StyleImport {
  /** workspace-relative path to the importing component file */
  fromFile: string
  /** workspace-relative path to the style file */
  toFile: string
}

export interface TextLiteral {
  id: string               // "src/Foo.tsx#12:4"
  file: string
  line: number
  col: number
  value: string
  /** owning component name if determinable */
  ownerComponent: string | null
}

export interface EventHandlerRef {
  /** event name, e.g. "onClick" */
  event: string
  /** handler identifier name if a named function was passed */
  handlerName: string | null
  file: string
  line: number
  col: number
  ownerComponent: string | null
}

export interface IndexResult {
  /** workspace-relative path → ComponentDef[] */
  componentDefs: Map<string, ComponentDef[]>
  /** workspace-relative path → ComponentInstantiation[] */
  instantiations: Map<string, ComponentInstantiation[]>
  /** file → files it imports (for import graph) */
  importGraph: Map<string, Set<string>>
  styleImports: StyleImport[]
  textLiterals: TextLiteral[]
  eventHandlers: EventHandlerRef[]
  /** stable hash of all indexed files for graph invalidation */
  buildId: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STYLE_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less', '.styl'])
const EVENT_PROPS = new Set(['onClick', 'onChange', 'onSubmit', 'onKeyDown', 'onKeyUp', 'onFocus', 'onBlur', 'onMouseEnter', 'onMouseLeave'])

function isPascalCase(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name)
}

function nodeId(file: string, line: number, col: number): string {
  return `${file}#${line}:${col}`
}

function componentDefId(file: string, name: string): string {
  return `${file}#${name}`
}

// ─── File indexer ─────────────────────────────────────────────────────────────

function indexFile(
  sourceFile: ts.SourceFile,
  relPath: string,
  workspaceRoot: string,
  result: Omit<IndexResult, 'buildId'>
): void {
  const defs = result.componentDefs.get(relPath) ?? []
  const insts = result.instantiations.get(relPath) ?? []
  const imports = result.importGraph.get(relPath) ?? new Set<string>()

  /** Name of the component currently being visited (for attribution) */
  let currentComponent: string | null = null

  function getPos(node: ts.Node): { line: number; col: number } {
    const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    return { line: pos.line + 1, col: pos.character }
  }

  function resolveImportPath(importPath: string): string | null {
    // Only resolve relative imports
    if (!importPath.startsWith('.')) return null
    const dir = path.dirname(path.join(workspaceRoot, relPath))
    const resolved = path.resolve(dir, importPath)
    const rel = path.relative(workspaceRoot, resolved).replace(/\\/g, '/')
    return rel
  }

  // ── Component definition detection ────────────────────────────────────────

  function isJsxReturningFunction(node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression): boolean {
    // Walk the function body looking for a JSX return
    let found = false
    function walk(n: ts.Node) {
      if (found) return
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
        found = true
        return
      }
      ts.forEachChild(n, walk)
    }
    if (node.body) walk(node.body)
    return found
  }

  function tryRegisterComponentDef(name: string, node: ts.Node, exportKind: 'default' | 'named' | 'none') {
    if (!isPascalCase(name)) return
    const { line, col } = getPos(node)
    defs.push({
      id: componentDefId(relPath, name),
      name,
      file: relPath,
      line,
      col,
      exportKind,
    })
  }

  // ── Main visitor ──────────────────────────────────────────────────────────

  function visit(node: ts.Node): void {
    // ── Named function component: function PlanCard() { return <div> }
    if (ts.isFunctionDeclaration(node) && node.name && isPascalCase(node.name.text)) {
      if (isJsxReturningFunction(node)) {
        const exportKind = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
          ? (node.modifiers.some(m => m.kind === ts.SyntaxKind.DefaultKeyword) ? 'default' : 'named')
          : 'none'
        tryRegisterComponentDef(node.name.text, node, exportKind)
        const prev = currentComponent
        currentComponent = node.name.text
        ts.forEachChild(node, visit)
        currentComponent = prev
        return
      }
    }

    // ── Arrow / const component: const PlanCard = () => <div>
    if (ts.isVariableStatement(node)) {
      const exportKind = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
        ? 'named'
        : 'none'
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue
        const name = decl.name.text
        if (!isPascalCase(name)) continue
        const init = decl.initializer
        if (!init) continue
        const isFnLike = ts.isArrowFunction(init) || ts.isFunctionExpression(init)
        if (isFnLike && isJsxReturningFunction(init as ts.ArrowFunction)) {
          tryRegisterComponentDef(name, decl, exportKind)
          const prev = currentComponent
          currentComponent = name
          ts.forEachChild(node, visit)
          currentComponent = prev
          return
        }
      }
    }

    // ── JSX component instantiation: <PlanCard .../>
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile)
      if (isPascalCase(tagName)) {
        const { line, col } = getPos(node)
        const classNames = extractClassNames(node.attributes, sourceFile)
        insts.push({ componentName: tagName, file: relPath, line, col, classNames })
      }
      // className extraction for DOM elements
      if (!isPascalCase(tagName)) {
        const classNames = extractClassNames(node.attributes, sourceFile)
        if (classNames.length && currentComponent) {
          // attribute-level class names recorded on instantiation as well
          const { line, col } = getPos(node)
          insts.push({ componentName: '', file: relPath, line, col, classNames })
        }
      }
      // Event handlers
      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr)) continue
        const attrName = attr.name.getText(sourceFile)
        if (!EVENT_PROPS.has(attrName)) continue
        const { line, col } = getPos(attr)
        let handlerName: string | null = null
        if (attr.initializer && ts.isJsxExpression(attr.initializer)) {
          const expr = attr.initializer.expression
          if (expr && ts.isIdentifier(expr)) handlerName = expr.text
        }
        result.eventHandlers.push({ event: attrName, handlerName, file: relPath, line, col, ownerComponent: currentComponent })
      }
    }

    // ── JSX text children
    if (ts.isJsxText(node)) {
      const value = node.text.trim()
      if (value.length > 0 && value.length < 200) {
        const { line, col } = getPos(node)
        result.textLiterals.push({ id: nodeId(relPath, line, col), file: relPath, line, col, value, ownerComponent: currentComponent })
      }
    }

    // ── Import declarations
    if (ts.isImportDeclaration(node)) {
      const specifier = (node.moduleSpecifier as ts.StringLiteral).text
      const ext = path.extname(specifier)

      if (STYLE_EXTENSIONS.has(ext)) {
        const toFile = resolveImportPath(specifier)
        if (toFile) {
          result.styleImports.push({ fromFile: relPath, toFile })
        }
      } else if (specifier.startsWith('.')) {
        const toFile = resolveImportPath(specifier)
        if (toFile) imports.add(toFile)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  if (defs.length) result.componentDefs.set(relPath, defs)
  if (insts.length) result.instantiations.set(relPath, insts)
  if (imports.size) result.importGraph.set(relPath, imports)
}

function extractClassNames(attrs: ts.JsxAttributes, sourceFile: ts.SourceFile): string[] {
  const names: string[] = []
  for (const attr of attrs.properties) {
    if (!ts.isJsxAttribute(attr)) continue
    const name = attr.name.getText(sourceFile)
    if (name !== 'className' && name !== 'class') continue
    if (!attr.initializer) continue

    // className="foo bar"
    if (ts.isStringLiteral(attr.initializer)) {
      names.push(...attr.initializer.text.split(/\s+/).filter(Boolean))
    }
    // className={...}
    if (ts.isJsxExpression(attr.initializer)) {
      const expr = attr.initializer.expression
      if (!expr) continue
      // className={"foo bar"}
      if (ts.isStringLiteral(expr)) {
        names.push(...expr.text.split(/\s+/).filter(Boolean))
      }
      // className={styles.foo} or className={styles['foo']}
      if (ts.isPropertyAccessExpression(expr)) {
        names.push(expr.name.text)
      }
      // className={cn("foo", styles.bar, isActive && "active")}
      if (ts.isCallExpression(expr)) {
        extractClassNamesFromCallArgs(expr.arguments, names, sourceFile)
      }
      // className={`foo ${styles.bar}`} template literal — best-effort
      if (ts.isTemplateExpression(expr)) {
        // extract the head text
        names.push(...expr.head.text.split(/\s+/).filter(Boolean))
      }
    }
  }
  return [...new Set(names)]
}

function extractClassNamesFromCallArgs(
  args: ts.NodeArray<ts.Expression>,
  out: string[],
  sourceFile: ts.SourceFile
): void {
  for (const arg of args) {
    if (ts.isStringLiteral(arg)) {
      out.push(...arg.text.split(/\s+/).filter(Boolean))
    } else if (ts.isPropertyAccessExpression(arg)) {
      out.push(arg.name.text)
    } else if (ts.isCallExpression(arg)) {
      extractClassNamesFromCallArgs(arg.arguments, out, sourceFile)
    } else if (ts.isBinaryExpression(arg) && arg.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      // isActive && "active"
      if (ts.isStringLiteral(arg.right)) out.push(arg.right.text)
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

const JSX_EXTENSIONS = new Set(['.tsx', '.jsx', '.ts', '.js'])

export async function indexProject(
  workspaceRoot: string,
  include: string[],
  exclude: string[]
): Promise<IndexResult> {
  const result: Omit<IndexResult, 'buildId'> = {
    componentDefs: new Map(),
    instantiations: new Map(),
    importGraph: new Map(),
    styleImports: [],
    textLiterals: [],
    eventHandlers: [],
  }

  const files = collectFiles(workspaceRoot, include, exclude)
  const hasher = crypto.createHash('sha256')

  for (const absPath of files) {
    const relPath = path.relative(workspaceRoot, absPath).replace(/\\/g, '/')
    const ext = path.extname(absPath)
    if (!JSX_EXTENSIONS.has(ext)) continue

    let code: string
    try {
      code = fs.readFileSync(absPath, 'utf-8')
    } catch {
      continue
    }

    hasher.update(relPath + code)

    const scriptKind =
      ext === '.tsx' ? ts.ScriptKind.TSX :
      ext === '.jsx' ? ts.ScriptKind.JSX :
      ext === '.ts'  ? ts.ScriptKind.TS  :
      ts.ScriptKind.JS

    const sourceFile = ts.createSourceFile(absPath, code, ts.ScriptTarget.Latest, true, scriptKind)
    indexFile(sourceFile, relPath, workspaceRoot, result)
  }

  return { ...result, buildId: hasher.digest('hex').slice(0, 16) }
}

export async function indexSingleFile(
  absPath: string,
  workspaceRoot: string,
  existing: IndexResult
): Promise<void> {
  const relPath = path.relative(workspaceRoot, absPath).replace(/\\/g, '/')
  const ext = path.extname(absPath)
  if (!JSX_EXTENSIONS.has(ext)) return

  let code: string
  try {
    code = fs.readFileSync(absPath, 'utf-8')
  } catch {
    return
  }

  // Remove stale data for this file
  existing.componentDefs.delete(relPath)
  existing.instantiations.delete(relPath)
  existing.importGraph.delete(relPath)
  existing.styleImports = existing.styleImports.filter(s => s.fromFile !== relPath)
  existing.textLiterals = existing.textLiterals.filter(t => t.file !== relPath)
  existing.eventHandlers = existing.eventHandlers.filter(e => e.file !== relPath)

  const scriptKind =
    ext === '.tsx' ? ts.ScriptKind.TSX :
    ext === '.jsx' ? ts.ScriptKind.JSX :
    ext === '.ts'  ? ts.ScriptKind.TS  :
    ts.ScriptKind.JS

  const sourceFile = ts.createSourceFile(absPath, code, ts.ScriptTarget.Latest, true, scriptKind)
  indexFile(sourceFile, relPath, workspaceRoot, existing)
}

// ─── File collection (simple recursive walk, respects include/exclude globs) ──

function collectFiles(root: string, include: string[], exclude: string[]): string[] {
  const results: string[] = []
  // Simple include-based walk: treat include patterns as subdirectory prefixes
  const dirs = include.map(p => path.join(root, p.replace(/\/\*\*.*$/, '')))

  for (const dir of dirs) {
    walkDir(dir, root, exclude, results)
  }
  return results
}

function isExcluded(relPath: string, exclude: string[]): boolean {
  return exclude.some(pattern => {
    // "**/*.test.*" → match suffix after "**"
    if (pattern.startsWith('**')) {
      const suffix = pattern.slice(2)
      return relPath.endsWith(suffix) || relPath.includes(suffix)
    }
    // "node_modules/**" → match prefix before "/**"
    if (pattern.endsWith('/**')) {
      return relPath.startsWith(pattern.slice(0, -3))
    }
    return relPath.includes(pattern.replace(/\*/g, ''))
  })
}

function walkDir(dir: string, root: string, exclude: string[], out: string[]): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    const rel = path.relative(root, full).replace(/\\/g, '/')
    if (isExcluded(rel, exclude)) continue
    if (entry.isDirectory()) {
      walkDir(full, root, exclude, out)
    } else {
      out.push(full)
    }
  }
}
