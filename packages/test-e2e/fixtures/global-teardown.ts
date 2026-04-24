import { join } from 'path'
import { rmSync, existsSync } from 'fs'

const testDataDir = join(__dirname, '..', '.test-data')

export default async function globalTeardown(): Promise<void> {
  if (existsSync(testDataDir)) {
    rmSync(testDataDir, { recursive: true, force: true })
  }
}
