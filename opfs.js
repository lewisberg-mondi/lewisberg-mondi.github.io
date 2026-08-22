/** Kanairoex OPFS (Origin Private File System) helper — educational stub + real when available */
const OPFSStore = (() => {
  async function status() {
    const supported = !!(navigator.storage && navigator.storage.getDirectory);
    let root = null;
    if (supported) {
      try { root = await navigator.storage.getDirectory(); } catch (e) {}
    }
    return { supported: !!supported, hasRoot: !!root, note: "OPFS for private large files" };
  }
  async function write(name, data) {
    if (!navigator.storage?.getDirectory) throw new Error("OPFS not supported");
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(name, { create: true });
    const w = await handle.createWritable();
    await w.write(typeof data === "string" ? data : data);
    await w.close();
    return true;
  }
  async function read(name) {
    if (!navigator.storage?.getDirectory) throw new Error("OPFS not supported");
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(name);
    const file = await handle.getFile();
    return await file.text();
  }
  return { status, write, read };
})();
if (typeof window !== "undefined") window.OPFSStore = OPFSStore;
