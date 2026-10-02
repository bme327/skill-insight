import * as vscode from 'vscode'

export type FilterOrigin = 'sidebar' | 'panel'

export interface FilterChange {
  readonly value: string
  readonly origin: FilterOrigin
}

/** Shared so the sidebar and graph-panel catalogs show the same filter. */
export class CatalogFilterStore implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<FilterChange>()
  private current = ''

  readonly onDidChange = this.changed.event

  value(): string {
    return this.current
  }

  set(value: string, origin: FilterOrigin): void {
    if (value === this.current) return
    this.current = value
    this.changed.fire({ value, origin })
  }

  dispose(): void {
    this.changed.dispose()
  }
}
