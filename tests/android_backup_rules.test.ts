import { describe, expect, test } from '@jest/globals'
import fs from 'fs'

const root = 'credo-ui/mobile/android/app/src/main'

describe('Android device-bound session backup policy', () => {
  test('manifest wires backup rules for pre-Android-12 and newer backup/transfer', () => {
    const manifest = fs.readFileSync(`${root}/AndroidManifest.xml`, 'utf8')
    expect(manifest).toContain('android:fullBackupContent="@xml/backup_rules"')
    expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"')
  })

  test('legacy backup excludes mixed WebView storage and private registration data', () => {
    const rules = fs.readFileSync(`${root}/res/xml/backup_rules.xml`, 'utf8')
    for (const domain of ['root', 'file', 'database', 'sharedpref', 'external']) {
      expect(rules).toContain(`<exclude domain="${domain}" path="." />`)
    }
  })

  test.each(['cloud-backup', 'device-transfer'])('%s cannot restore stale device/session metadata', (section) => {
    const rules = fs.readFileSync(`${root}/res/xml/data_extraction_rules.xml`, 'utf8')
    const block = rules.split(`<${section}>`)[1]?.split(`</${section}>`)[0]
    expect(block).toBeDefined()
    for (const domain of ['root', 'file', 'database', 'sharedpref', 'external']) {
      expect(block).toContain(`<exclude domain="${domain}" path="." />`)
    }
  })
})
