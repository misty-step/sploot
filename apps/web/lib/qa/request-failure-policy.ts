export function assertNoBrowserRequestFailures(failures: string[]): void {
  if (failures.length > 0) {
    throw new Error(`browser request failures (${failures.length}):\n${failures.join('\n')}`);
  }
}
