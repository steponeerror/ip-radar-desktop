/** warming(503)重查退避:上轮间隔 ×2,封顶 30s —— 对齐 server 前端 recheck 语义(UI 层轮询用)。 */
export function nextPollDelay(prevMs: number): number {
  return Math.min(prevMs * 2, 30_000);
}
