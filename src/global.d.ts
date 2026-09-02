export {};

declare global {
  var __noteTaskBotLassoGen: number | undefined;
  var __noteTaskBotCaptureGen: number | undefined;
  var __noteTaskBotCaptureStartedGen: number | undefined;
  var __noteTaskBotLastCaptureFp: string | undefined;
  var __noteTaskBotOnCaptureRequest: ((gen?: number) => void) | null | undefined;
  var __noteTaskBotNavigate: ((name: string) => void) | null | undefined;
  var __noteTaskBotParentIds: Record<string, string> | undefined;
  var __noteTaskBotLassoCachePromise: Promise<unknown> | null | undefined;
  var __noteTaskBotLassoSnapshot: unknown;
  var __noteTaskBotButtonId: number | null | undefined;
}
