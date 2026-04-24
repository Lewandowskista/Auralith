import type Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'

export function loadVecExtension(sqlite: Database.Database): void {
  sqliteVec.load(sqlite)
}
