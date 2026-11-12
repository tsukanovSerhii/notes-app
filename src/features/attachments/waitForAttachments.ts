/**
 * Resolves once every attachment picture inside `root` has been read from
 * storage and decoded (or after `timeoutMs`), so a PDF is not drawn while
 * images are still empty boxes.
 */
export async function waitForAttachments(root: HTMLElement, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const pending = () =>
    root.querySelector("[data-attachment-loading]") !== null ||
    [...root.querySelectorAll("img")].some((img) => !img.complete);
  while (pending() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
