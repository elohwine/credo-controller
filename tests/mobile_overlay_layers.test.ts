import { describe, expect, test } from '@jest/globals'
import fs from 'fs'
import path from 'path'
import ts from 'typescript'

describe('mobile job dialog layering', () => {
  test.each([
    'pages/finance.tsx',
    'components/shared/StageActorTimeline.tsx',
    'components/shared/JobAuditTrailPanel.tsx',
  ])('%s uses the shared Modal layer above job drawers', (relativePath) => {
    const filename = path.join(process.cwd(), 'credo-ui/mobile', relativePath)
    const source = ts.createSourceFile(
      filename,
      fs.readFileSync(filename, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    let modalCount = 0
    function visit(node: ts.Node): void {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        node.tagName.getText(source) === 'Modal'
      ) {
        modalCount++
        // Local layers previously put checkpoint dialogs behind their parent drawer and trapped focus.
        expect(
          node.attributes.properties.some(
            (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'zIndex',
          ),
        ).toBe(false)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    expect(modalCount).toBeGreaterThan(0)
  })
})
