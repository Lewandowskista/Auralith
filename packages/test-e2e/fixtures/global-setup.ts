import { join } from 'path'
import { mkdirSync, rmSync, existsSync } from 'fs'

// Isolated user-data directory for each test run
const testDataDir = join(__dirname, '..', '.test-data')

export default async function globalSetup(): Promise<void> {
  if (existsSync(testDataDir)) {
    rmSync(testDataDir, { recursive: true, force: true })
  }
  mkdirSync(testDataDir, { recursive: true })
  process.env['AURALITH_TEST_DATA_DIR'] = testDataDir
}
