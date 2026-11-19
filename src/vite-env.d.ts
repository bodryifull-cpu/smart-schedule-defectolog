/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module 'mammoth/mammoth.browser' {
  export interface MammothResult {
    value: string
    messages: unknown[]
  }
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>
  const mammoth: { convertToHtml: typeof convertToHtml }
  export default mammoth
}
